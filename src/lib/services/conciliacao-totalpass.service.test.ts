import { readFileSync } from "node:fs"
import { join } from "node:path"
import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => {
  const tx = {
    $executeRaw: vi.fn(),
    aluno: { findMany: vi.fn(), findUnique: vi.fn(), findFirst: vi.fn(), update: vi.fn() },
    checkin: { findMany: vi.fn(), findUnique: vi.fn() },
    importacao: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
    registroImportado: {
      findFirst: vi.fn(),
      create: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
    },
  }
  return { tx, db: { $transaction: vi.fn() }, registrarLog: vi.fn() }
})
vi.mock("@/lib/db", () => ({ db: mocks.db }))
vi.mock("@/lib/services/auditoria.service", () => ({ registrarLog: mocks.registrarLog }))

import {
  identificarAlunoTotalpass,
  importarCsvConciliacao,
  importarPlanilhasConciliacao,
  normalizarLinha,
  parseCsv,
  resolverConciliacaoManual,
} from "./conciliacao.service"

const conteudo = readFileSync(
  join(import.meta.dirname, "__fixtures__", "conciliacao", "totalpass-mensal.csv"),
  "utf8",
)
const arquivo = { arquivo: "agosto.csv", tipoArquivo: "csv" as const, conteudo }
const params = {
  plataforma: "TOTALPASS" as const,
  competencia: "2026-08",
  arquivos: [arquivo],
  autorId: "gestor-1",
}
const aluno = {
  id: "aluno-1",
  cpf: "012.345.678-90",
  idExterno: "TP-INDEPENDENTE",
  telefone: null,
  tipo: "TOTALPASS",
  usuario: { nome: "Pessoa Exemplo", email: "exemplo@example.test" },
}

beforeEach(() => {
  vi.resetAllMocks()
  mocks.db.$transaction.mockImplementation(async (fn) => fn(mocks.tx))
  mocks.tx.aluno.findMany.mockResolvedValue([aluno])
  mocks.tx.aluno.findUnique.mockResolvedValue(aluno)
  mocks.tx.aluno.findFirst.mockResolvedValue(null)
  mocks.tx.importacao.findFirst.mockResolvedValue(null)
  mocks.tx.registroImportado.findFirst.mockResolvedValue(null)
  mocks.tx.registroImportado.findMany.mockResolvedValue([])
  mocks.tx.importacao.create.mockImplementation(async ({ data }) => ({
    id: "importacao-1",
    ...data,
  }))
  mocks.tx.registroImportado.create.mockImplementation(async ({ data }) => ({
    id: "registro-1",
    ...data,
  }))
})

describe("relatório mensal TotalPass", () => {
  it("interpreta formato realista com BOM, decimais, CPF com zero, aspas e campo multilinha", () => {
    const linhas = parseCsv(conteudo.replace(/\n/g, "\r\n"))
    expect(linhas).toHaveLength(2)
    expect(linhas[0].Endereço).toBe("Rua de Teste; 1")
    expect(linhas[1].Complemento).toBe('Ap. "A"')
    expect(normalizarLinha(linhas[0])).toMatchObject({
      cpf: "01234567890",
      valorRepasse: 120.5,
      idExterno: null,
      dataReferencia: null,
      totalCheckins: null,
    })
  })
  it("concilia por CPF sem check-in nem ID TotalPass e reserva receita de não cadastrado", async () => {
    const [resultado] = await importarPlanilhasConciliacao(params)
    expect(resultado).toMatchObject({
      competencia: "2026-08",
      resumoMensal: true,
      unidadeExternaId: "TOTALPASS_MENSAL",
      unidadeExternaNome: "Relatório mensal TotalPass",
      totalLinhas: 2,
      totalConciliados: 1,
      totalNaoConciliados: 1,
    })
    expect(mocks.tx.aluno.findMany.mock.calls[0][0].where).toEqual({ tipo: "TOTALPASS" })
    expect(mocks.tx.checkin.findMany).not.toHaveBeenCalled()
    expect(mocks.tx.aluno.update).not.toHaveBeenCalled()
    expect(mocks.tx.registroImportado.create.mock.calls[0][0].data).toMatchObject({
      alunoId: "aluno-1",
      statusConciliacao: "CONCILIADO",
      idExterno: null,
      cpf: "01234567890",
      checkinVinculadoId: null,
      valorRepasse: 120.5,
    })
    expect(mocks.tx.registroImportado.create.mock.calls[1][0].data).toMatchObject({
      alunoId: null,
      statusConciliacao: "ALUNO_NAO_IDENTIFICADO",
      valorRepasse: 0,
    })
    expect(mocks.registrarLog).toHaveBeenCalledTimes(1)
  })
  it("exige competência explícita, sem deduzi-la do nome do arquivo", async () => {
    await expect(
      importarCsvConciliacao({
        plataforma: "TOTALPASS",
        arquivo: "Agosto-2026.csv",
        conteudo,
        autorId: "gestor-1",
      }),
    ).rejects.toThrow("mês de referência")
    expect(mocks.db.$transaction).not.toHaveBeenCalled()
  })
  it("recusa relatório TotalPass selecionado como Wellhub", async () => {
    await expect(
      importarPlanilhasConciliacao({ ...params, plataforma: "WELLHUB" }),
    ).rejects.toThrow("pertence ao TotalPass")
  })
  it("recusa cabeçalho mensal incompleto", async () => {
    await expect(
      importarPlanilhasConciliacao({
        ...params,
        arquivos: [{ ...arquivo, conteudo: "Nome;Valor líquido total\nPessoa;50" }],
      }),
    ).rejects.toThrow("colunas obrigatórias")
  })
  it.each([
    "",
    "-1",
    "abc",
    "100000000",
    "1.001",
    "Infinity",
  ])("recusa valor inválido %s antes de escrita", async (valor) => {
    await expect(
      importarPlanilhasConciliacao({
        ...params,
        arquivos: [
          {
            ...arquivo,
            conteudo: `Nome;Documento;Email;Valor líquido total\nPessoa;01234567890;exemplo@example.test;${valor}`,
          },
        ],
      }),
    ).rejects.toThrow("inválida")
    expect(mocks.db.$transaction).not.toHaveBeenCalled()
  })
  it.each([
    "",
    "11111111111",
    "1234567890",
    "01234567891",
  ])("recusa CPF inválido %s sem mutação", async (cpf) => {
    await expect(
      importarPlanilhasConciliacao({
        ...params,
        arquivos: [
          {
            ...arquivo,
            conteudo: `Nome;Documento;Email;Valor líquido total\nPessoa;${cpf};exemplo@example.test;50`,
          },
        ],
      }),
    ).rejects.toThrow("inválida")
    expect(mocks.db.$transaction).not.toHaveBeenCalled()
  })
  it("recusa CPF repetido mesmo com nome/email/valor diferentes", async () => {
    await expect(
      importarPlanilhasConciliacao({
        ...params,
        arquivos: [{ ...arquivo, conteudo: conteudo.replace("12345678909", "012.345.678-90") }],
      }),
    ).rejects.toThrow("mesmo CPF")
    expect(mocks.db.$transaction).not.toHaveBeenCalled()
  })
  it("recusa reenvio com outro nome de arquivo na mesma competência", async () => {
    mocks.tx.importacao.findFirst.mockImplementation(async ({ where }) =>
      where.unidadeExternaId ? { id: "existente" } : null,
    )
    await expect(
      importarPlanilhasConciliacao({
        ...params,
        arquivos: [{ ...arquivo, arquivo: "renomeado.csv" }],
      }),
    ).rejects.toThrow("já foi importado")
    expect(mocks.tx.importacao.create).not.toHaveBeenCalled()
  })
  it("recusa dois relatórios TotalPass no mesmo lote com rollback", async () => {
    let criado = false
    mocks.tx.importacao.create.mockImplementation(async ({ data }) => {
      criado = true
      return { id: "primeira", ...data }
    })
    mocks.tx.importacao.findFirst.mockImplementation(async ({ where }) =>
      where.unidadeExternaId && criado ? { id: "existente" } : null,
    )
    await expect(
      importarPlanilhasConciliacao({
        ...params,
        arquivos: [arquivo, { ...arquivo, arquivo: "segundo.csv" }],
      }),
    ).rejects.toThrow("um arquivo por mês")
    expect(mocks.db.$transaction).toHaveBeenCalledTimes(1)
  })
  it("preserva pendência quando CPF conflita com vínculo histórico", async () => {
    mocks.tx.registroImportado.findFirst.mockResolvedValue({ id: "historico" })
    await importarPlanilhasConciliacao(params)
    expect(mocks.tx.registroImportado.create.mock.calls[0][0].data.alunoId).toBeNull()
  })
  it("não associa dois CPFs diferentes ao mesmo cadastro sem CPF", async () => {
    mocks.tx.aluno.findMany.mockResolvedValue([{ ...aluno, cpf: null }])
    await importarPlanilhasConciliacao({
      ...params,
      arquivos: [
        {
          ...arquivo,
          conteudo: conteudo.replace("semcadastro@example.test", "exemplo@example.test"),
        },
      ],
    })
    expect(mocks.tx.registroImportado.create.mock.calls[0][0].data.alunoId).toBe("aluno-1")
    expect(mocks.tx.registroImportado.create.mock.calls[1][0].data.alunoId).toBeNull()
  })
  it("reconhece em nova competência CPF associado manualmente sem CPF no cadastro", async () => {
    mocks.tx.aluno.findMany.mockResolvedValue([
      { ...aluno, cpf: null, usuario: { nome: "Nome abreviado", email: "cadastro@example.test" } },
    ])
    mocks.tx.registroImportado.findMany.mockImplementation(async ({ where }) =>
      where.cpf === "01234567890" ? [{ alunoId: "aluno-1" }] : [],
    )
    await importarPlanilhasConciliacao({ ...params, competencia: "2026-09" })
    expect(mocks.tx.registroImportado.create.mock.calls[0][0].data.alunoId).toBe("aluno-1")
    expect(mocks.tx.registroImportado.findMany.mock.calls[0][0].where.importacao).toEqual({
      plataforma: "TOTALPASS",
      resumoMensal: true,
    })
    expect(mocks.tx.aluno.update).not.toHaveBeenCalled()
  })
  it.each([
    null,
    "01234567890",
  ])("nega associação se CPF pertence a outro cadastro de qualquer tipo, CPF candidato %s", async (cpf) => {
    mocks.tx.aluno.findMany.mockResolvedValue([{ ...aluno, cpf }])
    mocks.tx.aluno.findFirst.mockResolvedValue({ id: "mensalista-outro" })
    await importarPlanilhasConciliacao(params)
    expect(mocks.tx.registroImportado.create.mock.calls[0][0].data.alunoId).toBeNull()
    expect(mocks.tx.aluno.findFirst.mock.calls[0][0].where).toEqual({
      cpf: { in: ["01234567890", "012.345.678-90"] },
      id: { not: "aluno-1" },
    })
  })
  it("histórico nunca vence CPF contraditório no cadastro", async () => {
    mocks.tx.aluno.findMany.mockResolvedValue([{ ...aluno, cpf: "23456789092" }])
    mocks.tx.registroImportado.findMany.mockResolvedValue([{ alunoId: "aluno-1" }])
    await importarPlanilhasConciliacao(params)
    expect(mocks.tx.registroImportado.create.mock.calls[0][0].data.alunoId).toBeNull()
  })
  it("histórico associado a dois alunos mantém a receita pendente", async () => {
    mocks.tx.aluno.findMany.mockResolvedValue([{ ...aluno, cpf: null }])
    mocks.tx.registroImportado.findMany.mockResolvedValue([
      { alunoId: "aluno-1" },
      { alunoId: "aluno-2" },
    ])
    await importarPlanilhasConciliacao(params)
    expect(mocks.tx.registroImportado.create.mock.calls[0][0].data.alunoId).toBeNull()
  })
  it("bloqueia mensal se já há diários TotalPass no mês", async () => {
    mocks.tx.importacao.findFirst.mockImplementation(async ({ where }) =>
      where.plataforma === "TOTALPASS" && where.resumoMensal === false ? { id: "diario" } : null,
    )
    await expect(importarPlanilhasConciliacao(params)).rejects.toThrow(
      "registros diários TotalPass",
    )
    expect(mocks.tx.$executeRaw).toHaveBeenCalledTimes(1)
    expect(mocks.tx.importacao.create).not.toHaveBeenCalled()
  })
  it("bloqueia diário pela data real se já há resumo TotalPass naquele mês", async () => {
    mocks.tx.importacao.findFirst.mockResolvedValue({ id: "mensal" })
    await expect(
      importarCsvConciliacao({
        plataforma: "TOTALPASS",
        arquivo: "diario.csv",
        conteudo: "nome,data,valor\nPessoa Exemplo,10/08/2026,50",
        autorId: "gestor-1",
      }),
    ).rejects.toThrow("registros diários TotalPass")
    expect(mocks.tx.importacao.findFirst.mock.calls[0][0].where).toMatchObject({
      plataforma: "TOTALPASS",
      resumoMensal: true,
      competencia: { in: ["2026-08"] },
    })
  })
  it.each([
    'nome,email\n"Pessoa,exemplo@example.test',
    "nome,email\nPessoa,exemplo@example.test,extra",
    "nome,nome\nPessoa,Pessoa",
  ])("rejeita CSV estruturalmente inválido", (csv) => {
    expect(() => parseCsv(csv)).toThrow()
  })
})

describe("identificação TotalPass", () => {
  const cadastrado = { ...aluno, ...aluno.usuario }
  it("CPF prevalece sobre nome/email divergentes e ID externo não relacionado", () => {
    expect(
      identificarAlunoTotalpass(
        normalizarLinha({
          Documento: "01234567890",
          Nome: "Outro nome",
          Email: "outro@example.test",
        }),
        [cadastrado],
      )?.id,
    ).toBe("aluno-1")
  })
  it("usa email único se cadastro não tem CPF", () => {
    expect(
      identificarAlunoTotalpass(
        normalizarLinha({ Documento: "01234567890", Email: "EXEMPLO@example.test" }),
        [{ ...cadastrado, cpf: null }],
      )?.id,
    ).toBe("aluno-1")
  })
  it("nome exato permite fallback sem CPF contraditório", () => {
    expect(
      identificarAlunoTotalpass(
        normalizarLinha({
          Documento: "01234567890",
          Nome: "Pessoa Exemplo",
          Email: "novo@example.test",
        }),
        [{ ...cadastrado, cpf: null }],
      )?.id,
    ).toBe("aluno-1")
  })
  it("nega fallback por email quando o nome exato aponta para outro cadastro", () => {
    expect(
      identificarAlunoTotalpass(
        normalizarLinha({
          Documento: "12345678909",
          Nome: "Outra Pessoa",
          Email: "exemplo@example.test",
        }),
        [
          { ...cadastrado, cpf: null },
          {
            ...cadastrado,
            id: "aluno-2",
            cpf: null,
            nome: "Outra Pessoa",
            email: "outro@example.test",
          },
        ],
      ),
    ).toBeNull()
  })
  it("não usa email ou nome se CPF cadastrado é outro", () => {
    expect(
      identificarAlunoTotalpass(
        normalizarLinha({
          Documento: "12345678909",
          Nome: "Pessoa Exemplo",
          Email: "exemplo@example.test",
        }),
        [cadastrado],
      ),
    ).toBeNull()
  })
  it("não escolhe homônimo nem email duplicado", () => {
    const dois = [
      { ...cadastrado, cpf: null },
      { ...cadastrado, id: "aluno-2", cpf: null },
    ]
    expect(
      identificarAlunoTotalpass(
        normalizarLinha({ Documento: "12345678909", Nome: "Pessoa Exemplo" }),
        dois,
      ),
    ).toBeNull()
    expect(
      identificarAlunoTotalpass(
        normalizarLinha({ Documento: "12345678909", Email: "exemplo@example.test" }),
        dois,
      ),
    ).toBeNull()
  })
  it("não ignora email que aponta para outra pessoa com CPF incompatível ao usar nome", () => {
    expect(
      identificarAlunoTotalpass(
        normalizarLinha({
          Documento: "12345678909",
          Nome: "Pessoa Exemplo",
          Email: "outro@example.test",
        }),
        [
          { ...cadastrado, cpf: null },
          { ...cadastrado, id: "outro", nome: "Outra Pessoa", email: "outro@example.test" },
        ],
      ),
    ).toBeNull()
  })
})

describe("resolução manual TotalPass", () => {
  const resolver = () =>
    resolverConciliacaoManual({
      registroId: "registro-1",
      alunoId: "aluno-1",
      status: "CONCILIADO",
      autorId: "gestor-1",
    })
  beforeEach(() => {
    mocks.tx.registroImportado.findUnique.mockResolvedValue({
      id: "registro-1",
      importacaoId: "importacao-1",
      cpf: "01234567890",
      idExterno: null,
      alunoId: null,
      checkinVinculadoId: null,
      statusConciliacao: "ALUNO_NAO_IDENTIFICADO",
      importacao: { plataforma: "TOTALPASS", resumoMensal: true, competencia: "2026-08" },
    })
    mocks.tx.registroImportado.update.mockImplementation(async ({ data }) => ({
      id: "registro-1",
      ...data,
    }))
    mocks.tx.registroImportado.findMany.mockImplementation(async ({ select }) =>
      select ? [{ statusConciliacao: "CONCILIADO" }] : [],
    )
  })
  it("vincula por CPF e mês com auditoria sem alterar ID externo, cadastro ou exigir checkin", async () => {
    expect((await resolver()).ok).toBe(true)
    expect(mocks.tx.aluno.update).not.toHaveBeenCalled()
    expect(mocks.tx.checkin.findUnique).not.toHaveBeenCalled()
    expect(mocks.tx.registroImportado.findMany.mock.calls[0][0].where).toMatchObject({
      cpf: "01234567890",
      importacao: { plataforma: "TOTALPASS", competencia: "2026-08", resumoMensal: true },
    })
    expect(mocks.tx.registroImportado.update.mock.calls[0][0].data).toMatchObject({
      alunoId: "aluno-1",
      checkinVinculadoId: null,
      statusConciliacao: "CONCILIADO",
    })
    expect(mocks.registrarLog).toHaveBeenCalledTimes(1)
  })
  it("recusa aluno com CPF diferente", async () => {
    mocks.tx.aluno.findUnique.mockResolvedValue({ ...aluno, cpf: "12345678909" })
    expect((await resolver()).ok).toBe(false)
    expect(mocks.tx.registroImportado.update).not.toHaveBeenCalled()
  })
  it("recusa CPF já cadastrado para outro aluno", async () => {
    mocks.tx.aluno.findFirst.mockResolvedValue({ id: "outro" })
    expect((await resolver()).ok).toBe(false)
    expect(mocks.tx.registroImportado.update).not.toHaveBeenCalled()
  })
  it("recusa conflito histórico mesmo sem CPF no cadastro", async () => {
    mocks.tx.aluno.findUnique.mockResolvedValue({ ...aluno, cpf: null })
    mocks.tx.registroImportado.findFirst.mockResolvedValue({ id: "historico" })
    expect((await resolver()).ok).toBe(false)
    expect(mocks.tx.registroImportado.update).not.toHaveBeenCalled()
  })
})

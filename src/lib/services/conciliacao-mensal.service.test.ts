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
  identificarAluno,
  importarCsvConciliacao,
  importarPlanilhasConciliacao,
  normalizarLinha,
  parseXlsx,
  resolverConciliacaoManual,
} from "./conciliacao.service"

const fixture = (unidade: number) =>
  readFileSync(
    join(import.meta.dirname, "__fixtures__", "conciliacao", `wellhub-unidade-${unidade}.xlsx`),
  )
const arquivo = (unidade: number) => ({
  arquivo: `wellhub-${unidade}.xlsx`,
  conteudo: fixture(unidade),
  tipoArquivo: "xlsx" as const,
})
const aluno = {
  id: "aluno-1",
  cpf: null,
  telefone: null,
  idExterno: "1234567890123",
  tipo: "WELLHUB",
  usuario: { nome: "Pessoa Exemplo", email: "exemplo@example.test" },
}
const params = {
  plataforma: "WELLHUB" as const,
  competencia: "2026-08",
  arquivos: [arquivo(101), arquivo(202)],
  autorId: "gestor-1",
}

beforeEach(() => {
  vi.resetAllMocks()
  mocks.db.$transaction.mockImplementation(async (fn) => fn(mocks.tx))
  mocks.tx.aluno.findMany.mockResolvedValue([aluno])
  mocks.tx.checkin.findMany.mockResolvedValue([])
  mocks.tx.importacao.findFirst.mockResolvedValue(null)
  mocks.tx.registroImportado.findFirst.mockResolvedValue(null)
  mocks.tx.importacao.create.mockImplementation(async ({ data }) => ({
    id: `importacao-${data.unidadeExternaId}`,
    ...data,
  }))
  mocks.tx.registroImportado.create.mockImplementation(async ({ data }) => ({
    id: "registro-1",
    ...data,
  }))
})

describe("resumo mensal realista Wellhub", () => {
  it("localiza cabeçalho na linha 10, preserva ID numérico longo, check-ins e zero", async () => {
    const linhas = await parseXlsx(fixture(101))
    expect(linhas).toHaveLength(2)
    expect(normalizarLinha(linhas[0])).toMatchObject({
      idExterno: "1234567890123",
      nome: "Pessoa Exemplo",
      totalCheckins: 7,
      valorRepasse: 120,
      dataReferencia: null,
    })
    expect(normalizarLinha(linhas[1])).toMatchObject({ totalCheckins: 0, valorRepasse: 0 })
  })

  it.each([
    ["R$ 1.234,56", 1234.56],
    ["R$ 0,00", 0],
    ["12.50", 12.5],
    ["1,50", 1.5],
  ])("interpreta pagamento %s", (texto, valor) => {
    expect(normalizarLinha({ "Pagamento total": texto }).valorRepasse).toBe(valor)
  })

  it("importa duas contas na mesma transação e conserva R$ 200 de um aluno sem check-in", async () => {
    const resultado = await importarPlanilhasConciliacao(params)
    expect(resultado).toHaveLength(2)
    expect(mocks.db.$transaction).toHaveBeenCalledTimes(1)
    expect(mocks.tx.checkin.findMany).not.toHaveBeenCalled()
    expect(mocks.tx.aluno.findMany.mock.calls[0][0].where).toEqual({ tipo: "WELLHUB" })
    const linhas = mocks.tx.registroImportado.create.mock.calls.map(([args]) => args.data)
    expect(
      linhas
        .filter((linha) => linha.alunoId === "aluno-1")
        .reduce((total, linha) => total + linha.valorRepasse, 0),
    ).toBe(200)
    expect(
      linhas
        .filter((linha) => linha.alunoId === "aluno-1")
        .every(
          (linha) => linha.statusConciliacao === "CONCILIADO" && linha.checkinVinculadoId === null,
        ),
    ).toBe(true)
    expect(linhas[1].statusConciliacao).toBe("ALUNO_NAO_IDENTIFICADO")
    expect(resultado.every((item) => item.competencia === "2026-08" && item.resumoMensal)).toBe(
      true,
    )
    expect(mocks.registrarLog).toHaveBeenCalledTimes(2)
  })

  it("competência informada prevalece sobre mês do preâmbulo", async () => {
    const resultado = await importarPlanilhasConciliacao({ ...params, competencia: "2026-09" })
    expect(resultado[0].competencia).toBe("2026-09")
  })

  it.each([
    "",
    "2026-00",
    "2026-13",
    "26-08",
    "0000-01",
  ])("rejeita competência %s antes de escrita", async (competencia) => {
    await expect(importarPlanilhasConciliacao({ ...params, competencia })).rejects.toThrow(
      "mês de referência",
    )
    expect(mocks.db.$transaction).not.toHaveBeenCalled()
  })

  it("rejeita segundo arquivo inválido antes de iniciar transação", async () => {
    await expect(
      importarPlanilhasConciliacao({
        ...params,
        arquivos: [
          arquivo(101),
          { arquivo: "invalido.csv", conteudo: "qualquer;coisa\nx;y", tipoArquivo: "csv" },
        ],
      }),
    ).rejects.toThrow("inválida")
    expect(mocks.db.$transaction).not.toHaveBeenCalled()
    expect(mocks.tx.importacao.create).not.toHaveBeenCalled()
  })

  it("rejeita reenvio da mesma unidade/mês sem duplicar receita", async () => {
    mocks.tx.importacao.findFirst.mockImplementation(async ({ where }) =>
      where.unidadeExternaId ? { id: "ja-importado" } : null,
    )
    await expect(importarPlanilhasConciliacao(params)).rejects.toThrow("já foi importada")
    expect(mocks.tx.importacao.create).not.toHaveBeenCalled()
    expect(mocks.tx.$executeRaw).toHaveBeenCalled()
  })

  it("falha no segundo arquivo propaga para rollback da transação de ambos", async () => {
    mocks.tx.importacao.create
      .mockResolvedValueOnce({
        id: "primeira",
        plataforma: "WELLHUB",
        arquivo: "primeira.xlsx",
        totalLinhas: 2,
        totalConciliados: 1,
        totalNaoConciliados: 1,
        totalDivergencias: 0,
      })
      .mockRejectedValueOnce(new Error("falha persistência"))
    await expect(importarPlanilhasConciliacao(params)).rejects.toThrow("falha persistência")
    expect(mocks.db.$transaction).toHaveBeenCalledTimes(1)
    expect(mocks.tx.importacao.create).toHaveBeenCalledTimes(2)
    expect(mocks.registrarLog).toHaveBeenCalledTimes(1)
  })

  it("rejeita a mesma conta enviada duas vezes no lote", async () => {
    let consultasUnidade = 0
    mocks.tx.importacao.findFirst.mockImplementation(async ({ where }) => {
      if (!where.unidadeExternaId) return null
      return consultasUnidade++ === 0 ? null : { id: "primeira" }
    })
    await expect(
      importarPlanilhasConciliacao({ ...params, arquivos: [arquivo(101), arquivo(101)] }),
    ).rejects.toThrow("já foi importada")
    expect(mocks.db.$transaction).toHaveBeenCalledTimes(1)
    expect(mocks.tx.importacao.create).toHaveBeenCalledTimes(1)
  })

  it.each([
    ["-1", "1"],
    ["texto", "1"],
    ["100000000", "1"],
    ["1.001", "1"],
    ["10", "1.5"],
    ["10", "-1"],
    ["10", "2147483648"],
    ["", "1"],
    ["10", ""],
  ])("rejeita pagamento %s / check-ins %s sem escrita", async (pagamento, checkins) => {
    const conteudo = `ID da unidade;Unidade;Visitante;ID do Wellhub;Total de check-ins;Pagamento total\n101;Unidade Teste;Pessoa Exemplo;1234567890123;${checkins};${pagamento}`
    await expect(
      importarPlanilhasConciliacao({
        ...params,
        arquivos: [{ arquivo: "resumo.csv", tipoArquivo: "csv", conteudo }],
      }),
    ).rejects.toThrow("inválida")
    expect(mocks.db.$transaction).not.toHaveBeenCalled()
  })

  it("mantém pendente ID diferente de um histórico já vinculado ao aluno", async () => {
    mocks.tx.aluno.findMany.mockResolvedValue([{ ...aluno, idExterno: null }])
    mocks.tx.registroImportado.findFirst.mockResolvedValue({ id: "conflito" })
    await importarPlanilhasConciliacao({ ...params, arquivos: [arquivo(101)] })
    expect(mocks.tx.registroImportado.create.mock.calls[0][0].data).toMatchObject({
      alunoId: null,
      statusConciliacao: "ALUNO_NAO_IDENTIFICADO",
    })
  })

  it("não soma IDs distintos ao mesmo aluno sem ID cadastrado dentro do arquivo", async () => {
    mocks.tx.aluno.findMany.mockResolvedValue([{ ...aluno, idExterno: null }])
    const conteudo =
      "ID da unidade;Unidade;Visitante;ID do Wellhub;Total de check-ins;Pagamento total\n101;Unidade Teste;Pessoa Exemplo;1234567890123;1;100\n101;Unidade Teste;Pessoa Exemplo;1234567890124;1;100"
    await importarPlanilhasConciliacao({
      ...params,
      arquivos: [{ arquivo: "resumo.csv", tipoArquivo: "csv", conteudo }],
    })
    expect(mocks.tx.registroImportado.create.mock.calls[0][0].data.statusConciliacao).toBe(
      "CONCILIADO",
    )
    expect(mocks.tx.registroImportado.create.mock.calls[1][0].data).toMatchObject({
      alunoId: null,
      statusConciliacao: "ALUNO_NAO_IDENTIFICADO",
    })
  })

  it("mantém CSV diário Totalpass com conciliação de presença", async () => {
    mocks.tx.checkin.findMany.mockResolvedValue([
      { id: "checkin-1", status: "VALIDO", aula: { inicio: new Date("2026-08-10T18:00:00Z") } },
    ])
    await importarPlanilhasConciliacao({
      ...params,
      plataforma: "TOTALPASS",
      arquivos: [
        {
          arquivo: "acessos.csv",
          tipoArquivo: "csv",
          conteudo: "nome,data,repasse\nPessoa Exemplo,10/08/2026,12",
        },
      ],
    })
    expect(mocks.tx.checkin.findMany).toHaveBeenCalledTimes(1)
    expect(mocks.tx.registroImportado.create.mock.calls[0][0].data).toMatchObject({
      statusConciliacao: "CONCILIADO",
      checkinVinculadoId: "checkin-1",
      valorRepasse: 12,
    })
  })
})

describe("identificação segura", () => {
  const cadastrado = {
    id: "aluno-1",
    cpf: null,
    telefone: null,
    idExterno: "1234567890123",
    nome: "Pessoa Exemplo",
    email: "exemplo@example.test",
  }
  it("prioriza ID Wellhub sobre nome divergente", () => {
    expect(
      identificarAluno(
        normalizarLinha({ "ID do Wellhub": cadastrado.idExterno, Visitante: "Outro nome" }),
        [cadastrado],
      )?.id,
    ).toBe("aluno-1")
  })
  it("não escolhe primeiro homônimo", () => {
    expect(
      identificarAluno(normalizarLinha({ Visitante: "Pessoa Exemplo", "ID do Wellhub": "999" }), [
        { ...cadastrado, idExterno: null },
        { ...cadastrado, id: "aluno-2", idExterno: null },
      ]),
    ).toBeNull()
  })
  it("nega fallback quando ID cadastrado conflita", () => {
    expect(
      identificarAluno(normalizarLinha({ Visitante: "Pessoa Exemplo", "ID do Wellhub": "999" }), [
        cadastrado,
      ]),
    ).toBeNull()
  })
  it("não aproxima grafias diferentes", () => {
    expect(
      identificarAluno(normalizarLinha({ Visitante: "Pesoa Exemplo" }), [cadastrado]),
    ).toBeNull()
  })
})

describe("resolução mensal manual", () => {
  beforeEach(() => {
    mocks.tx.registroImportado.findUnique.mockResolvedValue({
      id: "registro-1",
      importacaoId: "importacao-1",
      idExterno: "1234567890123",
      alunoId: null,
      checkinVinculadoId: null,
      statusConciliacao: "ALUNO_NAO_IDENTIFICADO",
      importacao: { plataforma: "WELLHUB", resumoMensal: true, competencia: "2026-08" },
    })
    mocks.tx.aluno.findUnique.mockResolvedValue({ ...aluno, idExterno: null })
    mocks.tx.aluno.findFirst.mockResolvedValue(null)
    mocks.tx.registroImportado.update.mockImplementation(async ({ data }) => ({
      id: "registro-1",
      ...data,
    }))
    mocks.tx.registroImportado.findMany.mockImplementation(async ({ select }) =>
      select ? [{ statusConciliacao: "CONCILIADO" }] : [],
    )
  })
  it("vincula ID com auditoria e concilia sem exigir presença", async () => {
    const resultado = await resolverConciliacaoManual({
      registroId: "registro-1",
      alunoId: "aluno-1",
      status: "CONCILIADO",
      autorId: "gestor-1",
    })
    expect(resultado.ok).toBe(true)
    expect(mocks.tx.aluno.update).toHaveBeenCalledWith({
      where: { id: "aluno-1" },
      data: { idExterno: "1234567890123" },
    })
    expect(mocks.tx.checkin.findUnique).not.toHaveBeenCalled()
    expect(mocks.registrarLog).toHaveBeenCalledTimes(2)
    expect(mocks.tx.importacao.update).toHaveBeenCalledWith({
      where: { id: "importacao-1" },
      data: { totalConciliados: 1, totalNaoConciliados: 0, totalDivergencias: 0 },
    })
  })
  it("resolve mesmo ID nas duas contas do mês e audita cada linha", async () => {
    mocks.tx.registroImportado.findMany.mockImplementation(async ({ select }) =>
      select
        ? [{ statusConciliacao: "CONCILIADO" }]
        : [
            {
              id: "registro-2",
              importacaoId: "importacao-2",
              idExterno: "1234567890123",
              alunoId: null,
              checkinVinculadoId: null,
              statusConciliacao: "ALUNO_NAO_IDENTIFICADO",
            },
          ],
    )
    const resultado = await resolverConciliacaoManual({
      registroId: "registro-1",
      alunoId: "aluno-1",
      status: "CONCILIADO",
      autorId: "gestor-1",
    })
    expect(resultado.ok).toBe(true)
    expect(mocks.tx.registroImportado.update).toHaveBeenCalledTimes(2)
    expect(mocks.tx.importacao.update).toHaveBeenCalledTimes(2)
    expect(mocks.registrarLog).toHaveBeenCalledTimes(3)
    expect(mocks.tx.registroImportado.findMany.mock.calls[0][0].where).toMatchObject({
      idExterno: "1234567890123",
      importacao: { plataforma: "WELLHUB", resumoMensal: true, competencia: "2026-08" },
      statusConciliacao: { in: ["ALUNO_NAO_IDENTIFICADO", "PENDENTE"] },
    })
  })

  it("nega ID usado por outro aluno sem mutação", async () => {
    mocks.tx.aluno.findFirst.mockResolvedValue({ id: "outro" })
    const resultado = await resolverConciliacaoManual({
      registroId: "registro-1",
      alunoId: "aluno-1",
      status: "CONCILIADO",
      autorId: "gestor-1",
    })
    expect(resultado.ok).toBe(false)
    expect(mocks.tx.aluno.update).not.toHaveBeenCalled()
    expect(mocks.tx.registroImportado.update).not.toHaveBeenCalled()
  })
  it("nega ID historicamente associado a outro aluno mesmo sem vínculo no cadastro", async () => {
    mocks.tx.registroImportado.findFirst.mockResolvedValueOnce({ id: "historico-outro-aluno" })
    const resultado = await resolverConciliacaoManual({
      registroId: "registro-1",
      alunoId: "aluno-1",
      status: "CONCILIADO",
      autorId: "gestor-1",
    })
    expect(resultado.ok).toBe(false)
    expect(mocks.tx.aluno.update).not.toHaveBeenCalled()
    expect(mocks.tx.registroImportado.update).not.toHaveBeenCalled()
  })
  it("nega aluno de outra plataforma", async () => {
    mocks.tx.aluno.findUnique.mockResolvedValue({ ...aluno, tipo: "TOTALPASS" })
    expect(
      (
        await resolverConciliacaoManual({
          registroId: "registro-1",
          alunoId: "aluno-1",
          status: "CONCILIADO",
          autorId: "gestor-1",
        })
      ).ok,
    ).toBe(false)
    expect(mocks.tx.registroImportado.update).not.toHaveBeenCalled()
  })
})

describe("exclusão mútua entre resumo e acessos Wellhub", () => {
  const diario = {
    arquivo: "acessos.csv",
    tipoArquivo: "csv" as const,
    conteudo: "nome,data,repasse\nPessoa Exemplo,10/08/2026,50",
  }

  it("impede resumo quando já há diários legados no mês, usando intervalo da academia", async () => {
    mocks.tx.importacao.findFirst.mockImplementation(async ({ where }) =>
      where.resumoMensal === false ? { id: "diario-sem-competencia" } : null,
    )
    await expect(
      importarPlanilhasConciliacao({ ...params, arquivos: [arquivo(101)] }),
    ).rejects.toThrow("Não misture resumo mensal e registros diários Wellhub na mesma competência")
    expect(mocks.tx.importacao.findFirst.mock.calls[0][0].where).toEqual({
      plataforma: "WELLHUB",
      resumoMensal: false,
      registros: {
        some: {
          dataReferencia: {
            gte: new Date("2026-08-01T03:00:00Z"),
            lt: new Date("2026-09-01T03:00:00Z"),
          },
        },
      },
    })
    expect(mocks.tx.$executeRaw).toHaveBeenCalledTimes(1)
    expect(mocks.tx.importacao.create).not.toHaveBeenCalled()
  })

  it("impede diário legado sem competência quando já existe resumo mensal", async () => {
    mocks.tx.importacao.findFirst.mockResolvedValue({ id: "resumo-mensal" })
    await expect(
      importarCsvConciliacao({
        plataforma: "WELLHUB",
        arquivo: diario.arquivo,
        conteudo: diario.conteudo,
        autorId: "gestor-1",
      }),
    ).rejects.toThrow("Não misture resumo mensal")
    expect(mocks.tx.importacao.findFirst.mock.calls[0][0].where).toEqual({
      plataforma: "WELLHUB",
      resumoMensal: true,
      competencia: { in: ["2026-08"] },
    })
    expect(mocks.tx.$executeRaw).toHaveBeenCalledTimes(1)
    expect(mocks.tx.importacao.create).not.toHaveBeenCalled()
  })

  it("avalia todos os meses reais dos acessos mesmo se o mês informado for diferente", async () => {
    mocks.tx.importacao.findFirst.mockResolvedValue({ id: "resumo-agosto" })
    await expect(
      importarPlanilhasConciliacao({
        ...params,
        competencia: "2026-09",
        arquivos: [
          {
            ...diario,
            conteudo:
              "nome,data,repasse\nPessoa Exemplo,31/07/2026,50\nPessoa Exemplo,01/08/2026,50",
          },
        ],
      }),
    ).rejects.toThrow("Não misture resumo mensal")
    expect(mocks.tx.importacao.findFirst.mock.calls[0][0].where.competencia).toEqual({
      in: ["2026-07", "2026-08"],
    })
  })

  it.each([
    true,
    false,
  ])("rejeita lote misto atomicamente (resumo primeiro: %s)", async (resumoPrimeiro) => {
    let importadoMensal = false
    let importadoDiario = false
    let gravacoesConfirmadas = 0
    mocks.tx.importacao.create.mockImplementation(async ({ data }) => {
      if (data.resumoMensal) importadoMensal = true
      else importadoDiario = true
      return { id: "primeira", ...data }
    })
    mocks.tx.importacao.findFirst.mockImplementation(async ({ where }) => {
      if (where.resumoMensal === true && importadoMensal) return { id: "resumo" }
      if (where.resumoMensal === false && importadoDiario) return { id: "diario" }
      return null
    })
    mocks.db.$transaction.mockImplementation(async (fn) => {
      const result = await fn(mocks.tx)
      gravacoesConfirmadas = mocks.tx.importacao.create.mock.calls.length
      return result
    })
    await expect(
      importarPlanilhasConciliacao({
        ...params,
        arquivos: resumoPrimeiro ? [arquivo(101), diario] : [diario, arquivo(101)],
      }),
    ).rejects.toThrow("Não misture resumo mensal")
    expect(mocks.db.$transaction).toHaveBeenCalledTimes(1)
    expect(mocks.tx.importacao.create).toHaveBeenCalledTimes(1)
    expect(gravacoesConfirmadas).toBe(0)
  })

  it("permite diário Totalpass mesmo havendo resumo Wellhub", async () => {
    mocks.tx.importacao.findFirst.mockImplementation(async ({ where }) =>
      where.plataforma === "WELLHUB" ? { id: "resumo-wellhub" } : null,
    )
    await importarPlanilhasConciliacao({ ...params, plataforma: "TOTALPASS", arquivos: [diario] })
    expect(mocks.tx.importacao.findFirst.mock.calls[0][0].where.plataforma).toBe("TOTALPASS")
    expect(mocks.tx.$executeRaw).toHaveBeenCalledTimes(1)
    expect(mocks.tx.importacao.create).toHaveBeenCalledTimes(1)
  })
})

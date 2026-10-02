import { Prisma } from "@prisma/client"
import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => {
  const tx = {
    usuario: { findFirst: vi.fn() },
    aluno: { findFirst: vi.fn() },
    solicitacaoMatricula: { findFirst: vi.fn(), create: vi.fn() },
    modalidade: { findMany: vi.fn() },
    plano: { findFirst: vi.fn() },
    matriculaFamilia: { create: vi.fn(), update: vi.fn() },
  }
  return {
    tx,
    db: {
      $transaction: vi.fn(async (callback: (cliente: typeof tx) => unknown) => callback(tx)),
      matriculaFamilia: { findUnique: vi.fn() },
    },
    gerarHashSenha: vi.fn(),
    registrarLog: vi.fn(),
  }
})

vi.mock("@/lib/db", () => ({ db: mocks.db }))
vi.mock("@/lib/auth/senha", () => ({ gerarHashSenha: mocks.gerarHashSenha }))
vi.mock("@/lib/services/auditoria.service", () => ({ registrarLog: mocks.registrarLog }))

import {
  obterMatriculaFamiliaPublica,
  solicitarMatriculaFamilia,
} from "./matricula-familia.service"

const pessoa = (indice: number) => ({
  nome: `Pessoa ${indice + 1}`,
  email: `pessoa${indice}@exemplo.com`,
  cpf: ["52998224725", "11144477735", "12345678909", "98765432100"][indice],
  senha: "123456",
  confirmarSenha: "123456",
  modalidadeIds: [indice % 2 ? "boxe" : "jiu"],
  tipoPagamento: "MENSALISTA",
  beneficioAtivoDeclarado: false,
  aceiteDados: "on",
})

beforeEach(() => {
  vi.clearAllMocks()
  mocks.tx.usuario.findFirst.mockResolvedValue(null)
  mocks.tx.aluno.findFirst.mockResolvedValue(null)
  mocks.tx.solicitacaoMatricula.findFirst.mockResolvedValue(null)
  mocks.tx.plano.findFirst.mockResolvedValue({
    id: "familia",
    nome: "Valor unitario plano familia",
    valor: 90,
    periodicidade: "MENSAL",
  })
  mocks.tx.modalidade.findMany.mockResolvedValue([{ id: "jiu" }, { id: "boxe" }])
  mocks.tx.matriculaFamilia.create.mockResolvedValue({
    id: "grupo",
    tokenAcompanhamento: "token-grupo",
    criadoEm: new Date(),
  })
  mocks.tx.solicitacaoMatricula.create.mockImplementation(async ({ data }) => ({
    id: `solicitacao-${data.email}`,
    tokenAcompanhamento: `token-${data.email}`,
    ...data,
  }))
  mocks.gerarHashSenha.mockResolvedValue("hash-seguro")
  mocks.registrarLog.mockResolvedValue({ id: "log" })
  mocks.db.$transaction.mockImplementation(async (callback) => callback(mocks.tx))
})

describe("solicitarMatriculaFamilia", () => {
  it.each([
    [2, 180],
    [3, 270],
    [4, 360],
  ])("vincula %i pessoas ao mesmo grupo e plano unitário, total %i", async (quantidade, total) => {
    const resultado = await solicitarMatriculaFamilia({
      pessoas: Array.from({ length: quantidade }, (_, indice) => pessoa(indice)),
    })
    expect(resultado.ok).toBe(true)
    if (!resultado.ok) return
    expect(resultado.valorTotal).toBe(total)
    expect(resultado.valorUnitario).toBe(90)
    expect(resultado.solicitacoes).toHaveLength(quantidade)
    expect(mocks.db.$transaction).toHaveBeenCalledOnce()
    for (const solicitacao of resultado.solicitacoes) {
      expect(solicitacao).toMatchObject({
        planoId: "familia",
        matriculaFamiliaId: "grupo",
        tipoPagamento: "MENSALISTA",
        senhaHash: "hash-seguro",
      })
      expect(solicitacao).not.toHaveProperty("senha")
      expect(solicitacao).not.toHaveProperty("alunoId")
    }
    expect(mocks.tx.matriculaFamilia.update).toHaveBeenCalledWith({
      where: { id: "grupo" },
      data: { titularSolicitacaoId: resultado.solicitacoes[0].id },
    })
    expect(mocks.registrarLog).toHaveBeenCalledTimes(quantidade + 1)
    for (const chamada of mocks.registrarLog.mock.calls) expect(chamada[1]).toBe(mocks.tx)
  })

  it("rejeita grupo de uma pessoa na borda do serviço antes de qualquer gravação", async () => {
    expect((await solicitarMatriculaFamilia({ pessoas: [pessoa(0)] })).ok).toBe(false)
    expect(mocks.db.$transaction).not.toHaveBeenCalled()
    expect(mocks.gerarHashSenha).not.toHaveBeenCalled()
  })

  it.each([
    "usuario",
    "aluno",
    "solicitacaoMatricula",
  ] as const)("recusa conflito em %s antes de criar grupo", async (modelo) => {
    mocks.tx[modelo].findFirst.mockResolvedValue({ id: "existente" })
    expect((await solicitarMatriculaFamilia({ pessoas: [pessoa(0), pessoa(1)] })).ok).toBe(false)
    expect(mocks.tx.matriculaFamilia.create).not.toHaveBeenCalled()
    expect(mocks.tx.solicitacaoMatricula.create).not.toHaveBeenCalled()
  })

  it("recusa modalidade removida ou plano indisponível sem criar grupo", async () => {
    mocks.tx.modalidade.findMany.mockResolvedValue([{ id: "jiu" }])
    expect((await solicitarMatriculaFamilia({ pessoas: [pessoa(0), pessoa(1)] })).ok).toBe(false)
    expect(mocks.tx.matriculaFamilia.create).not.toHaveBeenCalled()
    mocks.tx.plano.findFirst.mockResolvedValue(null)
    expect((await solicitarMatriculaFamilia({ pessoas: [pessoa(0), pessoa(1)] })).ok).toBe(false)
    expect(mocks.tx.matriculaFamilia.create).not.toHaveBeenCalled()
  })

  it("deriva total do valor persistido do plano", async () => {
    mocks.tx.plano.findFirst.mockResolvedValue({
      id: "familia",
      nome: "Plano família",
      valor: 95.25,
    })
    const resultado = await solicitarMatriculaFamilia({ pessoas: [pessoa(0), pessoa(1)] })
    expect(resultado).toMatchObject({ ok: true, valorUnitario: 95.25, valorTotal: 190.5 })
  })

  it("aborta a transação completa quando a segunda solicitação falha", async () => {
    const falha = new Error("falha na segunda pessoa")
    mocks.tx.solicitacaoMatricula.create
      .mockImplementationOnce(async ({ data }) => ({ id: "primeira", ...data }))
      .mockRejectedValueOnce(falha)
    let concluida = false
    mocks.db.$transaction.mockImplementation(async (callback) => {
      const resultado = await callback(mocks.tx)
      concluida = true
      return resultado
    })
    await expect(solicitarMatriculaFamilia({ pessoas: [pessoa(0), pessoa(1)] })).rejects.toThrow(
      falha,
    )
    expect(concluida).toBe(false)
    expect(mocks.tx.matriculaFamilia.update).not.toHaveBeenCalled()
    expect(mocks.registrarLog).not.toHaveBeenCalledWith(
      expect.objectContaining({ entidade: "MatriculaFamilia" }),
      expect.anything(),
    )
  })

  it("converte colisão de unicidade concorrente em erro de matrícula", async () => {
    mocks.tx.solicitacaoMatricula.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("Duplicado", {
        code: "P2002",
        clientVersion: "6.19.3",
      }),
    )
    expect(await solicitarMatriculaFamilia({ pessoas: [pessoa(0), pessoa(1)] })).toMatchObject({
      ok: false,
      motivo: expect.stringContaining("Já existe"),
    })
  })
})

describe("obterMatriculaFamiliaPublica", () => {
  it("consulta pelo token compartilhável sem expor documentos, contato ou senha", async () => {
    await obterMatriculaFamiliaPublica("token-grupo")
    const consulta = mocks.db.matriculaFamilia.findUnique.mock.calls[0][0]
    expect(consulta.where).toEqual({ tokenAcompanhamento: "token-grupo" })
    const campos = consulta.select.pessoas.select
    for (const campo of [
      "email",
      "cpf",
      "senhaHash",
      "telefone",
      "restricoesMedicas",
      "endereco",
    ]) {
      expect(campos).not.toHaveProperty(campo)
    }
    expect(campos.cobrancasAsaas).toMatchObject({
      orderBy: [{ ativa: "desc" }, { geracao: "desc" }],
      take: 1,
    })
    expect(campos.cobrancasAsaas).not.toHaveProperty("where")
  })
})

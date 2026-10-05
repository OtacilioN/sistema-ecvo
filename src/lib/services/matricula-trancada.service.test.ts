import { Prisma } from "@prisma/client"
import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => {
  const tx = {
    $queryRaw: vi.fn(),
    aluno: { findUnique: vi.fn(), updateMany: vi.fn(), update: vi.fn() },
    alunoPlanoModalidade: { upsert: vi.fn() },
    plano: { findFirst: vi.fn() },
    mensalidade: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
  }
  return {
    tx,
    db: {
      acessoAulaAvulsa: { findMany: vi.fn() },
      $transaction: vi.fn(async (callback: (cliente: typeof tx) => unknown) => callback(tx)),
    },
    registrarLog: vi.fn(),
  }
})
vi.mock("@/lib/db", () => ({ db: mocks.db }))
vi.mock("@/lib/services/auditoria.service", () => ({ registrarLog: mocks.registrarLog }))

import {
  efetivarReativacaoMatricula,
  prepararMensalidadeReativacao,
  trancarAvulsosExpirados,
} from "./matricula-trancada.service"

const agora = new Date("2026-10-05T18:00:00Z")
const plano = {
  id: "plano-100",
  nome: "Uma modalidade",
  valor: new Prisma.Decimal(100),
  ativo: true,
  periodicidade: "MENSAL",
}
const modalidade = {
  id: "muay-thai",
  nome: "Muay Thai",
  valorRepasseProfessor: new Prisma.Decimal(60),
  turmas: [],
}
const aluno = {
  id: "aluno-1",
  usuarioId: "usuario-1",
  status: "TRANCADO",
  tipo: "AVULSO",
  planoId: null,
  plano: null,
  modalidadesPlano: [],
  solicitacaoMatricula: { modalidadePrincipal: modalidade },
}
const mensalidade = {
  id: "mensalidade-1",
  alunoId: aluno.id,
  planoId: plano.id,
  valor: plano.valor,
  status: "EM_ABERTO",
  reativacaoMatricula: true,
  reativadaEm: null,
  competencia: "2026-10",
  contratoPixAutomaticoId: null,
  repasseSnapshot: [
    {
      modalidadeId: modalidade.id,
      modalidadeNome: modalidade.nome,
      plataformaExterna: null,
      valorBase: 100,
      valorRepasseProfessor: 60,
      professorId: null,
      professorNome: "Sem professor",
    },
  ],
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.db.acessoAulaAvulsa.findMany.mockResolvedValue([])
  mocks.tx.aluno.findUnique.mockResolvedValue(aluno)
  mocks.tx.aluno.updateMany.mockResolvedValue({ count: 1 })
  mocks.tx.plano.findFirst.mockResolvedValue(plano)
  mocks.tx.mensalidade.findUnique.mockResolvedValue(null)
  mocks.tx.mensalidade.create.mockImplementation(({ data }) => ({ ...mensalidade, ...data }))
  mocks.tx.mensalidade.update.mockImplementation(({ data }) => ({ ...mensalidade, ...data }))
})

describe("trancamento de avulso vencido", () => {
  it("usa o limite exclusivo da semana e retira apenas avulsos operacionais sem plano", async () => {
    const limite = new Date("2026-09-28T03:00:00Z")
    mocks.db.acessoAulaAvulsa.findMany.mockResolvedValue([{ id: "acesso-1", alunoId: aluno.id }])
    mocks.tx.aluno.findUnique.mockResolvedValue({ status: "ATIVO" })
    expect(await trancarAvulsosExpirados({ agora: limite })).toEqual({ trancados: 1 })
    expect(mocks.db.acessoAulaAvulsa.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          prazoConversao: { lte: limite },
          aluno: { tipo: "AVULSO", planoId: null, status: { in: ["ATIVO", "INADIMPLENTE"] } },
        }),
      }),
    )
    expect(mocks.tx.aluno.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: "TRANCADO" } }),
    )
    expect(mocks.registrarLog).toHaveBeenCalledWith(
      expect.objectContaining({ acao: "STATUS_ALUNO", valorAntigo: { status: "ATIVO" } }),
      mocks.tx,
    )
  })

  it("não tranca nem audita quando o pagamento converteu o vínculo antes do lock", async () => {
    mocks.db.acessoAulaAvulsa.findMany.mockResolvedValue([{ id: "acesso-1", alunoId: aluno.id }])
    mocks.tx.aluno.updateMany.mockResolvedValue({ count: 0 })
    expect(await trancarAvulsosExpirados({ alunoId: aluno.id, agora })).toEqual({ trancados: 0 })
    expect(mocks.tx.aluno.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tipo: "AVULSO",
          planoId: null,
          acessosAulaAvulsa: {
            some: {
              id: "acesso-1",
              status: { in: ["ATIVO", "USADO"] },
              prazoConversao: { lte: agora },
            },
          },
        }),
      }),
    )
    expect(mocks.registrarLog).not.toHaveBeenCalled()
  })
})

describe("preparação da mensalidade de reativação", () => {
  it("cobra R$ 100 do avulso sem liberar ou contratar o plano e sem descontar R$ 20", async () => {
    const resultado = await prepararMensalidadeReativacao({
      alunoId: aluno.id,
      autorId: aluno.usuarioId,
      agora,
    })
    expect(resultado.ok).toBe(true)
    expect(mocks.tx.mensalidade.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        valor: plano.valor,
        reativacaoMatricula: true,
        planoId: plano.id,
        competencia: "2026-10",
        repasseSnapshot: [expect.objectContaining({ modalidadeId: modalidade.id })],
      }),
    })
    expect(mocks.tx.aluno.update).not.toHaveBeenCalled()
    expect(mocks.tx.alunoPlanoModalidade.upsert).not.toHaveBeenCalled()
  })

  it("preserva o plano e as modalidades anteriores, inclusive valores diferentes de R$ 100", async () => {
    const planoAnterior = { ...plano, id: "plano-200", valor: new Prisma.Decimal(200) }
    mocks.tx.aluno.findUnique.mockResolvedValue({
      ...aluno,
      tipo: "MENSALISTA",
      planoId: planoAnterior.id,
      plano: planoAnterior,
      modalidadesPlano: [
        { plataformaExterna: null, modalidade },
        { plataformaExterna: null, modalidade: { ...modalidade, id: "jiu-jitsu" } },
      ],
    })
    await prepararMensalidadeReativacao({ alunoId: aluno.id, autorId: aluno.usuarioId, agora })
    expect(mocks.tx.plano.findFirst).not.toHaveBeenCalled()
    expect(mocks.tx.mensalidade.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        planoId: planoAnterior.id,
        valor: planoAnterior.valor,
        repasseSnapshot: [expect.any(Object), expect.any(Object)],
      }),
    })
  })

  it("reutiliza a mesma mensalidade em visitas repetidas", async () => {
    mocks.tx.mensalidade.findUnique.mockResolvedValue(mensalidade)
    expect(
      await prepararMensalidadeReativacao({ alunoId: aluno.id, autorId: aluno.usuarioId, agora }),
    ).toEqual({ ok: true, mensalidade, plano })
    expect(mocks.tx.mensalidade.create).not.toHaveBeenCalled()
    expect(mocks.tx.mensalidade.update).not.toHaveBeenCalled()
    expect(mocks.registrarLog).not.toHaveBeenCalled()
  })

  it("mantém o plano original de R$ 100 do avulso quando o plano padrão mudou", async () => {
    mocks.tx.aluno.findUnique.mockResolvedValue({
      ...aluno,
      solicitacaoMatricula: { modalidadePrincipal: modalidade, plano },
    })
    await prepararMensalidadeReativacao({ alunoId: aluno.id, autorId: aluno.usuarioId, agora })
    expect(mocks.tx.plano.findFirst).not.toHaveBeenCalled()
    expect(mocks.tx.mensalidade.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ planoId: plano.id, valor: plano.valor }),
    })
  })

  it.each([
    "ATIVO",
    "INADIMPLENTE",
    "CANCELADO",
  ])("não gera cobrança para matrícula %s", async (status) => {
    mocks.tx.aluno.findUnique.mockResolvedValue({ ...aluno, status })
    expect(
      (await prepararMensalidadeReativacao({ alunoId: aluno.id, autorId: aluno.usuarioId, agora }))
        .ok,
    ).toBe(false)
    expect(mocks.tx.mensalidade.create).not.toHaveBeenCalled()
  })

  it("não cobra novamente uma competência já paga", async () => {
    mocks.tx.mensalidade.findUnique.mockResolvedValue({ ...mensalidade, status: "PAGA" })
    expect(
      (await prepararMensalidadeReativacao({ alunoId: aluno.id, autorId: aluno.usuarioId, agora }))
        .ok,
    ).toBe(false)
    expect(mocks.tx.mensalidade.create).not.toHaveBeenCalled()
  })
})

describe("recebimento da reativação", () => {
  const tx = mocks.tx as unknown as Prisma.TransactionClient
  it("ativa o avulso como mensalista, vincula a modalidade e audita na transação", async () => {
    await efetivarReativacaoMatricula(tx, mensalidade, agora)
    expect(mocks.tx.aluno.update).toHaveBeenCalledWith({
      where: { id: aluno.id },
      data: { status: "ATIVO", tipo: "MENSALISTA", planoId: plano.id, diaVencimento: 5 },
    })
    expect(mocks.tx.alunoPlanoModalidade.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: { alunoId: aluno.id, modalidadeId: modalidade.id, plataformaExterna: null },
      }),
    )
    expect(mocks.tx.mensalidade.update).toHaveBeenCalledWith({
      where: { id: mensalidade.id },
      data: { reativadaEm: agora },
    })
    expect(mocks.registrarLog).toHaveBeenCalledWith(
      expect.objectContaining({
        valorNovo: expect.objectContaining({ status: "ATIVO", tipo: "MENSALISTA" }),
      }),
      tx,
    )
  })

  it("preserva as modalidades e o vencimento de quem já tinha plano", async () => {
    mocks.tx.aluno.findUnique.mockResolvedValue({ ...aluno, tipo: "MENSALISTA", planoId: plano.id })
    await efetivarReativacaoMatricula(tx, mensalidade, agora)
    expect(mocks.tx.aluno.update).toHaveBeenCalledWith({
      where: { id: aluno.id },
      data: { status: "ATIVO", tipo: "MENSALISTA", planoId: plano.id },
    })
    expect(mocks.tx.alunoPlanoModalidade.upsert).not.toHaveBeenCalled()
  })

  it("um recebimento repetido não desfaz um trancamento posterior", async () => {
    await efetivarReativacaoMatricula(tx, { ...mensalidade, reativadaEm: agora }, agora)
    expect(mocks.tx.aluno.update).not.toHaveBeenCalled()
  })

  it("não reativa matrícula cancelada durante o pagamento", async () => {
    mocks.tx.aluno.findUnique.mockResolvedValue({ ...aluno, status: "CANCELADO" })
    await efetivarReativacaoMatricula(tx, mensalidade, agora)
    expect(mocks.tx.aluno.update).not.toHaveBeenCalled()
  })
})

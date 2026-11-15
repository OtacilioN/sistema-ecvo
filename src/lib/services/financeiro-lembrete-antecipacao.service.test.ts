import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => {
  const tx = {
    $queryRaw: vi.fn(),
    aluno: { findUnique: vi.fn() },
    mensalidade: { findUnique: vi.fn(), create: vi.fn() },
  }
  return {
    tx,
    db: {
      aluno: { findMany: vi.fn() },
      $transaction: vi.fn(async (executar: (cliente: typeof tx) => unknown) => executar(tx)),
    },
    criarNotificacao: vi.fn(),
  }
})
vi.mock("@/lib/db", () => ({ db: mocks.db }))
vi.mock("@/lib/services/notificacao.service", () => ({
  criarNotificacao: mocks.criarNotificacao,
}))

import { gerarMensalidadesParaLembrete } from "./financeiro.service"

function aluno(
  params: { dia?: number; seguinte?: boolean; familia?: boolean; externa?: boolean } = {},
) {
  return {
    id: "aluno-1",
    usuarioId: "usuario-1",
    status: "ATIVO",
    diaVencimento: params.dia ?? 1,
    vencimentoMesSeguinte: params.seguinte ?? false,
    plano: { id: "plano-1", valor: 100, valorBase: 120, familia: params.familia ?? false },
    modalidadesPlano: [
      {
        plataformaExterna: params.externa ? "TOTALPASS" : null,
        modalidade: {
          id: "modalidade-1",
          nome: "Jiu-Jitsu",
          valorRepasseProfessor: 50,
          turmas: [],
        },
      },
    ],
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.db.aluno.findMany.mockResolvedValue([aluno()])
  mocks.tx.$queryRaw.mockResolvedValue([])
  mocks.tx.aluno.findUnique.mockResolvedValue(aluno())
  mocks.tx.mensalidade.findUnique.mockResolvedValue(null)
  mocks.tx.mensalidade.create.mockImplementation(({ data }) => ({ id: "mensalidade-1", ...data }))
  mocks.criarNotificacao.mockResolvedValue({ id: "notificacao-1" })
})

describe("antecipação de mensalidade para o aviso de cinco dias", () => {
  it.each([
    { agora: "2026-11-26T11:00:00Z", competencia: "2026-12", vencimento: "2026-12-01" },
    { agora: "2026-12-28T01:00:00Z", competencia: "2027-01", vencimento: "2027-01-01" },
  ])("antecipa somente o vencimento D+5 na virada para $competencia", async ({
    agora,
    competencia,
    vencimento,
  }) => {
    expect(await gerarMensalidadesParaLembrete({ agora: new Date(agora) })).toEqual({
      criadas: 1,
      existentes: 0,
      puladas: [],
    })
    expect(mocks.tx.mensalidade.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        competencia,
        vencimento: new Date(`${vencimento}T12:00:00Z`),
      }),
    })
    expect(mocks.db.aluno.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: { in: ["ATIVO", "INADIMPLENTE"] },
          usuario: { ativo: true },
          vencimentoMesSeguinte: false,
        }),
      }),
    )
  })

  it("deixa a competência atual para a geração recorrente", async () => {
    expect(
      await gerarMensalidadesParaLembrete({ agora: new Date("2026-11-15T11:00:00Z") }),
    ).toEqual({
      criadas: 0,
      existentes: 0,
      puladas: [],
    })
    expect(mocks.db.aluno.findMany).not.toHaveBeenCalled()
    expect(mocks.db.$transaction).not.toHaveBeenCalled()
  })

  it("não antecipa outros vencimentos nem competência que vence no mês seguinte", async () => {
    mocks.db.aluno.findMany.mockResolvedValue([
      aluno({ dia: 2 }),
      aluno({ dia: 5 }),
      aluno({ dia: 10 }),
      aluno({ seguinte: true }),
    ])
    expect(
      await gerarMensalidadesParaLembrete({ agora: new Date("2026-11-26T11:00:00Z") }),
    ).toEqual({
      criadas: 0,
      existentes: 0,
      puladas: [],
    })
    expect(mocks.db.$transaction).not.toHaveBeenCalled()
  })

  it("reutiliza a mensalidade já existente sem gerar nova notificação", async () => {
    mocks.tx.mensalidade.findUnique.mockResolvedValue({ id: "mensalidade-existente" })
    expect(
      await gerarMensalidadesParaLembrete({ agora: new Date("2026-11-26T11:00:00Z") }),
    ).toEqual({
      criadas: 0,
      existentes: 1,
      puladas: [],
    })
    expect(mocks.tx.mensalidade.create).not.toHaveBeenCalled()
    expect(mocks.criarNotificacao).not.toHaveBeenCalled()
  })

  it("preserva o valor e vínculo de mensalidade familiar pela regra existente", async () => {
    mocks.tx.aluno.findUnique.mockResolvedValue(aluno({ familia: true }))
    await gerarMensalidadesParaLembrete({ agora: new Date("2026-11-26T11:00:00Z") })
    expect(mocks.tx.mensalidade.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        alunoId: "aluno-1",
        planoId: "plano-1",
        valor: 100,
        valorBase: 120,
        valorComDesconto: 100,
      }),
    })
  })

  it("não cria mensalidade para vínculo exclusivamente externo", async () => {
    mocks.tx.aluno.findUnique.mockResolvedValue(aluno({ externa: true }))
    const resultado = await gerarMensalidadesParaLembrete({
      agora: new Date("2026-11-26T11:00:00Z"),
    })
    expect(resultado.criadas).toBe(0)
    expect(resultado.puladas).toEqual([expect.objectContaining({ alunoId: "aluno-1" })])
    expect(mocks.tx.mensalidade.create).not.toHaveBeenCalled()
  })

  it("revalida matrícula operacional antes de criar a mensalidade", async () => {
    mocks.tx.aluno.findUnique.mockResolvedValue({ status: "TRANCADO" })
    const resultado = await gerarMensalidadesParaLembrete({
      agora: new Date("2026-11-26T11:00:00Z"),
    })
    expect(resultado.criadas).toBe(0)
    expect(resultado.puladas).toEqual([expect.objectContaining({ alunoId: "aluno-1" })])
    expect(mocks.tx.mensalidade.create).not.toHaveBeenCalled()
  })
})

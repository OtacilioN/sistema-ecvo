import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  db: {
    aluno: { findUnique: vi.fn(), update: vi.fn() },
    mensalidade: { findMany: vi.fn() },
    logAuditoria: { create: vi.fn() },
    $transaction: vi.fn(),
  },
}))
vi.mock("@/lib/db", () => ({ db: mocks.db }))

import { atualizarAluno } from "./aluno.service"

beforeEach(() => {
  vi.clearAllMocks()
  mocks.db.aluno.findUnique.mockResolvedValue({
    id: "aluno-1",
    tipo: "MENSALISTA",
    status: "ATIVO",
    planoId: "plano-1",
    plano: { nome: "Mensal" },
    diaVencimento: 1,
    vencimentoMesSeguinte: true,
    usuario: { nome: "Aluno", email: "aluno@example.com" },
    modalidades: [],
    modalidadesPlano: [],
  })
  mocks.db.aluno.update.mockImplementation(async ({ data }) => ({
    ...(await mocks.db.aluno.findUnique()),
    ...data,
  }))
  mocks.db.mensalidade.findMany.mockResolvedValue([])
  mocks.db.$transaction.mockImplementation((executar) => executar(mocks.db))
})

describe("edição do vencimento de alunos com referência no mês anterior", () => {
  it("preserva o vencimento no mês seguinte ao salvar novamente o dia 1", async () => {
    const resultado = await atualizarAluno("aluno-1", {
      diaVencimento: 1,
      autorId: "gestor-1",
    })

    expect(resultado.ok).toBe(true)
    expect(mocks.db.aluno.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ diaVencimento: 1, vencimentoMesSeguinte: true }),
      }),
    )
    expect(mocks.db.mensalidade.findMany).not.toHaveBeenCalled()
  })

  it("retorna ao próprio mês quando a gestão escolhe outro dia", async () => {
    const resultado = await atualizarAluno("aluno-1", {
      diaVencimento: 10,
      autorId: "gestor-1",
    })

    expect(resultado.ok).toBe(true)
    expect(mocks.db.aluno.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ diaVencimento: 10, vencimentoMesSeguinte: false }),
      }),
    )
    expect(mocks.db.logAuditoria.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        valorAntigo: expect.objectContaining({
          diaVencimento: 1,
          vencimentoMesSeguinte: true,
        }),
        valorNovo: expect.objectContaining({
          diaVencimento: 10,
          vencimentoMesSeguinte: false,
        }),
      }),
    })
  })
})

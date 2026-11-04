import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  db: {
    $transaction: vi.fn(),
    $queryRaw: vi.fn(),
    aluno: { findUnique: vi.fn(), updateMany: vi.fn() },
    mensalidade: {
      findUnique: vi.fn(),
      findUniqueOrThrow: vi.fn(),
      findFirst: vi.fn(),
      updateMany: vi.fn(),
    },
    cobrancaAsaas: { findMany: vi.fn(), updateMany: vi.fn() },
    operacaoIsencaoTrancamento: { findFirst: vi.fn() },
    cobrancaReativacaoAsaas: { findFirst: vi.fn() },
  },
}))
vi.mock("@/lib/db", () => ({ db: mocks.db }))
vi.mock("@/lib/services/auditoria.service", () => ({ registrarLog: vi.fn() }))
vi.mock("@/lib/services/notificacao.service", () => ({ criarNotificacao: vi.fn() }))

import { atualizarStatusMensalidade, baixarMensalidade } from "./financeiro.service"

const mensalidade = {
  id: "mensalidade-1",
  alunoId: "aluno-1",
  competencia: "2026-11",
  status: "ISENTA",
  valor: 90,
  valorBase: null,
  valorComDesconto: null,
  vencimento: new Date("2026-11-22T12:00:00Z"),
  atualizadoEm: new Date("2026-11-01T12:00:00Z"),
  pagoEm: null,
  formaPagamento: null,
  observacao: null,
  aluno: { usuarioId: "usuario-1", usuario: { nome: "Aluno" } },
  cobrancasAsaas: [],
}

beforeEach(() => {
  vi.resetAllMocks()
  mocks.db.$transaction.mockImplementation((callback) => callback(mocks.db))
  mocks.db.mensalidade.findUnique.mockResolvedValue(mensalidade)
  mocks.db.mensalidade.findUniqueOrThrow.mockResolvedValue({ ...mensalidade, status: "EM_ABERTO" })
  mocks.db.mensalidade.updateMany.mockResolvedValue({ count: 1 })
  mocks.db.mensalidade.findFirst.mockResolvedValue(null)
  mocks.db.aluno.findUnique.mockResolvedValue({ status: "ATIVO" })
  mocks.db.aluno.updateMany.mockResolvedValue({ count: 0 })
  mocks.db.operacaoIsencaoTrancamento.findFirst.mockResolvedValue(null)
  mocks.db.cobrancaReativacaoAsaas.findFirst.mockResolvedValue(null)
  mocks.db.cobrancaAsaas.findMany.mockResolvedValue([])
  mocks.db.cobrancaAsaas.updateMany.mockResolvedValue({ count: 0 })
})

describe("alteração financeira durante trancamento", () => {
  it("impede baixa manual enquanto a isenção está pendente", async () => {
    mocks.db.mensalidade.findUnique.mockResolvedValue({ ...mensalidade, status: "EM_ABERTO" })
    mocks.db.operacaoIsencaoTrancamento.findFirst.mockResolvedValue({ id: "op" })
    const resultado = await baixarMensalidade({ mensalidadeId: mensalidade.id, autorId: "gestor" })
    expect(resultado).toMatchObject({ ok: false, motivo: expect.stringContaining("isenção") })
    expect(mocks.db.mensalidade.updateMany).not.toHaveBeenCalled()
  })

  it("impede alteração de status enquanto a isenção está pendente", async () => {
    mocks.db.operacaoIsencaoTrancamento.findFirst.mockResolvedValue({ id: "op" })
    const resultado = await atualizarStatusMensalidade({
      mensalidadeId: mensalidade.id,
      status: "EM_ABERTO",
      autorId: "gestor",
    })
    expect(resultado).toMatchObject({ ok: false, motivo: expect.stringContaining("isenção") })
    expect(mocks.db.mensalidade.updateMany).not.toHaveBeenCalled()
  })

  it.each(["aluno trancado", "cobrança ativa"])("impede reabrir isenta com %s", async (cenario) => {
    if (cenario === "aluno trancado")
      mocks.db.aluno.findUnique.mockResolvedValue({ status: "TRANCADO" })
    else mocks.db.cobrancaReativacaoAsaas.findFirst.mockResolvedValue({ id: "cobranca" })
    const resultado = await atualizarStatusMensalidade({
      mensalidadeId: mensalidade.id,
      status: "EM_ABERTO",
      autorId: "gestor",
    })
    expect(resultado).toMatchObject({ ok: false, motivo: expect.stringContaining("reabrir") })
    expect(mocks.db.mensalidade.updateMany).not.toHaveBeenCalled()
  })

  it("permite reabrir isenta quando aluno ativo e sem operação ou cobrança pendente", async () => {
    const resultado = await atualizarStatusMensalidade({
      mensalidadeId: mensalidade.id,
      status: "EM_ABERTO",
      autorId: "gestor",
    })
    expect(resultado.ok).toBe(true)
    expect(mocks.db.mensalidade.updateMany).toHaveBeenCalledOnce()
  })

  it("preserva a isenção durante reativação mesmo em uma edição sem mudança de status", async () => {
    mocks.db.cobrancaReativacaoAsaas.findFirst.mockResolvedValue({ id: "cobranca" })
    const resultado = await atualizarStatusMensalidade({
      mensalidadeId: mensalidade.id,
      status: "ISENTA",
      observacao: "edição",
      autorId: "gestor",
    })
    expect(resultado.ok).toBe(false)
    expect(mocks.db.mensalidade.updateMany).not.toHaveBeenCalled()
  })
})

import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  db: {
    mensalidade: { findUnique: vi.fn() },
    cobrancaAsaas: { findFirst: vi.fn() },
  },
  baixarMensalidade: vi.fn(),
  gerarMensalidade: vi.fn(),
  cancelarCobrancaAsaasAntesDeBaixaManual: vi.fn(),
  cancelarPixAutomatico: vi.fn(),
}))

vi.mock("@/lib/db", () => ({ db: mocks.db }))
vi.mock("@/lib/services/financeiro.service", () => ({
  baixarMensalidade: mocks.baixarMensalidade,
  gerarMensalidade: mocks.gerarMensalidade,
}))
vi.mock("@/lib/services/asaas.service", () => ({
  cancelarCobrancaAsaasAntesDeBaixaManual: mocks.cancelarCobrancaAsaasAntesDeBaixaManual,
  cancelarPixAutomatico: mocks.cancelarPixAutomatico,
}))

import { baixarMensalidadeManual, darBaixaMensalidadeAlunoManual } from "./baixa-manual.service"

const parametros = {
  mensalidadeId: "mensalidade-1",
  formaPagamento: "Dinheiro",
  observacao: "Recebido na academia",
  autorId: "gestor-1",
}

describe("baixa manual de mensalidade", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.db.mensalidade.findUnique.mockResolvedValue({
      status: "EM_ABERTO",
      alunoId: "aluno-1",
      contratoPixAutomatico: null,
    })
    mocks.db.cobrancaAsaas.findFirst.mockResolvedValue(null)
    mocks.baixarMensalidade.mockResolvedValue({
      ok: true,
      mensalidade: { id: parametros.mensalidadeId, status: "PAGA" },
    })
    mocks.cancelarCobrancaAsaasAntesDeBaixaManual.mockResolvedValue({ ok: true })
    mocks.cancelarPixAutomatico.mockResolvedValue({ ok: true })
  })

  it("preserva a baixa normal quando não há cobrança Asaas ativa", async () => {
    const resultado = await baixarMensalidadeManual(parametros)

    expect(resultado).toMatchObject({ ok: true })
    expect(mocks.cancelarCobrancaAsaasAntesDeBaixaManual).not.toHaveBeenCalled()
    expect(mocks.cancelarPixAutomatico).not.toHaveBeenCalled()
    expect(mocks.baixarMensalidade).toHaveBeenCalledWith(parametros)
  })

  it("cancela a cobrança PIX mensal antes de registrar a baixa", async () => {
    mocks.db.cobrancaAsaas.findFirst.mockResolvedValue({
      id: "cobranca-1",
      tipo: "PIX_MENSAL",
      status: "PENDENTE",
    })

    const resultado = await baixarMensalidadeManual(parametros)

    expect(resultado).toMatchObject({ ok: true })
    expect(mocks.cancelarCobrancaAsaasAntesDeBaixaManual).toHaveBeenCalledWith({
      cobrancaId: "cobranca-1",
      autorId: "gestor-1",
    })
    expect(mocks.cancelarPixAutomatico).not.toHaveBeenCalled()
    expect(mocks.baixarMensalidade).toHaveBeenCalledWith(parametros)
    expect(mocks.cancelarCobrancaAsaasAntesDeBaixaManual.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.baixarMensalidade.mock.invocationCallOrder[0],
    )
  })

  it("encerra o PIX Automático depois de cancelar a cobrança da competência", async () => {
    mocks.db.mensalidade.findUnique.mockResolvedValue({
      status: "EM_ABERTO",
      alunoId: "aluno-1",
      contratoPixAutomatico: { status: "ATIVO" },
    })
    mocks.db.cobrancaAsaas.findFirst.mockResolvedValue({
      id: "cobranca-automatica-1",
      tipo: "PIX_AUTOMATICO_RECORRENTE",
      status: "PENDENTE",
    })

    const resultado = await baixarMensalidadeManual(parametros)

    expect(resultado).toMatchObject({ ok: true })
    expect(mocks.cancelarPixAutomatico).toHaveBeenCalledWith({
      alunoId: "aluno-1",
      autorId: "gestor-1",
    })
    expect(mocks.cancelarCobrancaAsaasAntesDeBaixaManual.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.cancelarPixAutomatico.mock.invocationCallOrder[0],
    )
    expect(mocks.cancelarPixAutomatico.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.baixarMensalidade.mock.invocationCallOrder[0],
    )
  })

  it("não registra a baixa quando o Asaas não confirma o cancelamento", async () => {
    mocks.db.cobrancaAsaas.findFirst.mockResolvedValue({
      id: "cobranca-1",
      tipo: "PIX_MENSAL",
      status: "PENDENTE",
    })
    mocks.cancelarCobrancaAsaasAntesDeBaixaManual.mockResolvedValue({
      ok: false,
      motivo: "O Asaas não confirmou a exclusão da cobrança.",
    })

    const resultado = await baixarMensalidadeManual(parametros)

    expect(resultado).toEqual({
      ok: false,
      motivo: "O Asaas não confirmou a exclusão da cobrança.",
    })
    expect(mocks.baixarMensalidade).not.toHaveBeenCalled()
  })

  it("preserva pagamento já confirmado no Asaas", async () => {
    mocks.db.cobrancaAsaas.findFirst.mockResolvedValue({
      id: "cobranca-1",
      tipo: "PIX_MENSAL",
      status: "RECEBIDA",
    })

    const resultado = await baixarMensalidadeManual(parametros)

    expect(resultado).toEqual({
      ok: false,
      motivo: "O pagamento já foi confirmado pelo Asaas e não pode receber baixa manual.",
    })
    expect(mocks.cancelarCobrancaAsaasAntesDeBaixaManual).not.toHaveBeenCalled()
    expect(mocks.baixarMensalidade).not.toHaveBeenCalled()
  })

  it("não cancela cobrança quando a mensalidade já está quitada", async () => {
    mocks.db.mensalidade.findUnique.mockResolvedValue({
      status: "PAGA",
      alunoId: "aluno-1",
      contratoPixAutomatico: { status: "ATIVO" },
    })

    await baixarMensalidadeManual(parametros)

    expect(mocks.db.cobrancaAsaas.findFirst).not.toHaveBeenCalled()
    expect(mocks.cancelarCobrancaAsaasAntesDeBaixaManual).not.toHaveBeenCalled()
    expect(mocks.baixarMensalidade).toHaveBeenCalledWith(parametros)
  })

  it("retoma o cancelamento do PIX Automático mesmo sem cobrança ativa na competência", async () => {
    mocks.db.mensalidade.findUnique.mockResolvedValue({
      status: "EM_ABERTO",
      alunoId: "aluno-1",
      contratoPixAutomatico: { status: "ERRO" },
    })

    const resultado = await baixarMensalidadeManual(parametros)

    expect(resultado).toMatchObject({ ok: true })
    expect(mocks.cancelarCobrancaAsaasAntesDeBaixaManual).not.toHaveBeenCalled()
    expect(mocks.cancelarPixAutomatico).toHaveBeenCalledWith({
      alunoId: "aluno-1",
      autorId: "gestor-1",
    })
    expect(mocks.cancelarPixAutomatico.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.baixarMensalidade.mock.invocationCallOrder[0],
    )
  })

  it("não baixa se o encerramento do PIX Automático falhar", async () => {
    mocks.db.mensalidade.findUnique.mockResolvedValue({
      status: "EM_ABERTO",
      alunoId: "aluno-1",
      contratoPixAutomatico: { status: "ATIVO" },
    })
    mocks.cancelarPixAutomatico.mockResolvedValue({
      ok: false,
      motivo: "O Asaas não confirmou o cancelamento da autorização.",
    })

    const resultado = await baixarMensalidadeManual(parametros)

    expect(resultado).toEqual({
      ok: false,
      motivo: "O Asaas não confirmou o cancelamento da autorização.",
    })
    expect(mocks.baixarMensalidade).not.toHaveBeenCalled()
  })

  it("gera a competência e aplica o mesmo fluxo de baixa manual", async () => {
    mocks.gerarMensalidade.mockResolvedValue({
      ok: true,
      mensalidade: { id: parametros.mensalidadeId },
      criada: false,
    })

    const resultado = await darBaixaMensalidadeAlunoManual({
      alunoId: "aluno-1",
      competencia: "2026-09",
      formaPagamento: parametros.formaPagamento,
      observacao: parametros.observacao,
      autorId: parametros.autorId,
    })

    expect(resultado).toMatchObject({ ok: true })
    expect(mocks.gerarMensalidade).toHaveBeenCalledWith({
      alunoId: "aluno-1",
      competencia: "2026-09",
      autorId: "gestor-1",
    })
    expect(mocks.baixarMensalidade).toHaveBeenCalledWith(parametros)
  })
})

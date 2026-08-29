import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => {
  const tx = {
    $queryRaw: vi.fn(),
    eventoWebhookAsaas: { createMany: vi.fn(), delete: vi.fn() },
    clienteAsaas: { findUnique: vi.fn() },
    cobrancaAsaas: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      findUniqueOrThrow: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      count: vi.fn(),
      groupBy: vi.fn(),
    },
    mensalidade: { findUnique: vi.fn(), updateMany: vi.fn() },
    notificacao: { create: vi.fn(), createMany: vi.fn() },
    usuario: { findMany: vi.fn() },
    contratoPixAutomatico: {
      findUnique: vi.fn(),
      findUniqueOrThrow: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    aluno: { update: vi.fn() },
  }
  const db = {
    cobrancaAsaas: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    contratoPixAutomatico: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    mensalidade: { findFirst: vi.fn(), findMany: vi.fn() },
    aluno: { findUnique: vi.fn() },
    $transaction: vi.fn(async (callback: (cliente: typeof tx) => unknown) => callback(tx)),
  }
  return {
    db,
    tx,
    obterCobrancaAsaas: vi.fn(),
    obterAutorizacaoPixAutomaticoAsaas: vi.fn(),
    cancelarAutorizacaoPixAutomaticoAsaas: vi.fn(),
    criarCobrancaAsaas: vi.fn(),
    excluirCobrancaAsaas: vi.fn(),
    listarCobrancasAsaas: vi.fn(),
    listarAutorizacoesPixAutomaticoAsaas: vi.fn(),
    obterQrCodePixAsaas: vi.fn(),
    registrarLog: vi.fn(),
    sincronizarStatusFinanceiroAluno: vi.fn(),
  }
})

vi.mock("@/lib/db", () => ({ db: mocks.db }))
vi.mock("@/lib/asaas/client", () => ({
  cancelarAutorizacaoPixAutomaticoAsaas: mocks.cancelarAutorizacaoPixAutomaticoAsaas,
  criarAutorizacaoPixAutomaticoAsaas: vi.fn(),
  criarClienteAsaas: vi.fn(),
  criarCobrancaAsaas: mocks.criarCobrancaAsaas,
  excluirCobrancaAsaas: mocks.excluirCobrancaAsaas,
  listarAutorizacoesPixAutomaticoAsaas: mocks.listarAutorizacoesPixAutomaticoAsaas,
  listarClientesAsaas: vi.fn(),
  listarCobrancasAsaas: mocks.listarCobrancasAsaas,
  obterAutorizacaoPixAutomaticoAsaas: mocks.obterAutorizacaoPixAutomaticoAsaas,
  obterCobrancaAsaas: mocks.obterCobrancaAsaas,
  obterQrCodePixAsaas: mocks.obterQrCodePixAsaas,
}))
vi.mock("@/lib/services/auditoria.service", () => ({ registrarLog: mocks.registrarLog }))
vi.mock("@/lib/services/financeiro.service", () => ({
  gerarMensalidade: vi.fn(),
  sincronizarStatusFinanceiroAluno: mocks.sincronizarStatusFinanceiroAluno,
  statusMensalidadeEfetivo: ({ vencimento }: { vencimento: Date }) =>
    vencimento.getTime() < Date.now() ? "VENCIDA" : "EM_ABERTO",
}))

import {
  cancelarCobrancaAsaasPendente,
  cancelarPixAutomatico,
  gerarCobrancaPixMensal,
  processarCobrancasPixAutomaticoPendentes,
  processarWebhookAsaas,
  reconciliarPendenciasAsaas,
} from "./asaas.service"

const vencimento = new Date("2026-09-10T12:00:00.000Z")
const cobrancaLocal = {
  id: "cobranca-1",
  mensalidadeId: "mensalidade-1",
  contratoPixAutomaticoId: null,
  asaasPaymentId: "pay_1",
  externalReference: "mensalidade:mensalidade-1",
  tipo: "PIX_MENSAL" as const,
  status: "PENDENTE" as const,
  mensalidade: {
    valor: 150,
    vencimento,
    aluno: { clienteAsaas: { asaasCustomerId: "cus_1" } },
  },
  contratoPixAutomatico: null,
}

afterEach(() => {
  vi.useRealTimers()
})

function pagamentoRemoto(status: "RECEIVED" | "REFUNDED" | "PARTIALLY_REFUNDED" = "RECEIVED") {
  return {
    object: "payment" as const,
    id: "pay_1",
    customer: "cus_1",
    billingType: "PIX" as const,
    value: 150,
    status,
    dueDate: "2026-09-10",
    paymentDate: "2026-09-10",
    externalReference: "mensalidade:mensalidade-1",
    pixAutomaticAuthorizationId: null,
  }
}

describe("processarWebhookAsaas", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.db.cobrancaAsaas.findFirst.mockResolvedValue({ id: "cobranca-1" })
    mocks.tx.eventoWebhookAsaas.createMany.mockResolvedValue({ count: 1 })
    mocks.tx.cobrancaAsaas.findFirst.mockImplementation((args) =>
      args?.where?.OR ? cobrancaLocal : null,
    )
    mocks.tx.cobrancaAsaas.findUnique.mockResolvedValue({ status: "PENDENTE", ativa: true })
    mocks.tx.cobrancaAsaas.update.mockResolvedValue({ id: "cobranca-1" })
    mocks.tx.cobrancaAsaas.updateMany.mockResolvedValue({ count: 0 })
    mocks.tx.cobrancaAsaas.count.mockResolvedValue(0)
    mocks.tx.cobrancaAsaas.groupBy.mockResolvedValue([])
    mocks.tx.contratoPixAutomatico.updateMany.mockResolvedValue({ count: 0 })
    mocks.tx.mensalidade.findUnique.mockResolvedValue({
      id: "mensalidade-1",
      alunoId: "aluno-1",
      competencia: "2026-09",
      valor: 150,
      vencimento,
      status: "EM_ABERTO",
      formaPagamento: null,
      observacao: null,
      aluno: { usuarioId: "usuario-1" },
    })
    mocks.tx.mensalidade.updateMany.mockResolvedValue({ count: 1 })
    mocks.tx.notificacao.create.mockResolvedValue({ id: "notificacao-1" })
    mocks.tx.usuario.findMany.mockResolvedValue([])
    mocks.obterCobrancaAsaas.mockResolvedValue(pagamentoRemoto())
  })

  it("confirma o pagamento no Asaas e só então baixa a mensalidade", async () => {
    const resultado = await processarWebhookAsaas({
      id: "evt_1",
      event: "PAYMENT_RECEIVED",
      payment: { id: "pay_1" },
    })

    expect(resultado).toEqual({ ok: true, duplicado: false })
    expect(mocks.obterCobrancaAsaas).toHaveBeenCalledWith("pay_1")
    expect(mocks.tx.mensalidade.updateMany).toHaveBeenCalledWith({
      where: { id: "mensalidade-1", status: { in: ["EM_ABERTO", "VENCIDA"] } },
      data: {
        status: "PAGA",
        pagoEm: new Date("2026-09-10T15:00:00.000Z"),
        formaPagamento: "PIX_ASAAS",
        cobrancaQuitacaoAsaasId: "cobranca-1",
      },
    })
    expect(mocks.sincronizarStatusFinanceiroAluno).toHaveBeenCalledWith(mocks.tx, "aluno-1")
  })

  it("aceita a exclusão terminal autenticada sem reconsultar um recurso remoto já removido", async () => {
    mocks.tx.cobrancaAsaas.findUnique.mockResolvedValue({ status: "CANCELADA", ativa: false })

    const resultado = await processarWebhookAsaas({
      id: "evt_exclusao",
      event: "PAYMENT_DELETED",
      payment: {
        id: "pay_1",
        customer: "cus_1",
        billingType: "PIX",
        externalReference: "mensalidade:mensalidade-1",
        status: "PENDING",
        value: 150,
        dueDate: "2026-09-10",
        pixAutomaticAuthorizationId: null,
      },
    })

    expect(resultado).toEqual({ ok: true, duplicado: false })
    expect(mocks.obterCobrancaAsaas).not.toHaveBeenCalled()
    expect(mocks.tx.cobrancaAsaas.update).toHaveBeenCalledWith({
      where: { id: "cobranca-1" },
      data: expect.objectContaining({
        status: "CANCELADA",
        ativa: false,
        statusAsaas: "DELETED",
        ultimoEventoAsaas: "PAYMENT_DELETED",
        ultimoErro: null,
      }),
    })
    expect(mocks.tx.mensalidade.updateMany).not.toHaveBeenCalled()
  })

  it("rejeita a baixa quando os dados canônicos divergem da intenção local", async () => {
    mocks.obterCobrancaAsaas.mockResolvedValue({
      ...pagamentoRemoto(),
      externalReference: "outra-referencia",
    })

    const resultado = await processarWebhookAsaas({
      id: "evt_2",
      event: "PAYMENT_RECEIVED",
      payment: { id: "pay_1" },
    })

    expect(resultado).toMatchObject({
      ok: false,
      motivo: "Referência externa divergente no webhook.",
    })
    expect(mocks.tx.mensalidade.updateMany).not.toHaveBeenCalled()
    expect(mocks.tx.cobrancaAsaas.update).toHaveBeenCalledWith({
      where: { id: "cobranca-1" },
      data: {
        status: "ERRO",
        ultimoErro: "Referência externa divergente no webhook.",
        ultimoEventoAsaas: "PAYMENT_RECEIVED",
      },
    })
    expect(mocks.tx.eventoWebhookAsaas.delete).toHaveBeenCalledWith({
      where: { asaasEventId: "evt_2" },
    })
  })

  it("processa a reentrega do mesmo evento depois que a divergência é corrigida", async () => {
    mocks.obterCobrancaAsaas
      .mockResolvedValueOnce({
        ...pagamentoRemoto(),
        externalReference: "outra-referencia",
      })
      .mockResolvedValueOnce(pagamentoRemoto())

    const evento = {
      id: "evt_recuperavel",
      event: "PAYMENT_RECEIVED",
      payment: { id: "pay_1" },
    }
    const primeira = await processarWebhookAsaas(evento)
    const segunda = await processarWebhookAsaas(evento)

    expect(primeira.ok).toBe(false)
    expect(segunda).toEqual({ ok: true, duplicado: false })
    expect(mocks.tx.eventoWebhookAsaas.createMany).toHaveBeenCalledTimes(2)
    expect(mocks.tx.eventoWebhookAsaas.delete).toHaveBeenCalledTimes(1)
    expect(mocks.tx.mensalidade.updateMany).toHaveBeenCalledOnce()
  })

  it("não consome evento de autorização recebido antes do vínculo local e aceita a reentrega", async () => {
    const evento = {
      id: "evt_auth_corrida",
      event: "PIX_AUTOMATIC_RECURRING_AUTHORIZATION_ACTIVATED",
      authorization: { id: "auth-corrida" },
    }
    mocks.db.contratoPixAutomatico.findUnique.mockResolvedValueOnce(null)
    mocks.obterAutorizacaoPixAutomaticoAsaas.mockResolvedValue({
      id: "auth-corrida",
      customerId: "cus_1",
      contractId: "ecvo-contrato-corrida",
      status: "ACTIVE",
      frequency: "MONTHLY",
      paymentCreationMode: "MANUAL",
      retryPolicy: "NOT_ALLOWED",
      value: 150,
      startDate: "2026-09-10",
      finishDate: "2027-02-10",
    })

    const primeira = await processarWebhookAsaas(evento)

    expect(primeira).toEqual({
      ok: false,
      duplicado: false,
      motivo: "A autorização ainda não foi vinculada ao contrato local.",
    })
    expect(mocks.tx.eventoWebhookAsaas.createMany).not.toHaveBeenCalled()

    const contrato = {
      id: "contrato-corrida",
      alunoId: "aluno-1",
      status: "PENDENTE_AUTORIZACAO",
      valor: 150,
      inicio: new Date("2026-09-10T15:00:00.000Z"),
      fim: new Date("2027-02-10T15:00:00.000Z"),
      aluno: { clienteAsaas: { asaasCustomerId: "cus_1" } },
      mensalidades: [],
    }
    mocks.db.contratoPixAutomatico.findUnique.mockResolvedValueOnce(contrato)
    mocks.tx.contratoPixAutomatico.findUnique.mockResolvedValueOnce(contrato)
    mocks.tx.contratoPixAutomatico.update.mockResolvedValue({ ...contrato, status: "ATIVO" })

    const segunda = await processarWebhookAsaas(evento)

    expect(segunda).toEqual({ ok: true, duplicado: false })
    expect(mocks.tx.eventoWebhookAsaas.createMany).toHaveBeenCalledOnce()
    expect(mocks.tx.contratoPixAutomatico.update).toHaveBeenCalledWith({
      where: { id: contrato.id },
      data: { status: "ATIVO", ultimoErro: null },
    })
  })

  it("não consome instrução automática antes de a cobrança local receber o ID remoto", async () => {
    mocks.db.cobrancaAsaas.findUnique.mockResolvedValue(null)
    mocks.db.contratoPixAutomatico.findUnique.mockResolvedValue(null)
    mocks.obterAutorizacaoPixAutomaticoAsaas.mockResolvedValue({
      id: "auth-1",
      contractId: "ecvo-contrato-1",
    })

    const resultado = await processarWebhookAsaas({
      id: "evt_instrucao_corrida",
      event: "PIX_AUTOMATIC_RECURRING_PAYMENT_INSTRUCTION_SCHEDULED",
      paymentInstruction: {
        id: "instrucao-1",
        status: "SCHEDULED",
        payment: "pay-corrida",
        authorization: "auth-1",
      },
    })

    expect(resultado).toEqual({
      ok: false,
      duplicado: false,
      motivo: "A instrução ainda não foi vinculada à cobrança local.",
    })
    expect(mocks.tx.eventoWebhookAsaas.createMany).not.toHaveBeenCalled()
  })

  it("não consome pagamento de cliente ECVO recebido antes da intenção local", async () => {
    mocks.tx.cobrancaAsaas.findFirst.mockResolvedValue(null)
    mocks.tx.clienteAsaas.findUnique.mockResolvedValue({ id: "cliente-local" })

    const resultado = await processarWebhookAsaas({
      id: "evt_pagamento_corrida",
      event: "PAYMENT_RECEIVED",
      payment: { id: "pay_1" },
    })

    expect(resultado).toEqual({
      ok: false,
      duplicado: false,
      motivo: "A cobrança ainda não foi vinculada à intenção local.",
    })
    expect(mocks.tx.eventoWebhookAsaas.delete).toHaveBeenCalledWith({
      where: { asaasEventId: "evt_pagamento_corrida" },
    })
    expect(mocks.tx.mensalidade.updateMany).not.toHaveBeenCalled()
  })

  it("mantém inativa uma tentativa antiga recebida depois da tentativa que já quitou", async () => {
    const tentativaAntiga = { ...cobrancaLocal, ativa: false, status: "PENDENTE" as const }
    mocks.tx.cobrancaAsaas.findFirst.mockImplementation((args) => {
      if (args?.where?.OR) return tentativaAntiga
      if (args?.where?.status === "RECEBIDA" || args?.where?.ativa === true) {
        return { id: "cobranca-atual", status: "RECEBIDA" }
      }
      return null
    })
    mocks.tx.cobrancaAsaas.findUnique.mockResolvedValue({ status: "PENDENTE", ativa: false })
    mocks.tx.usuario.findMany.mockResolvedValue([{ id: "gestor-1" }])
    mocks.tx.mensalidade.findUnique.mockResolvedValue({
      id: "mensalidade-1",
      alunoId: "aluno-1",
      competencia: "2026-09",
      valor: 150,
      vencimento,
      status: "PAGA",
      formaPagamento: "PIX_ASAAS",
      cobrancaQuitacaoAsaasId: "cobranca-atual",
      observacao: null,
      aluno: { usuarioId: "usuario-1" },
    })

    await processarWebhookAsaas({
      id: "evt_tardio",
      event: "PAYMENT_RECEIVED",
      payment: { id: "pay_1" },
    })

    expect(mocks.tx.cobrancaAsaas.update).toHaveBeenCalledWith({
      where: { id: "cobranca-1" },
      data: expect.objectContaining({ status: "RECEBIDA", ativa: false }),
    })
    expect(mocks.tx.mensalidade.updateMany).not.toHaveBeenCalled()
    expect(mocks.tx.notificacao.createMany).toHaveBeenCalled()
  })

  it("reabre a mensalidade quando o Asaas confirma estorno integral", async () => {
    mocks.obterCobrancaAsaas.mockResolvedValue(pagamentoRemoto("REFUNDED"))
    mocks.tx.cobrancaAsaas.findFirst.mockImplementation((args) =>
      args?.where?.OR ? { ...cobrancaLocal, status: "RECEBIDA" } : null,
    )
    mocks.tx.mensalidade.findUnique.mockResolvedValue({
      id: "mensalidade-1",
      alunoId: "aluno-1",
      competencia: "2026-09",
      valor: 150,
      vencimento: new Date("2026-01-10T12:00:00.000Z"),
      status: "PAGA",
      formaPagamento: "PIX_ASAAS",
      cobrancaQuitacaoAsaasId: "cobranca-1",
      observacao: null,
      aluno: { usuarioId: "usuario-1" },
    })

    await processarWebhookAsaas({
      id: "evt_3",
      event: "PAYMENT_REFUNDED",
      payment: { id: "pay_1" },
    })

    expect(mocks.tx.mensalidade.updateMany).toHaveBeenCalledWith({
      where: {
        id: "mensalidade-1",
        cobrancaQuitacaoAsaasId: "cobranca-1",
        OR: [{ status: "PAGA", formaPagamento: "PIX_ASAAS" }],
      },
      data: {
        status: "VENCIDA",
        pagoEm: null,
        formaPagamento: null,
        cobrancaQuitacaoAsaasId: null,
      },
    })
  })

  it("transfere a quitação duplicada e reabre após o estorno da última recebida", async () => {
    const cobrancaB = {
      ...cobrancaLocal,
      id: "cobranca-b",
      asaasPaymentId: "pay-b",
      externalReference: "mensalidade:mensalidade-1:tentativa:2",
      status: "RECEBIDA" as const,
    }
    mocks.obterCobrancaAsaas.mockResolvedValue({
      ...pagamentoRemoto("REFUNDED"),
      id: "pay-b",
      externalReference: cobrancaB.externalReference,
    })
    mocks.tx.cobrancaAsaas.findFirst.mockImplementation((args) => {
      if (args?.where?.OR) return cobrancaB
      if (args?.where?.status === "RECEBIDA") {
        return { id: "cobranca-a", recebidaEmAsaas: new Date("2026-09-09T15:00:00.000Z") }
      }
      return null
    })
    mocks.tx.cobrancaAsaas.findUnique.mockResolvedValue({ status: "RECEBIDA", ativa: true })
    mocks.tx.mensalidade.findUnique.mockResolvedValue({
      id: "mensalidade-1",
      alunoId: "aluno-1",
      competencia: "2026-09",
      valor: 150,
      vencimento: new Date("2026-01-10T12:00:00.000Z"),
      status: "PAGA",
      formaPagamento: "PIX_ASAAS",
      cobrancaQuitacaoAsaasId: "cobranca-b",
      observacao: null,
      pagoEm: new Date("2026-09-10T15:00:00.000Z"),
      aluno: { usuarioId: "usuario-1" },
    })

    await processarWebhookAsaas({
      id: "evt_estorno_b",
      event: "PAYMENT_REFUNDED",
      payment: { id: "pay-b" },
    })

    expect(mocks.tx.mensalidade.updateMany).toHaveBeenCalledWith({
      where: { id: "mensalidade-1", cobrancaQuitacaoAsaasId: "cobranca-b" },
      data: {
        status: "PAGA",
        pagoEm: new Date("2026-09-09T15:00:00.000Z"),
        formaPagamento: "PIX_ASAAS",
        cobrancaQuitacaoAsaasId: "cobranca-a",
      },
    })

    vi.clearAllMocks()
    const cobrancaA = {
      ...cobrancaLocal,
      id: "cobranca-a",
      asaasPaymentId: "pay-a",
      status: "RECEBIDA" as const,
    }
    mocks.db.cobrancaAsaas.findFirst.mockResolvedValue({ id: "cobranca-a" })
    mocks.tx.eventoWebhookAsaas.createMany.mockResolvedValue({ count: 1 })
    mocks.obterCobrancaAsaas.mockResolvedValue({
      ...pagamentoRemoto("REFUNDED"),
      id: "pay-a",
    })
    mocks.tx.cobrancaAsaas.findFirst.mockImplementation((args) =>
      args?.where?.OR ? cobrancaA : null,
    )
    mocks.tx.cobrancaAsaas.findUnique.mockResolvedValue({ status: "RECEBIDA", ativa: true })
    mocks.tx.cobrancaAsaas.update.mockResolvedValue({ id: "cobranca-a" })
    mocks.tx.mensalidade.findUnique.mockResolvedValue({
      id: "mensalidade-1",
      alunoId: "aluno-1",
      competencia: "2026-09",
      valor: 150,
      vencimento: new Date("2026-01-10T12:00:00.000Z"),
      status: "PAGA",
      formaPagamento: "PIX_ASAAS",
      cobrancaQuitacaoAsaasId: "cobranca-a",
      observacao: null,
      pagoEm: new Date("2026-09-09T15:00:00.000Z"),
      aluno: { usuarioId: "usuario-1" },
    })
    mocks.tx.mensalidade.updateMany.mockResolvedValue({ count: 1 })
    mocks.tx.notificacao.create.mockResolvedValue({ id: "notificacao-2" })

    await processarWebhookAsaas({
      id: "evt_estorno_a",
      event: "PAYMENT_REFUNDED",
      payment: { id: "pay-a" },
    })

    expect(mocks.tx.mensalidade.updateMany).toHaveBeenCalledWith({
      where: {
        id: "mensalidade-1",
        cobrancaQuitacaoAsaasId: "cobranca-a",
        OR: [{ status: "PAGA", formaPagamento: "PIX_ASAAS" }],
      },
      data: {
        status: "VENCIDA",
        pagoEm: null,
        formaPagamento: null,
        cobrancaQuitacaoAsaasId: null,
      },
    })
  })

  it("reabre uma mensalidade cancelada quando um estorno parcial evolui para integral", async () => {
    mocks.obterCobrancaAsaas.mockResolvedValue(pagamentoRemoto("PARTIALLY_REFUNDED"))
    mocks.tx.cobrancaAsaas.findFirst.mockImplementation((args) =>
      args?.where?.OR
        ? { ...cobrancaLocal, status: "RECEBIDA", estornoParcialPendenteEm: null }
        : null,
    )
    mocks.tx.mensalidade.findUnique.mockResolvedValue({
      id: "mensalidade-1",
      alunoId: "aluno-1",
      competencia: "2026-09",
      valor: 150,
      vencimento,
      status: "PAGA",
      formaPagamento: "PIX_ASAAS",
      cobrancaQuitacaoAsaasId: "cobranca-1",
      observacao: null,
      aluno: { usuarioId: "usuario-1" },
    })

    await processarWebhookAsaas({
      id: "evt_parcial",
      event: "PAYMENT_PARTIALLY_REFUNDED",
      payment: { id: "pay_1" },
    })

    expect(mocks.tx.mensalidade.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "CANCELADA" }) }),
    )

    vi.clearAllMocks()
    mocks.db.cobrancaAsaas.findFirst.mockResolvedValue({ id: "cobranca-1" })
    mocks.tx.eventoWebhookAsaas.createMany.mockResolvedValue({ count: 1 })
    mocks.obterCobrancaAsaas.mockResolvedValue(pagamentoRemoto("REFUNDED"))
    mocks.tx.cobrancaAsaas.findFirst.mockImplementation((args) =>
      args?.where?.OR
        ? {
            ...cobrancaLocal,
            status: "ESTORNADA",
            estornoParcialPendenteEm: new Date("2026-09-11T12:00:00.000Z"),
          }
        : null,
    )
    mocks.tx.cobrancaAsaas.update.mockResolvedValue({ id: "cobranca-1" })
    mocks.tx.cobrancaAsaas.findUnique.mockResolvedValue({ status: "ESTORNADA", ativa: false })
    mocks.tx.cobrancaAsaas.count.mockResolvedValue(0)
    mocks.tx.mensalidade.findUnique.mockResolvedValue({
      id: "mensalidade-1",
      alunoId: "aluno-1",
      competencia: "2026-09",
      valor: 150,
      vencimento: new Date("2026-01-10T12:00:00.000Z"),
      status: "CANCELADA",
      formaPagamento: null,
      cobrancaQuitacaoAsaasId: "cobranca-1",
      observacao: "Conciliação manual pendente",
      aluno: { usuarioId: "usuario-1" },
    })
    mocks.tx.mensalidade.updateMany.mockResolvedValue({ count: 1 })

    await processarWebhookAsaas({
      id: "evt_integral",
      event: "PAYMENT_REFUNDED",
      payment: { id: "pay_1" },
    })

    expect(mocks.tx.mensalidade.updateMany).toHaveBeenCalledWith({
      where: {
        id: "mensalidade-1",
        cobrancaQuitacaoAsaasId: "cobranca-1",
        OR: [{ status: "PAGA", formaPagamento: "PIX_ASAAS" }, { status: "CANCELADA" }],
      },
      data: {
        status: "VENCIDA",
        pagoEm: null,
        formaPagamento: null,
        cobrancaQuitacaoAsaasId: null,
      },
    })
  })

  it("limpa a conciliação parcial quando o estorno integral já não é a quitação eleita", async () => {
    mocks.obterCobrancaAsaas.mockResolvedValue(pagamentoRemoto("REFUNDED"))
    mocks.tx.cobrancaAsaas.findFirst.mockImplementation((args) =>
      args?.where?.OR
        ? {
            ...cobrancaLocal,
            status: "ESTORNADA",
            estornoParcialPendenteEm: new Date("2026-09-11T12:00:00.000Z"),
          }
        : null,
    )
    mocks.tx.cobrancaAsaas.findUnique.mockResolvedValue({ status: "ESTORNADA", ativa: false })
    mocks.tx.mensalidade.findUnique.mockResolvedValue({
      id: "mensalidade-1",
      alunoId: "aluno-1",
      competencia: "2026-09",
      valor: 150,
      vencimento,
      status: "PAGA",
      formaPagamento: "PIX_ASAAS",
      cobrancaQuitacaoAsaasId: "outra-cobranca",
      observacao: null,
      aluno: { usuarioId: "usuario-1" },
    })

    await processarWebhookAsaas({
      id: "evt_integral_nao_eleito",
      event: "PAYMENT_REFUNDED",
      payment: { id: "pay_1" },
    })

    expect(mocks.tx.cobrancaAsaas.update).toHaveBeenCalledWith({
      where: { id: "cobranca-1" },
      data: { estornoParcialPendenteEm: null, ativa: false, ultimoErro: null },
    })
    expect(mocks.tx.mensalidade.updateMany).not.toHaveBeenCalled()
  })

  it("cancela a autorização e libera os ciclos quando o pagamento inicial é estornado", async () => {
    const cobrancaInicial = {
      ...cobrancaLocal,
      contratoPixAutomaticoId: "contrato-1",
      tipo: "PIX_AUTOMATICO_INICIAL" as const,
      status: "RECEBIDA" as const,
      contratoPixAutomatico: {
        asaasAuthorizationId: "auth-1",
        asaasConciliationId: "conc-inicial",
      },
    }
    mocks.obterCobrancaAsaas.mockResolvedValue({
      ...pagamentoRemoto("REFUNDED"),
      conciliationIdentifier: "conc-inicial",
      dueDate: "2026-08-29",
      pixAutomaticAuthorizationId: "auth-1",
    })
    mocks.db.cobrancaAsaas.findFirst.mockResolvedValue({
      contratoPixAutomatico: {
        id: "contrato-1",
        asaasAuthorizationId: "auth-1",
        asaasConciliationId: "conc-inicial",
        aluno: { clienteAsaas: { asaasCustomerId: "cus_1" } },
      },
    })
    mocks.obterAutorizacaoPixAutomaticoAsaas.mockResolvedValue({
      id: "auth-1",
      customerId: "cus_1",
      contractId: "ecvo-contrato-1",
      status: "ACTIVE",
    })
    mocks.tx.cobrancaAsaas.findFirst.mockImplementation((args) =>
      args?.where?.OR ? cobrancaInicial : null,
    )
    mocks.tx.contratoPixAutomatico.findUnique.mockResolvedValue({
      alunoId: "aluno-1",
      status: "ATIVO",
    })
    mocks.tx.mensalidade.findUnique.mockResolvedValue({
      id: "mensalidade-1",
      alunoId: "aluno-1",
      competencia: "2026-09",
      valor: 150,
      vencimento,
      status: "PAGA",
      formaPagamento: "PIX_ASAAS",
      cobrancaQuitacaoAsaasId: "cobranca-1",
      observacao: null,
      aluno: { usuarioId: "usuario-1" },
    })

    await processarWebhookAsaas({
      id: "evt_estorno_inicial",
      event: "PAYMENT_REFUNDED",
      payment: { id: "pay_1" },
    })

    expect(mocks.cancelarAutorizacaoPixAutomaticoAsaas).toHaveBeenCalledWith("auth-1")
    expect(mocks.tx.contratoPixAutomatico.update).toHaveBeenCalledWith({
      where: { id: "contrato-1" },
      data: {
        status: "CANCELADO",
        ultimoErro: "Pagamento inicial estornado; autorização recorrente encerrada.",
      },
    })
    expect(mocks.tx.aluno.update).toHaveBeenCalledWith({
      where: { id: "aluno-1" },
      data: { tipoCobrancaPix: "MENSAL" },
    })
    expect(mocks.tx.mensalidade.updateMany).toHaveBeenCalledWith({
      where: {
        contratoPixAutomaticoId: "contrato-1",
        status: { in: ["EM_ABERTO", "VENCIDA", "CANCELADA"] },
      },
      data: { contratoPixAutomaticoId: null, numeroCicloPix: null },
    })
  })

  it("não confunde o estorno de um ciclo recorrente com o pagamento inicial", async () => {
    const cobrancaRecorrente = {
      ...cobrancaLocal,
      id: "cobranca-ciclo-2",
      mensalidadeId: "mensalidade-2",
      contratoPixAutomaticoId: "contrato-1",
      asaasPaymentId: "pay-ciclo-2",
      externalReference: "pixauto:contrato-1:2",
      tipo: "PIX_AUTOMATICO_RECORRENTE" as const,
      status: "RECEBIDA" as const,
      contratoPixAutomatico: {
        asaasAuthorizationId: "auth-1",
        asaasConciliationId: "conc-inicial",
      },
    }
    mocks.obterCobrancaAsaas.mockResolvedValue({
      ...pagamentoRemoto("REFUNDED"),
      id: "pay-ciclo-2",
      conciliationIdentifier: "conc-ciclo-2",
      externalReference: "pixauto:contrato-1:2",
      pixAutomaticAuthorizationId: "auth-1",
    })
    mocks.db.cobrancaAsaas.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce(null)
    mocks.tx.cobrancaAsaas.findFirst.mockImplementation((args) =>
      args?.where?.OR ? cobrancaRecorrente : null,
    )
    mocks.tx.mensalidade.findUnique.mockResolvedValue({
      id: "mensalidade-2",
      alunoId: "aluno-1",
      competencia: "2026-09",
      valor: 150,
      vencimento,
      status: "PAGA",
      formaPagamento: "PIX_ASAAS",
      cobrancaQuitacaoAsaasId: "cobranca-ciclo-2",
      observacao: null,
      aluno: { usuarioId: "usuario-1" },
    })

    await processarWebhookAsaas({
      id: "evt_estorno_ciclo_2",
      event: "PAYMENT_REFUNDED",
      payment: { id: "pay-ciclo-2" },
    })

    expect(mocks.cancelarAutorizacaoPixAutomaticoAsaas).not.toHaveBeenCalled()
    expect(mocks.tx.contratoPixAutomatico.update).not.toHaveBeenCalled()
    expect(mocks.tx.mensalidade.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: "mensalidade-2",
          cobrancaQuitacaoAsaasId: "cobranca-ciclo-2",
        }),
      }),
    )
  })
})

describe("reconciliarPendenciasAsaas", () => {
  it("não promove a tentativa histórica antes da eleição protegida pelo lock", async () => {
    vi.clearAllMocks()
    const tentativaHistorica = {
      ...cobrancaLocal,
      id: "cobranca-historica",
      asaasPaymentId: "pay-historico",
      externalReference: "mensalidade:mensalidade-1:tentativa:1",
      status: "PENDENTE" as const,
      ativa: false,
      geracao: 1,
      vencimentoAsaas: vencimento,
      pixCopiaECola: null,
      qrCodeExpiraEm: null,
      atualizadoEm: new Date("2026-09-11T12:00:00.000Z"),
    }
    const remota = {
      ...pagamentoRemoto("RECEIVED"),
      id: "pay-historico",
      externalReference: tentativaHistorica.externalReference,
    }
    mocks.db.cobrancaAsaas.findMany.mockResolvedValue([tentativaHistorica])
    mocks.db.contratoPixAutomatico.findMany.mockResolvedValue([])
    mocks.listarCobrancasAsaas.mockResolvedValue({ data: [remota], totalCount: 1, hasMore: false })
    mocks.tx.cobrancaAsaas.findUniqueOrThrow.mockResolvedValue(tentativaHistorica)
    mocks.tx.cobrancaAsaas.findUnique.mockResolvedValue({ status: "RECEBIDA", ativa: false })
    mocks.tx.cobrancaAsaas.findFirst.mockImplementation((args) => {
      if (args?.where?.OR) return tentativaHistorica
      if (args?.where?.ativa === true) return { id: "cobranca-eleita", status: "RECEBIDA" }
      return null
    })
    mocks.tx.cobrancaAsaas.update.mockResolvedValue({
      ...tentativaHistorica,
      status: "RECEBIDA",
      ativa: false,
    })
    mocks.tx.eventoWebhookAsaas.createMany.mockResolvedValue({ count: 1 })
    mocks.tx.mensalidade.findUnique.mockResolvedValue({
      id: "mensalidade-1",
      alunoId: "aluno-1",
      competencia: "2026-09",
      valor: 150,
      vencimento,
      status: "PAGA",
      formaPagamento: "PIX_ASAAS",
      cobrancaQuitacaoAsaasId: "cobranca-eleita",
      observacao: null,
      aluno: { usuarioId: "usuario-1" },
    })
    mocks.tx.mensalidade.updateMany.mockResolvedValue({ count: 0 })
    mocks.tx.usuario.findMany.mockResolvedValue([])

    const resultado = await reconciliarPendenciasAsaas()

    expect(resultado).toMatchObject({ ok: true, pagamentosAnalisados: 1, pagamentosAtualizados: 1 })
    expect(mocks.tx.cobrancaAsaas.update).toHaveBeenNthCalledWith(1, {
      where: { id: "cobranca-historica" },
      data: expect.objectContaining({ status: "RECEBIDA", ativa: false }),
    })
    expect(mocks.tx.$queryRaw).toHaveBeenCalled()
  })
})

describe("processarCobrancasPixAutomaticoPendentes", () => {
  it("materializa um PIX de contingência quando a janela automática foi perdida", async () => {
    vi.clearAllMocks()
    const hoje = new Date("2026-09-10T12:00:00.000Z")
    const vencimentoPerdido = new Date("2026-09-09T12:00:00.000Z")
    const intencao = {
      id: "fallback-1",
      mensalidadeId: "mensalidade-2",
      contratoPixAutomaticoId: "contrato-1",
      tipo: "PIX_AUTOMATICO_FALLBACK" as const,
      status: "CRIANDO" as const,
      geracao: 1,
      ativa: true,
      asaasPaymentId: null,
      externalReference: "pixauto-fallback:contrato-1:2:1",
      vencimentoAsaas: new Date("2026-09-10T15:00:00.000Z"),
      statusAsaas: null,
      pixCopiaECola: null,
      qrCodeExpiraEm: null,
      invoiceUrl: null,
      ultimoEventoAsaas: null,
      ultimoErro: null,
      estornoParcialPendenteEm: null,
      criadoEm: hoje,
      atualizadoEm: hoje,
    }
    mocks.db.mensalidade.findMany.mockResolvedValue([
      {
        id: "mensalidade-2",
        status: "VENCIDA",
        valor: 150,
        vencimento: vencimentoPerdido,
        numeroCicloPix: 2,
        cobrancasAsaas: [],
        contratoPixAutomatico: {
          id: "contrato-1",
          asaasAuthorizationId: "auth-1",
          aluno: { clienteAsaas: { asaasCustomerId: "cus-1" } },
        },
      },
    ])
    mocks.tx.mensalidade.findUnique
      .mockReset()
      .mockResolvedValueOnce({ status: "VENCIDA" })
      .mockResolvedValueOnce({
        competencia: "2026-09",
        aluno: { usuarioId: "usuario-1" },
      })
    mocks.tx.cobrancaAsaas.findFirst.mockReset().mockResolvedValue(null)
    mocks.tx.cobrancaAsaas.create.mockResolvedValue(intencao)
    mocks.tx.cobrancaAsaas.findUniqueOrThrow.mockResolvedValue(intencao)
    mocks.tx.cobrancaAsaas.update.mockResolvedValue({
      ...intencao,
      status: "PENDENTE",
      asaasPaymentId: "pay-fallback",
    })
    mocks.tx.notificacao.create.mockResolvedValue({ id: "notificacao-1" })
    mocks.tx.usuario.findMany.mockResolvedValue([{ id: "gestor-1" }])
    mocks.tx.notificacao.createMany.mockResolvedValue({ count: 1 })
    mocks.listarCobrancasAsaas.mockResolvedValue({ data: [], totalCount: 0, hasMore: false })
    mocks.criarCobrancaAsaas.mockResolvedValue({
      object: "payment",
      id: "pay-fallback",
      customer: "cus-1",
      billingType: "PIX",
      value: 150,
      status: "PENDING",
      dueDate: "2026-09-10",
      externalReference: intencao.externalReference,
    })
    mocks.obterQrCodePixAsaas.mockResolvedValue({
      encodedImage: "",
      payload: "pix-copia-e-cola",
      expirationDate: "2026-09-11 12:00:00",
    })

    const resultado = await processarCobrancasPixAutomaticoPendentes(hoje)

    expect(resultado).toMatchObject({ ok: true, analisadas: 1, criadas: 1, falhas: [] })
    expect(mocks.criarCobrancaAsaas).toHaveBeenCalledWith(
      expect.objectContaining({
        externalReference: intencao.externalReference,
        pixAutomaticAuthorizationId: undefined,
        dueDate: "2026-09-10",
      }),
    )
    expect(mocks.obterQrCodePixAsaas).toHaveBeenCalledWith("pay-fallback")
  })
})

describe("gerarCobrancaPixMensal", () => {
  it("preserva a tentativa estornada e cria uma nova geração sob lock da mensalidade", async () => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-09-11T12:00:00.000Z"))
    const vencimentoNormalizado = new Date("2026-09-11T15:00:00.000Z")
    const antiga = {
      id: "cobranca-antiga",
      mensalidadeId: "mensalidade-3",
      contratoPixAutomaticoId: null,
      tipo: "PIX_MENSAL" as const,
      status: "ESTORNADA" as const,
      geracao: 1,
      ativa: false,
      asaasPaymentId: "pay-antigo",
      externalReference: "mensalidade:mensalidade-3",
      vencimentoAsaas: vencimento,
      statusAsaas: "REFUNDED",
      pixCopiaECola: null,
      qrCodeExpiraEm: null,
      invoiceUrl: null,
      ultimoEventoAsaas: "PAYMENT_REFUNDED",
      ultimoErro: null,
      estornoParcialPendenteEm: null,
      criadoEm: vencimento,
      atualizadoEm: vencimento,
    }
    const nova = {
      ...antiga,
      id: "cobranca-nova",
      status: "CRIANDO" as const,
      geracao: 2,
      ativa: true,
      asaasPaymentId: null,
      externalReference: "mensalidade:mensalidade-3:tentativa:2",
      vencimentoAsaas: vencimentoNormalizado,
      statusAsaas: null,
      ultimoEventoAsaas: null,
    }
    mocks.db.mensalidade.findFirst.mockResolvedValue({
      id: "mensalidade-3",
      alunoId: "aluno-3",
      status: "VENCIDA",
      valor: 150,
      vencimento,
      competencia: "2026-09",
      contratoPixAutomaticoId: null,
      aluno: { tipoCobrancaPix: "MENSAL" },
      cobrancasAsaas: [antiga],
      contratoPixAutomatico: null,
    })
    mocks.tx.mensalidade.findUnique.mockReset().mockResolvedValue({ status: "VENCIDA" })
    mocks.tx.cobrancaAsaas.findFirst.mockReset().mockResolvedValue(antiga)
    mocks.tx.cobrancaAsaas.findUnique.mockResolvedValue(antiga)
    mocks.tx.cobrancaAsaas.update
      .mockResolvedValueOnce({ ...antiga, ativa: false })
      .mockResolvedValueOnce({ ...nova, status: "PENDENTE", asaasPaymentId: "pay-novo" })
    mocks.tx.cobrancaAsaas.create.mockResolvedValue(nova)
    mocks.tx.cobrancaAsaas.findUniqueOrThrow.mockResolvedValue(nova)
    mocks.db.aluno.findUnique.mockResolvedValue({
      id: "aluno-3",
      cpf: "12345678901",
      telefone: null,
      usuario: { nome: "Aluno", email: "aluno@example.com" },
      responsavel: null,
      clienteAsaas: { asaasCustomerId: "cus-3" },
    })
    mocks.listarCobrancasAsaas.mockResolvedValue({ data: [], totalCount: 0, hasMore: false })
    mocks.criarCobrancaAsaas.mockResolvedValue({
      object: "payment",
      id: "pay-novo",
      customer: "cus-3",
      billingType: "PIX",
      value: 150,
      status: "PENDING",
      dueDate: "2026-09-11",
      externalReference: nova.externalReference,
    })
    mocks.obterQrCodePixAsaas.mockResolvedValue({
      encodedImage: "",
      payload: "pix-novo",
      expirationDate: "2026-09-11 12:00:00",
    })

    const resultado = await gerarCobrancaPixMensal({
      alunoId: "aluno-3",
      mensalidadeId: "mensalidade-3",
      autorId: "usuario-3",
    })

    expect(resultado.ok).toBe(true)
    expect(mocks.tx.cobrancaAsaas.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        geracao: 2,
        externalReference: nova.externalReference,
        vencimentoAsaas: vencimentoNormalizado,
      }),
    })
    expect(mocks.criarCobrancaAsaas).toHaveBeenCalledWith(
      expect.objectContaining({
        externalReference: nova.externalReference,
        dueDate: "2026-09-11",
      }),
    )
    expect(mocks.tx.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.tx.cobrancaAsaas.create.mock.invocationCallOrder[0],
    )
  })

  it("retoma a geração mais recente em erro sem voltar à referência da primeira tentativa", async () => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-09-11T12:00:00.000Z"))
    const vencimentoNormalizado = new Date("2026-09-11T15:00:00.000Z")
    const primeira = {
      id: "cobranca-primeira",
      mensalidadeId: "mensalidade-4",
      contratoPixAutomaticoId: null,
      tipo: "PIX_MENSAL" as const,
      status: "ESTORNADA" as const,
      geracao: 1,
      ativa: false,
      asaasPaymentId: "pay-primeiro",
      externalReference: "mensalidade:mensalidade-4",
      vencimentoAsaas: vencimento,
      atualizadoEm: vencimento,
    }
    const segunda = {
      ...primeira,
      id: "cobranca-segunda",
      status: "ERRO" as const,
      geracao: 2,
      ativa: true,
      asaasPaymentId: null,
      externalReference: "mensalidade:mensalidade-4:tentativa:2",
      ultimoErro: "falha transitória",
    }
    const retomada = {
      ...segunda,
      status: "CRIANDO" as const,
      vencimentoAsaas: vencimentoNormalizado,
      ultimoErro: null,
    }
    mocks.db.mensalidade.findFirst.mockResolvedValue({
      id: "mensalidade-4",
      alunoId: "aluno-4",
      status: "VENCIDA",
      valor: 150,
      vencimento,
      competencia: "2026-09",
      contratoPixAutomaticoId: null,
      aluno: { tipoCobrancaPix: "MENSAL" },
      cobrancasAsaas: [segunda],
      contratoPixAutomatico: null,
    })
    mocks.tx.mensalidade.findUnique.mockReset().mockResolvedValue({ status: "VENCIDA" })
    mocks.tx.cobrancaAsaas.findFirst.mockResolvedValue(segunda)
    mocks.tx.cobrancaAsaas.findUnique.mockResolvedValue(primeira)
    mocks.tx.cobrancaAsaas.update
      .mockResolvedValueOnce(retomada)
      .mockResolvedValueOnce({ ...retomada, status: "PENDENTE", asaasPaymentId: "pay-segundo" })
    mocks.tx.cobrancaAsaas.findUniqueOrThrow.mockResolvedValue(retomada)
    mocks.db.aluno.findUnique.mockResolvedValue({
      id: "aluno-4",
      cpf: "12345678901",
      telefone: null,
      usuario: { nome: "Aluno", email: "aluno@example.com" },
      responsavel: null,
      clienteAsaas: { asaasCustomerId: "cus-4" },
    })
    mocks.listarCobrancasAsaas.mockResolvedValue({ data: [], totalCount: 0, hasMore: false })
    mocks.criarCobrancaAsaas.mockResolvedValue({
      object: "payment",
      id: "pay-segundo",
      customer: "cus-4",
      billingType: "PIX",
      value: 150,
      status: "PENDING",
      dueDate: "2026-09-11",
      externalReference: segunda.externalReference,
    })
    mocks.obterQrCodePixAsaas.mockResolvedValue({
      encodedImage: "",
      payload: "pix-segundo",
      expirationDate: "2026-09-11 12:00:00",
    })

    const resultado = await gerarCobrancaPixMensal({
      alunoId: "aluno-4",
      mensalidadeId: "mensalidade-4",
      autorId: "usuario-4",
    })

    expect(resultado.ok).toBe(true)
    expect(mocks.tx.cobrancaAsaas.create).not.toHaveBeenCalled()
    expect(mocks.tx.cobrancaAsaas.update).toHaveBeenCalledWith({
      where: { id: "cobranca-segunda" },
      data: {
        ativa: true,
        status: "CRIANDO",
        vencimentoAsaas: vencimentoNormalizado,
        ultimoErro: null,
      },
    })
    expect(mocks.criarCobrancaAsaas).toHaveBeenCalledWith(
      expect.objectContaining({
        externalReference: segunda.externalReference,
        dueDate: "2026-09-11",
      }),
    )
  })
})

describe("cancelamento operacional Asaas", () => {
  const atualizadaEm = new Date("2026-09-11T12:00:00.000Z")
  const cobrancaOperacional = {
    ...cobrancaLocal,
    ativa: true,
    atualizadoEm: atualizadaEm,
    vencimentoAsaas: vencimento,
    estornoParcialPendenteEm: null,
  }

  it("libera uma intenção local em erro somente depois de confirmar ausência remota", async () => {
    vi.clearAllMocks()
    mocks.db.cobrancaAsaas.findUnique.mockResolvedValue({
      ...cobrancaOperacional,
      asaasPaymentId: null,
      status: "ERRO",
    })
    mocks.db.cobrancaAsaas.updateMany.mockResolvedValue({ count: 1 })
    mocks.listarCobrancasAsaas.mockResolvedValue({ data: [], totalCount: 0, hasMore: false })
    mocks.tx.cobrancaAsaas.findUnique.mockResolvedValue({
      ...cobrancaOperacional,
      asaasPaymentId: null,
      status: "CANCELANDO",
    })
    mocks.tx.cobrancaAsaas.update.mockResolvedValue({ id: cobrancaOperacional.id })

    const resultado = await cancelarCobrancaAsaasPendente({
      cobrancaId: cobrancaOperacional.id,
      autorId: "gestor-1",
    })

    expect(resultado).toEqual({ ok: true })
    expect(mocks.listarCobrancasAsaas).toHaveBeenCalledWith({
      externalReference: cobrancaOperacional.externalReference,
      limit: 2,
    })
    expect(mocks.excluirCobrancaAsaas).not.toHaveBeenCalled()
    expect(mocks.tx.cobrancaAsaas.update).toHaveBeenCalledWith({
      where: { id: cobrancaOperacional.id },
      data: expect.objectContaining({ status: "CANCELADA", ativa: false }),
    })
    expect(mocks.registrarLog).toHaveBeenCalled()
  })

  it("consulta e exclui a cobrança pendente antes de liberar a baixa manual", async () => {
    vi.clearAllMocks()
    mocks.db.cobrancaAsaas.findUnique.mockResolvedValue(cobrancaOperacional)
    mocks.db.cobrancaAsaas.updateMany.mockResolvedValue({ count: 1 })
    mocks.obterCobrancaAsaas.mockResolvedValue({
      ...pagamentoRemoto(),
      status: "PENDING",
      paymentDate: null,
    })
    mocks.excluirCobrancaAsaas.mockResolvedValue({ deleted: true, id: "pay_1" })
    mocks.tx.cobrancaAsaas.findUnique.mockResolvedValue({
      ...cobrancaOperacional,
      status: "CANCELANDO",
    })
    mocks.tx.cobrancaAsaas.update.mockResolvedValue({ id: cobrancaOperacional.id })

    const resultado = await cancelarCobrancaAsaasPendente({
      cobrancaId: cobrancaOperacional.id,
      autorId: "gestor-1",
    })

    expect(resultado).toEqual({ ok: true })
    expect(mocks.excluirCobrancaAsaas).toHaveBeenCalledWith("pay_1")
    expect(mocks.tx.cobrancaAsaas.update).toHaveBeenCalledWith({
      where: { id: cobrancaOperacional.id },
      data: expect.objectContaining({ status: "CANCELADA", statusAsaas: "DELETED" }),
    })
  })

  it("cancela localmente um contrato interrompido sem autorização remota", async () => {
    vi.clearAllMocks()
    const contrato = {
      id: "contrato-cancelar",
      alunoId: "aluno-1",
      status: "ERRO",
      atualizadoEm: atualizadaEm,
      criadoEm: atualizadaEm,
      asaasAuthorizationId: null,
      inicio: vencimento,
      fim: new Date("2027-02-10T15:00:00.000Z"),
      valor: 150,
      aluno: { clienteAsaas: null },
      cobrancas: [],
      mensalidades: [{ id: "mensalidade-1" }],
    }
    mocks.db.contratoPixAutomatico.findFirst.mockResolvedValue(contrato)
    mocks.db.contratoPixAutomatico.updateMany.mockResolvedValue({ count: 1 })
    mocks.tx.contratoPixAutomatico.findUnique.mockResolvedValue({
      ...contrato,
      status: "CANCELANDO",
    })
    mocks.tx.contratoPixAutomatico.update.mockResolvedValue({
      ...contrato,
      status: "CANCELADO",
    })
    mocks.tx.cobrancaAsaas.updateMany.mockResolvedValue({ count: 1 })
    mocks.tx.aluno.update.mockResolvedValue({ id: "aluno-1" })

    const resultado = await cancelarPixAutomatico({ alunoId: "aluno-1", autorId: "usuario-1" })

    expect(resultado).toEqual({ ok: true })
    expect(mocks.cancelarAutorizacaoPixAutomaticoAsaas).not.toHaveBeenCalled()
    expect(mocks.tx.contratoPixAutomatico.update).toHaveBeenCalledWith({
      where: { id: contrato.id },
      data: expect.objectContaining({ status: "CANCELADO" }),
    })
    expect(mocks.tx.aluno.update).toHaveBeenCalledWith({
      where: { id: "aluno-1" },
      data: { tipoCobrancaPix: "MENSAL" },
    })
  })

  it("mantém o contrato bloqueado quando o Asaas não confirma o cancelamento", async () => {
    vi.clearAllMocks()
    const contrato = {
      id: "contrato-ativo",
      alunoId: "aluno-1",
      status: "ATIVO",
      atualizadoEm: atualizadaEm,
      criadoEm: atualizadaEm,
      asaasAuthorizationId: "auth-1",
      inicio: vencimento,
      fim: new Date("2027-02-10T15:00:00.000Z"),
      valor: 150,
      aluno: { clienteAsaas: { asaasCustomerId: "cus_1" } },
      cobrancas: [],
      mensalidades: [{ id: "mensalidade-1" }],
    }
    mocks.db.contratoPixAutomatico.findFirst.mockResolvedValue(contrato)
    mocks.db.contratoPixAutomatico.updateMany
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 1 })
    mocks.obterAutorizacaoPixAutomaticoAsaas.mockRejectedValue(new Error("falha remota"))

    const resultado = await cancelarPixAutomatico({ alunoId: "aluno-1", autorId: "usuario-1" })

    expect(resultado).toEqual({ ok: false, motivo: "falha remota" })
    expect(mocks.tx.aluno.update).not.toHaveBeenCalled()
    expect(mocks.db.contratoPixAutomatico.updateMany).toHaveBeenLastCalledWith({
      where: { id: contrato.id, status: "CANCELANDO" },
      data: { status: "ERRO", ultimoErro: "falha remota" },
    })
  })
})

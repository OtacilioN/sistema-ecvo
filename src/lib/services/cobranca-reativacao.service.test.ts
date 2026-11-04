import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  db: {
    cobrancaReativacaoAsaas: { findFirst: vi.fn(), findMany: vi.fn(), updateMany: vi.fn() },
    $transaction: vi.fn(),
  },
  obter: vi.fn(),
  excluir: vi.fn(),
  listar: vi.fn(),
  criar: vi.fn(),
  garantir: vi.fn(),
  processarWebhook: vi.fn(),
  splits: vi.fn(),
  log: vi.fn(),
}))
vi.mock("@/lib/db", () => ({ db: mocks.db }))
vi.mock("@/lib/asaas/client", () => ({
  obterCobrancaAsaas: mocks.obter,
  excluirCobrancaAsaas: mocks.excluir,
  criarCobrancaAsaas: mocks.criar,
  listarCobrancasAsaas: mocks.listar,
  obterQrCodePixAsaas: vi.fn(),
}))
vi.mock("@/lib/services/asaas.service", () => ({
  garantirClienteAsaas: mocks.garantir,
  processarWebhookAsaas: mocks.processarWebhook,
}))
vi.mock("@/lib/services/split-asaas.service", () => ({
  persistirSplitsRemotos: mocks.splits,
  prepararSplitsPagamento: vi.fn(),
  payloadSplitAsaas: vi.fn(),
}))
vi.mock("@/lib/services/auditoria.service", () => ({ registrarLog: mocks.log }))
vi.mock("@/lib/services/elegibilidade-reativacao.service", () => ({
  isencaoAtualDoTrancamento: vi.fn().mockResolvedValue(true),
}))

import {
  aplicarPagamentoCobrancaReativacao,
  cancelarCobrancaReativacaoAvulsa,
  prepararCobrancaReativacaoAvulsa,
  reconciliarCobrancasReativacao,
} from "./cobranca-reativacao.service"

const cobranca = {
  id: "reat-1",
  alunoId: "aluno-1",
  planoId: "plano-1",
  competencia: "2026-11",
  valor: 90,
  asaasPaymentId: "pay-1",
  asaasCustomerId: "cus-1",
  externalReference: "ecvo-reativacao:reat-1",
  vencimentoAsaas: new Date("2026-11-04T12:00:00Z"),
  status: "PENDENTE",
  ativa: true,
  splits: [],
  atualizadoEm: new Date("2026-11-04T12:00:00Z"),
}
const pagamento = {
  id: "pay-1",
  customer: "cus-1",
  billingType: "PIX",
  externalReference: "ecvo-reativacao:reat-1",
  dueDate: "2026-11-04",
  value: 90,
  status: "RECEIVED",
  paymentDate: "2026-11-04",
}
function prepararTx() {
  return {
    $queryRaw: vi.fn(),
    cobrancaReativacaoAsaas: {
      findFirst: vi.fn().mockResolvedValue({ id: cobranca.id }),
      findUniqueOrThrow: vi.fn().mockResolvedValue(cobranca),
      update: vi.fn(),
    },
    aluno: {
      findUnique: vi.fn().mockResolvedValue({ status: "TRANCADO", planoId: "plano-1" }),
      update: vi.fn(),
    },
    operacaoIsencaoTrancamento: { findFirst: vi.fn().mockResolvedValue(null) },
    usuario: { findMany: vi.fn().mockResolvedValue([{ id: "gestor-1" }]) },
    notificacao: { createMany: vi.fn() },
  }
}
beforeEach(() => {
  vi.clearAllMocks()
  mocks.splits.mockResolvedValue({ ok: true })
})

describe("reconciliação automática de reativação", () => {
  it("consulta cobrança pendente em lote limitado e aplica período de espera", async () => {
    mocks.db.cobrancaReativacaoAsaas.findMany.mockResolvedValue([
      {
        id: "reat-1",
        alunoId: "aluno-1",
        status: "PENDENTE",
        asaasPaymentId: "pay-1",
        operacaoPendente: null,
      },
    ])
    mocks.db.cobrancaReativacaoAsaas.findFirst.mockResolvedValue({ asaasPaymentId: "pay-1" })
    mocks.db.cobrancaReativacaoAsaas.updateMany.mockResolvedValue({ count: 1 })
    mocks.obter.mockResolvedValue({ ...pagamento, status: "PENDING" })
    const resultado = await reconciliarCobrancasReativacao({ limite: 100 })
    expect(resultado).toEqual({ processadas: 1, concluidas: 1, falhas: 0 })
    expect(mocks.db.cobrancaReativacaoAsaas.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 25 }),
    )
    expect(mocks.db.cobrancaReativacaoAsaas.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { atualizadoEm: expect.any(Date) } }),
    )
  })
})

describe("baixa da cobrança de reativação separada", () => {
  it("não libera acesso em confirmação sem recebimento", async () => {
    const tx = prepararTx()
    const resultado = await aplicarPagamentoCobrancaReativacao(tx as never, {
      id: "e-1",
      event: "PAYMENT_CONFIRMED",
      payment: pagamento,
    })
    expect(resultado).toEqual({ ok: true })
    expect(tx.aluno.update).not.toHaveBeenCalled()
  })
  it("recebe pagamento válido sem alterar mensalidade isenta", async () => {
    const tx = prepararTx()
    const resultado = await aplicarPagamentoCobrancaReativacao(tx as never, {
      id: "e-2",
      event: "PAYMENT_RECEIVED",
      payment: pagamento,
    })
    expect(resultado).toEqual({ ok: true })
    expect(tx.aluno.update).toHaveBeenCalledWith({
      where: { id: "aluno-1" },
      data: { status: "ATIVO" },
    })
    expect(tx.cobrancaReativacaoAsaas.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "RECEBIDA", ativa: false }),
      }),
    )
    expect(mocks.log).toHaveBeenCalledTimes(2)
  })
  it("não libera se houver divergência no valor", async () => {
    const tx = prepararTx()
    const resultado = await aplicarPagamentoCobrancaReativacao(tx as never, {
      id: "e-3",
      event: "PAYMENT_RECEIVED",
      payment: { ...pagamento, value: 80 },
    })
    expect(resultado).toMatchObject({ ok: false })
    expect(tx.aluno.update).not.toHaveBeenCalled()
  })
  it("não libera enquanto isenção está pendente", async () => {
    const tx = prepararTx()
    tx.operacaoIsencaoTrancamento.findFirst.mockResolvedValue({ id: "op-1" })
    const resultado = await aplicarPagamentoCobrancaReativacao(tx as never, {
      id: "e-4",
      event: "PAYMENT_RECEIVED",
      payment: pagamento,
    })
    expect(resultado).toMatchObject({ ok: false })
    expect(tx.aluno.update).not.toHaveBeenCalled()
  })
  it("registra recebimento e alerta se a matrícula mudou antes do pagamento", async () => {
    const tx = prepararTx()
    tx.aluno.findUnique.mockResolvedValue({ status: "ATIVO", planoId: "plano-1" })
    const resultado = await aplicarPagamentoCobrancaReativacao(tx as never, {
      id: "e-mudou",
      event: "PAYMENT_RECEIVED",
      payment: pagamento,
    })
    expect(resultado).toEqual({ ok: true })
    expect(tx.cobrancaReativacaoAsaas.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "RECEBIDA", ultimoErro: expect.any(String) }),
      }),
    )
    expect(tx.aluno.update).not.toHaveBeenCalled()
    expect(tx.notificacao.createMany).toHaveBeenCalled()
  })
  it("estorno parcial gera pendência e alerta sem excluir histórico", async () => {
    const tx = prepararTx()
    tx.cobrancaReativacaoAsaas.findUniqueOrThrow.mockResolvedValue({
      ...cobranca,
      status: "RECEBIDA",
      ativa: false,
    })
    const resultado = await aplicarPagamentoCobrancaReativacao(tx as never, {
      id: "e-5",
      event: "PAYMENT_PARTIALLY_REFUNDED",
      payment: { ...pagamento, refundedValue: 10 },
    })
    expect(resultado).toEqual({ ok: true })
    expect(tx.cobrancaReativacaoAsaas.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ estornoParcialPendenteEm: expect.any(Date) }),
      }),
    )
    expect(tx.notificacao.createMany).toHaveBeenCalled()
  })
  it("estorno total preserva evidência de recebimento, marca estornada e alerta gestão", async () => {
    const tx = prepararTx()
    tx.cobrancaReativacaoAsaas.findUniqueOrThrow.mockResolvedValue({
      ...cobranca,
      status: "RECEBIDA",
      ativa: false,
    })
    const resultado = await aplicarPagamentoCobrancaReativacao(tx as never, {
      id: "e-estorno",
      event: "PAYMENT_REFUNDED",
      payment: { ...pagamento, refundedValue: 90 },
    })
    expect(resultado).toEqual({ ok: true })
    expect(tx.cobrancaReativacaoAsaas.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "ESTORNADA",
          ativa: false,
          ultimoErro: expect.any(String),
        }),
      }),
    )
    expect(tx.aluno.update).not.toHaveBeenCalled()
    expect(tx.notificacao.createMany).toHaveBeenCalled()
    expect(mocks.log).toHaveBeenCalled()
  })
})

describe("cancelamento da cobrança de reativação", () => {
  it("permite alteração sem chamada remota quando não há cobrança ativa", async () => {
    mocks.db.cobrancaReativacaoAsaas.findFirst.mockResolvedValue(null)
    expect(
      await cancelarCobrancaReativacaoAvulsa({ alunoId: "aluno-1", autorId: "gestor" }),
    ).toEqual({ ok: true, cancelada: false })
    expect(mocks.obter).not.toHaveBeenCalled()
  })
  it("confirma cancelamento remoto antes de finalizar localmente", async () => {
    const tx = prepararTx()
    tx.cobrancaReativacaoAsaas.findUniqueOrThrow.mockResolvedValue({
      ...cobranca,
      status: "CANCELANDO",
    })
    mocks.db.cobrancaReativacaoAsaas.findFirst.mockResolvedValue(cobranca)
    mocks.db.cobrancaReativacaoAsaas.updateMany.mockResolvedValue({ count: 1 })
    mocks.db.$transaction.mockImplementation(async (fn) => fn(tx))
    mocks.obter.mockResolvedValue({ ...pagamento, status: "PENDING" })
    mocks.excluir.mockResolvedValue({ id: "pay-1", deleted: true })
    expect(
      await cancelarCobrancaReativacaoAvulsa({ alunoId: "aluno-1", autorId: "gestor" }),
    ).toEqual({ ok: true, cancelada: true })
    expect(mocks.excluir).toHaveBeenCalledWith("pay-1")
    expect(tx.cobrancaReativacaoAsaas.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "CANCELADA", ativa: false }),
      }),
    )
  })
  it("retoma cancelamento já concluído remotamente sem excluir outra vez", async () => {
    const tx = prepararTx()
    tx.cobrancaReativacaoAsaas.findUniqueOrThrow.mockResolvedValue({
      ...cobranca,
      status: "CANCELANDO",
    })
    mocks.db.cobrancaReativacaoAsaas.findFirst.mockResolvedValue({ ...cobranca, status: "ERRO" })
    mocks.db.cobrancaReativacaoAsaas.updateMany.mockResolvedValue({ count: 1 })
    mocks.db.$transaction.mockImplementation(async (fn) => fn(tx))
    mocks.obter.mockResolvedValue({ ...pagamento, status: "DELETED" })
    expect(
      await cancelarCobrancaReativacaoAvulsa({ alunoId: "aluno-1", autorId: "gestor" }),
    ).toEqual({ ok: true, cancelada: true })
    expect(mocks.excluir).not.toHaveBeenCalled()
  })
  it("recupera referência quando emissão não gravou o id remoto", async () => {
    const tx = prepararTx()
    tx.cobrancaReativacaoAsaas.findUniqueOrThrow.mockResolvedValue({
      ...cobranca,
      asaasPaymentId: null,
      status: "CANCELANDO",
    })
    mocks.db.cobrancaReativacaoAsaas.findFirst.mockResolvedValue({
      ...cobranca,
      asaasPaymentId: null,
      status: "ERRO",
    })
    mocks.db.cobrancaReativacaoAsaas.updateMany.mockResolvedValue({ count: 1 })
    mocks.db.$transaction.mockImplementation(async (fn) => fn(tx))
    mocks.listar.mockResolvedValue({ data: [{ ...pagamento, status: "DELETED" }] })
    expect(
      await cancelarCobrancaReativacaoAvulsa({ alunoId: "aluno-1", autorId: "gestor" }),
    ).toEqual({ ok: true, cancelada: true })
    expect(tx.cobrancaReativacaoAsaas.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ asaasPaymentId: "pay-1" }) }),
    )
  })
  it("bloqueia mudança se a cobrança foi recebida durante cancelamento", async () => {
    mocks.db.cobrancaReativacaoAsaas.findFirst.mockResolvedValue(cobranca)
    mocks.db.cobrancaReativacaoAsaas.updateMany.mockResolvedValue({ count: 1 })
    mocks.obter.mockResolvedValue(pagamento)
    mocks.processarWebhook.mockResolvedValue({ ok: true })
    const resultado = await cancelarCobrancaReativacaoAvulsa({
      alunoId: "aluno-1",
      autorId: "gestor",
    })
    expect(resultado).toMatchObject({ ok: false })
    expect(mocks.processarWebhook).toHaveBeenCalled()
    expect(mocks.excluir).not.toHaveBeenCalled()
  })
  it("não libera alteração sem confirmação de exclusão do provedor", async () => {
    mocks.db.cobrancaReativacaoAsaas.findFirst.mockResolvedValue(cobranca)
    mocks.db.cobrancaReativacaoAsaas.updateMany.mockResolvedValue({ count: 1 })
    mocks.obter.mockResolvedValue({ ...pagamento, status: "PENDING" })
    mocks.excluir.mockResolvedValue({ id: "pay-1", deleted: false })
    const resultado = await cancelarCobrancaReativacaoAvulsa({
      alunoId: "aluno-1",
      autorId: "gestor",
    })
    expect(resultado).toMatchObject({ ok: false })
    expect(mocks.db.$transaction).not.toHaveBeenCalled()
  })
})

describe("recuperação de emissão da reativação", () => {
  it("não emite segunda cobrança após POST anterior incerto e pesquisa vazia", async () => {
    const retomada = {
      ...cobranca,
      status: "ERRO",
      operacaoPendente: "EMITIR",
      asaasPaymentId: null,
    }
    const tx = {
      $queryRaw: vi.fn(),
      aluno: {
        findUnique: vi.fn().mockResolvedValue({
          id: "aluno-1",
          status: "TRANCADO",
          plano: {
            id: "plano-1",
            nome: "Plano",
            ativo: true,
            periodicidade: "MENSAL",
            valor: 90,
          },
          modalidadesPlano: [{ plataformaExterna: null }],
        }),
      },
      mensalidade: {
        findUnique: vi.fn().mockResolvedValue({
          id: "mens-1",
          alunoId: "aluno-1",
          status: "ISENTA",
          atualizadoEm: new Date(),
        }),
      },
      operacaoIsencaoTrancamento: { findFirst: vi.fn().mockResolvedValue(null) },
      cobrancaReativacaoAsaas: {
        findFirst: vi.fn().mockResolvedValue(retomada),
        update: vi.fn().mockResolvedValue(retomada),
      },
    }
    mocks.garantir.mockResolvedValue({ ok: true, customerId: "cus-1" })
    mocks.db.$transaction.mockImplementation(async (fn) => fn(tx))
    mocks.db.cobrancaReativacaoAsaas.updateMany.mockResolvedValue({ count: 1 })
    mocks.listar.mockResolvedValue({ data: [] })
    const resultado = await prepararCobrancaReativacaoAvulsa({
      alunoId: "aluno-1",
      autorId: "gestor",
    })
    expect(resultado).toMatchObject({ ok: false })
    expect(mocks.criar).not.toHaveBeenCalled()
  })
})

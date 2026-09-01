import { Prisma } from "@prisma/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => {
  const tx = {
    $queryRaw: vi.fn(),
    solicitacaoMatricula: { findUnique: vi.fn() },
    cobrancaMatriculaAsaas: {
      findFirst: vi.fn(),
      findUniqueOrThrow: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      create: vi.fn(),
    },
  }
  const db = {
    plano: { findFirst: vi.fn() },
    solicitacaoMatricula: { findUnique: vi.fn() },
    cobrancaMatriculaAsaas: { updateMany: vi.fn() },
    $transaction: vi.fn(async (callback: (cliente: typeof tx) => unknown) => callback(tx)),
  }
  return {
    db,
    tx,
    criarClienteAsaas: vi.fn(),
    criarCobrancaAsaas: vi.fn(),
    excluirCobrancaAsaas: vi.fn(),
    listarClientesAsaas: vi.fn(),
    listarCobrancasAsaas: vi.fn(),
    obterCobrancaAsaas: vi.fn(),
    obterQrCodePixAsaas: vi.fn(),
    registrarLog: vi.fn(),
  }
})

vi.mock("@/lib/db", () => ({ db: mocks.db }))
vi.mock("@/lib/asaas/client", () => ({
  criarClienteAsaas: mocks.criarClienteAsaas,
  criarCobrancaAsaas: mocks.criarCobrancaAsaas,
  excluirCobrancaAsaas: mocks.excluirCobrancaAsaas,
  listarClientesAsaas: mocks.listarClientesAsaas,
  listarCobrancasAsaas: mocks.listarCobrancasAsaas,
  obterCobrancaAsaas: mocks.obterCobrancaAsaas,
  obterQrCodePixAsaas: mocks.obterQrCodePixAsaas,
}))
vi.mock("@/lib/services/auditoria.service", () => ({ registrarLog: mocks.registrarLog }))

import {
  aplicarWebhookPagamentoMatricula,
  gerarCobrancaMatriculaAsaas,
  pixCobrancaMatriculaDisponivel,
  reemitirCobrancaMatriculaAsaas,
} from "./pagamento-matricula.service"

const solicitacao = {
  id: "solicitacao-1",
  tokenAcompanhamento: "token-acompanhamento-1",
  status: "PENDENTE",
  tipoPagamento: "MENSALISTA",
  nome: "Aluno",
  email: "aluno@example.com",
  cpf: "52998224725",
  telefone: null,
  plano: { id: "plano-1", valor: 100 },
}

const cobrancaAntiga = {
  id: "cobranca-1",
  solicitacaoId: solicitacao.id,
  mensalidadeId: null,
  status: "PENDENTE",
  geracao: 1,
  ativa: true,
  asaasCustomerId: "cus-1",
  asaasPaymentId: "pay-1",
  externalReference: "matricula:solicitacao-1",
  competencia: "2026-08",
  valor: 100,
  vencimentoAsaas: new Date("2026-08-31T15:00:00.000Z"),
  statusAsaas: "PENDING",
  pixCopiaECola: "pix-antigo",
  qrCodeExpiraEm: new Date("2026-08-31T23:59:00.000Z"),
  invoiceUrl: null,
  ultimoEventoAsaas: null,
  ultimoErro: null,
  recebidaEmAsaas: null,
  estornoParcialPendenteEm: null,
  criadoEm: new Date("2026-08-31T18:00:00.000Z"),
  atualizadoEm: new Date("2026-08-31T23:00:00.000Z"),
}

function pagamentoRemoto(
  status: "PENDING" | "CONFIRMED" | "OVERDUE" | "RECEIVED" | "REFUNDED" = "PENDING",
) {
  return {
    object: "payment" as const,
    id: "pay-1",
    customer: "cus-1",
    billingType: "PIX" as const,
    value: 100,
    status,
    dueDate: "2026-08-31",
    externalReference: "matricula:solicitacao-1",
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers()
  vi.setSystemTime(new Date("2026-09-01T00:14:00.000Z"))
  mocks.tx.solicitacaoMatricula.findUnique.mockImplementation(({ select }) =>
    select ? { id: solicitacao.id } : solicitacao,
  )
  mocks.listarClientesAsaas.mockResolvedValue({
    data: [{ id: "cus-1" }],
    totalCount: 1,
    hasMore: false,
  })
  mocks.listarCobrancasAsaas.mockResolvedValue({ data: [], totalCount: 0, hasMore: false })
  mocks.db.cobrancaMatriculaAsaas.updateMany.mockResolvedValue({ count: 1 })
  mocks.tx.cobrancaMatriculaAsaas.updateMany.mockResolvedValue({ count: 1 })
})

afterEach(() => {
  vi.useRealTimers()
})

describe("disponibilidade do PIX de matrícula", () => {
  it("oculta payload expirado ou em estado remoto não pagável", () => {
    expect(
      pixCobrancaMatriculaDisponivel({
        status: "PENDENTE",
        statusAsaas: "PENDING",
        pixCopiaECola: "pix",
        qrCodeExpiraEm: new Date("2026-09-01T00:13:59.000Z"),
      }),
    ).toBe(false)
    expect(
      pixCobrancaMatriculaDisponivel({
        status: "PENDENTE",
        statusAsaas: "CONFIRMED",
        pixCopiaECola: "pix",
        qrCodeExpiraEm: new Date("2026-09-01T01:00:00.000Z"),
      }),
    ).toBe(false)
  })
})

describe("sincronização e reemissão", () => {
  it("persiste OVERDUE como VENCIDA sem tentar recuperar QR", async () => {
    mocks.tx.cobrancaMatriculaAsaas.findFirst.mockResolvedValue(cobrancaAntiga)
    mocks.tx.cobrancaMatriculaAsaas.findUniqueOrThrow.mockResolvedValue(cobrancaAntiga)
    mocks.tx.cobrancaMatriculaAsaas.update.mockImplementation(({ data }) => ({
      ...cobrancaAntiga,
      ...data,
    }))
    mocks.obterCobrancaAsaas.mockResolvedValue(pagamentoRemoto("OVERDUE"))

    const resultado = await gerarCobrancaMatriculaAsaas(solicitacao.tokenAcompanhamento, {
      verificar: true,
    })

    expect(resultado).toMatchObject({ ok: true, cobranca: { status: "VENCIDA" } })
    expect(mocks.tx.cobrancaMatriculaAsaas.update).toHaveBeenCalledWith({
      where: { id: cobrancaAntiga.id },
      data: expect.objectContaining({
        status: "VENCIDA",
        statusAsaas: "OVERDUE",
        ativa: false,
        pixCopiaECola: null,
        qrCodeExpiraEm: null,
      }),
    })
    expect(mocks.obterQrCodePixAsaas).not.toHaveBeenCalled()
  })

  it("cancela a tentativa PENDING com QR expirado antes de criar a geração seguinte", async () => {
    let ultima = cobrancaAntiga
    const registros = new Map([[cobrancaAntiga.id, cobrancaAntiga]])
    mocks.tx.cobrancaMatriculaAsaas.findFirst.mockImplementation(() => ultima)
    mocks.tx.cobrancaMatriculaAsaas.findUniqueOrThrow.mockImplementation(({ where }) =>
      registros.get(where.id),
    )
    mocks.tx.cobrancaMatriculaAsaas.update.mockImplementation(({ where, data }) => {
      const atualizada = { ...registros.get(where.id), ...data }
      registros.set(where.id, atualizada)
      if (ultima.id === where.id) ultima = atualizada
      return atualizada
    })
    mocks.tx.cobrancaMatriculaAsaas.create.mockImplementation(({ data }) => {
      const nova = {
        ...cobrancaAntiga,
        ...data,
        id: "cobranca-2",
        status: "CRIANDO",
        ativa: true,
        asaasCustomerId: null,
        asaasPaymentId: null,
        statusAsaas: null,
        pixCopiaECola: null,
        qrCodeExpiraEm: null,
      }
      registros.set(nova.id, nova)
      ultima = nova
      return nova
    })
    mocks.obterCobrancaAsaas.mockResolvedValue(pagamentoRemoto("PENDING"))
    mocks.obterQrCodePixAsaas
      .mockResolvedValueOnce({
        encodedImage: "",
        payload: "pix-expirado",
        expirationDate: "2026-08-31 21:13:00",
      })
      .mockResolvedValueOnce({
        encodedImage: "",
        payload: "pix-novo",
        expirationDate: "2026-09-01 22:00:00",
      })
    mocks.excluirCobrancaAsaas.mockResolvedValue({ id: "pay-1", deleted: true })
    mocks.criarCobrancaAsaas.mockResolvedValue({
      ...pagamentoRemoto("PENDING"),
      id: "pay-2",
      externalReference: "matricula:solicitacao-1:tentativa:2",
      dueDate: "2026-08-31",
    })

    const resultado = await reemitirCobrancaMatriculaAsaas(solicitacao.tokenAcompanhamento)

    expect(resultado).toMatchObject({ ok: true, reemitida: true })
    expect(mocks.excluirCobrancaAsaas).toHaveBeenCalledWith("pay-1")
    expect(mocks.excluirCobrancaAsaas.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.tx.cobrancaMatriculaAsaas.create.mock.invocationCallOrder[0],
    )
    expect(mocks.tx.cobrancaMatriculaAsaas.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        geracao: 2,
        externalReference: "matricula:solicitacao-1:tentativa:2",
      }),
    })
  })

  it("preserva REFUNDED como ESTORNADA ao criar a geração seguinte", async () => {
    let ultima = cobrancaAntiga
    const registros = new Map([[cobrancaAntiga.id, cobrancaAntiga]])
    mocks.tx.cobrancaMatriculaAsaas.findFirst.mockImplementation(() => ultima)
    mocks.tx.cobrancaMatriculaAsaas.findUniqueOrThrow.mockImplementation(({ where }) =>
      registros.get(where.id),
    )
    mocks.tx.cobrancaMatriculaAsaas.update.mockImplementation(({ where, data }) => {
      const atualizada = { ...registros.get(where.id), ...data }
      registros.set(where.id, atualizada)
      if (ultima.id === where.id) ultima = atualizada
      return atualizada
    })
    mocks.tx.cobrancaMatriculaAsaas.create.mockImplementation(({ data }) => {
      const nova = { ...cobrancaAntiga, ...data, id: "cobranca-2" }
      registros.set(nova.id, nova)
      ultima = nova
      return nova
    })
    mocks.obterCobrancaAsaas.mockResolvedValue(pagamentoRemoto("REFUNDED"))
    mocks.criarCobrancaAsaas.mockResolvedValue({
      ...pagamentoRemoto("PENDING"),
      id: "pay-2",
      externalReference: "matricula:solicitacao-1:tentativa:2",
    })
    mocks.obterQrCodePixAsaas.mockResolvedValue({
      encodedImage: "",
      payload: "pix-novo",
      expirationDate: "2026-09-01 22:00:00",
    })

    const resultado = await reemitirCobrancaMatriculaAsaas(solicitacao.tokenAcompanhamento)

    expect(resultado).toMatchObject({ ok: true, reemitida: true })
    expect(mocks.excluirCobrancaAsaas).not.toHaveBeenCalled()
    expect(mocks.tx.cobrancaMatriculaAsaas.update).toHaveBeenCalledWith({
      where: { id: cobrancaAntiga.id },
      data: expect.objectContaining({
        status: "ESTORNADA",
        statusAsaas: "REFUNDED",
        ativa: false,
      }),
    })
  })

  it("audita o encerramento remoto quando a nova geração falha localmente", async () => {
    mocks.tx.cobrancaMatriculaAsaas.findFirst.mockResolvedValue(cobrancaAntiga)
    mocks.tx.cobrancaMatriculaAsaas.findUniqueOrThrow.mockResolvedValue(cobrancaAntiga)
    mocks.tx.cobrancaMatriculaAsaas.update.mockImplementation(({ data }) => ({
      ...cobrancaAntiga,
      ...data,
    }))
    mocks.tx.cobrancaMatriculaAsaas.create.mockRejectedValue(new Error("Falha local simulada"))
    mocks.obterCobrancaAsaas.mockResolvedValue(pagamentoRemoto("PENDING"))
    mocks.obterQrCodePixAsaas.mockResolvedValue({
      encodedImage: "",
      payload: "pix-expirado",
      expirationDate: "2026-08-31 21:13:00",
    })
    mocks.excluirCobrancaAsaas.mockResolvedValue({ id: "pay-1", deleted: true })

    const resultado = await reemitirCobrancaMatriculaAsaas(solicitacao.tokenAcompanhamento)

    expect(resultado).toEqual({ ok: false, motivo: "Falha local simulada" })
    expect(mocks.tx.cobrancaMatriculaAsaas.updateMany).toHaveBeenCalledWith({
      where: { id: cobrancaAntiga.id, status: "CANCELANDO" },
      data: expect.objectContaining({
        status: "CANCELADA",
        statusAsaas: "DELETED",
        ativa: false,
      }),
    })
    expect(mocks.registrarLog).toHaveBeenCalledWith(
      expect.objectContaining({
        entidadeId: cobrancaAntiga.id,
        justificativa: expect.stringContaining("encerrada"),
      }),
      mocks.tx,
    )
  })

  it("desativa a geração nova quando uma geração antiga é recebida com atraso", async () => {
    mocks.tx.cobrancaMatriculaAsaas.findFirst.mockResolvedValue({
      id: "cobranca-2",
      status: "PENDENTE",
    })

    const resultado = await aplicarWebhookPagamentoMatricula(
      mocks.tx as never,
      { ...cobrancaAntiga, status: "PENDENTE" as const, valor: new Prisma.Decimal(100) },
      {
        id: "evt-recebido-antigo",
        event: "PAYMENT_RECEIVED",
        dateCreated: "2026-09-01 00:20:00",
        payment: {
          ...pagamentoRemoto("RECEIVED"),
          paymentDate: "2026-08-31 21:20:00",
        },
      },
    )

    expect(resultado).toEqual({ ok: true, duplicado: false })
    expect(mocks.tx.cobrancaMatriculaAsaas.update).toHaveBeenNthCalledWith(1, {
      where: { id: "cobranca-2" },
      data: expect.objectContaining({
        ativa: false,
        pixCopiaECola: null,
        qrCodeExpiraEm: null,
      }),
    })
    expect(mocks.tx.cobrancaMatriculaAsaas.update).toHaveBeenNthCalledWith(2, {
      where: { id: cobrancaAntiga.id },
      data: expect.objectContaining({
        status: "RECEBIDA",
        ativa: true,
        recebidaEmAsaas: new Date("2026-09-01T00:20:00.000Z"),
      }),
    })
  })

  it("prioriza PAYMENT_CONFIRMED antigo sem colidir com outra geração ativa", async () => {
    mocks.tx.cobrancaMatriculaAsaas.findFirst.mockResolvedValue({
      id: "cobranca-2",
      status: "PENDENTE",
    })

    const resultado = await aplicarWebhookPagamentoMatricula(
      mocks.tx as never,
      { ...cobrancaAntiga, status: "PENDENTE" as const, valor: new Prisma.Decimal(100) },
      {
        id: "evt-confirmado-antigo",
        event: "PAYMENT_CONFIRMED",
        dateCreated: "2026-09-01 00:20:00",
        payment: pagamentoRemoto("CONFIRMED"),
      },
    )

    expect(resultado).toEqual({ ok: true, duplicado: false })
    expect(mocks.tx.cobrancaMatriculaAsaas.update).toHaveBeenNthCalledWith(1, {
      where: { id: "cobranca-2" },
      data: expect.objectContaining({ ativa: false }),
    })
    expect(mocks.tx.cobrancaMatriculaAsaas.update).toHaveBeenNthCalledWith(2, {
      where: { id: cobrancaAntiga.id },
      data: expect.objectContaining({
        status: "PENDENTE",
        statusAsaas: "CONFIRMED",
        ativa: true,
      }),
    })
  })
})

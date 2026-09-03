import { Prisma } from "@prisma/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => {
  const tx = {
    $queryRaw: vi.fn(),
    solicitacaoMatricula: { findUnique: vi.fn() },
    acessoAulaAvulsa: { findFirst: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
    aluno: { findUnique: vi.fn(), update: vi.fn() },
    alunoPlanoModalidade: { upsert: vi.fn() },
    comparecimento: { updateMany: vi.fn() },
    mensalidade: { update: vi.fn() },
    cobrancaAsaas: { create: vi.fn() },
    cobrancaMatriculaAsaas: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      findUniqueOrThrow: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      create: vi.fn(),
    },
  }
  const db = {
    plano: { findFirst: vi.fn() },
    solicitacaoMatricula: { findUnique: vi.fn() },
    acessoAulaAvulsa: { findFirst: vi.fn() },
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
    obterOuCriarMensalidadeNaTransacao: vi.fn(),
    criarNotificacao: vi.fn(),
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
vi.mock("@/lib/services/financeiro.service", () => ({
  obterOuCriarMensalidadeNaTransacao: mocks.obterOuCriarMensalidadeNaTransacao,
}))
vi.mock("@/lib/services/notificacao.service", () => ({
  criarNotificacao: mocks.criarNotificacao,
}))

import {
  aplicarWebhookPagamentoMatricula,
  gerarCobrancaComplementoAulaAvulsaAsaas,
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
  finalidade: "PRIMEIRA_MENSALIDADE" as const,
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
  mocks.criarNotificacao.mockResolvedValue({ id: "notificacao-1" })
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
  it("gera a cobrança inicial da aula avulsa por R$ 20,00", async () => {
    const solicitacaoAvulsa = {
      ...solicitacao,
      tipoPagamento: "AULA_AVULSA",
      plano: { id: "plano-1", valor: 100 },
    }
    mocks.tx.solicitacaoMatricula.findUnique.mockImplementation(({ select }) =>
      select ? { id: solicitacao.id } : solicitacaoAvulsa,
    )
    mocks.tx.cobrancaMatriculaAsaas.findFirst.mockResolvedValue(null)
    mocks.tx.cobrancaMatriculaAsaas.create.mockImplementation(({ data }) => ({
      id: "cobranca-avulsa-1",
      status: "CRIANDO",
      ativa: true,
      asaasPaymentId: null,
      asaasCustomerId: null,
      statusAsaas: null,
      pixCopiaECola: null,
      qrCodeExpiraEm: null,
      atualizadoEm: new Date(),
      ...data,
    }))
    mocks.criarCobrancaAsaas.mockResolvedValue({
      ...pagamentoRemoto("PENDING"),
      id: "pay-avulsa-1",
      value: 20,
    })
    mocks.obterQrCodePixAsaas.mockResolvedValue({
      encodedImage: "",
      payload: "pix-avulsa",
      expirationDate: "2026-09-01 22:00:00",
    })
    mocks.tx.cobrancaMatriculaAsaas.findUniqueOrThrow.mockImplementation(({ where }) => ({
      id: where.id,
      status: "CRIANDO",
      pixCopiaECola: null,
      qrCodeExpiraEm: null,
    }))
    mocks.tx.cobrancaMatriculaAsaas.update.mockImplementation(({ where, data }) => ({
      id: where.id,
      ...data,
    }))

    const resultado = await gerarCobrancaMatriculaAsaas(solicitacao.tokenAcompanhamento)

    expect(resultado.ok).toBe(true)
    expect(mocks.tx.cobrancaMatriculaAsaas.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ finalidade: "AULA_AVULSA", valor: 20 }),
    })
    expect(mocks.criarCobrancaAsaas).toHaveBeenCalledWith(
      expect.objectContaining({ value: 20, description: "Aula avulsa ECVO" }),
    )
  })

  it("gera o complemento da aula avulsa por R$ 80,00 dentro da mesma semana", async () => {
    mocks.tx.acessoAulaAvulsa.findFirst.mockResolvedValue({ id: "acesso-1" })
    mocks.tx.acessoAulaAvulsa.findUnique.mockResolvedValue({
      id: "acesso-1",
      solicitacaoId: "solicitacao-1",
      status: "ATIVO",
      prazoConversao: new Date("2026-09-07T03:00:00.000Z"),
      valorComplemento: new Prisma.Decimal(80),
      aluno: {
        id: "aluno-1",
        tipo: "AVULSO",
        planoId: null,
        cpf: "52998224725",
        telefone: null,
        usuario: { id: "usuario-1", nome: "Aluno", email: "aluno@example.com" },
      },
      aula: { inicio: new Date("2026-09-05T12:00:00.000Z") },
      solicitacao: {
        plano: { id: "plano-1", ativo: true, periodicidade: "MENSAL", valor: 100 },
      },
    })
    mocks.tx.cobrancaMatriculaAsaas.findFirst.mockImplementation(({ where }) =>
      where.finalidade === "COMPLEMENTO_MENSALIDADE" ? null : { geracao: 1 },
    )
    mocks.tx.cobrancaMatriculaAsaas.create.mockImplementation(({ data }) => ({
      id: "cobranca-complemento-1",
      status: "CRIANDO",
      ativa: true,
      asaasPaymentId: null,
      asaasCustomerId: null,
      statusAsaas: null,
      pixCopiaECola: null,
      qrCodeExpiraEm: null,
      atualizadoEm: new Date(),
      ...data,
    }))
    mocks.criarCobrancaAsaas.mockResolvedValue({
      object: "payment",
      id: "pay-complemento-1",
      customer: "cus-1",
      billingType: "PIX",
      value: 80,
      status: "PENDING",
      dueDate: "2026-09-06",
      externalReference: "matricula:solicitacao-1:complemento:2",
    })
    mocks.obterQrCodePixAsaas.mockResolvedValue({
      encodedImage: "",
      payload: "pix-complemento",
      expirationDate: "2026-09-01 22:00:00",
    })
    mocks.tx.cobrancaMatriculaAsaas.findUniqueOrThrow.mockImplementation(({ where }) => ({
      id: where.id,
      status: "CRIANDO",
      pixCopiaECola: null,
      qrCodeExpiraEm: null,
    }))
    mocks.tx.cobrancaMatriculaAsaas.update.mockImplementation(({ where, data }) => ({
      id: where.id,
      ...data,
    }))

    const resultado = await gerarCobrancaComplementoAulaAvulsaAsaas("aluno-1", {
      agora: new Date("2026-09-01T12:00:00.000Z"),
    })

    expect(resultado.ok).toBe(true)
    expect(mocks.tx.cobrancaMatriculaAsaas.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        finalidade: "COMPLEMENTO_MENSALIDADE",
        valor: expect.anything(),
        competencia: "2026-09",
      }),
    })
    expect(mocks.criarCobrancaAsaas).toHaveBeenCalledWith(
      expect.objectContaining({ value: 80, description: "Complemento da mensalidade ECVO" }),
    )
  })

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

  it("converte R$ 20 + R$ 80 em mensalidade paga de R$ 100 após PAYMENT_RECEIVED", async () => {
    const cobrancaComplemento = {
      id: "cobranca-complemento-1",
      solicitacaoId: "solicitacao-1",
      status: "PENDENTE" as const,
      finalidade: "COMPLEMENTO_MENSALIDADE" as const,
      asaasPaymentId: "pay-complemento-1",
      asaasCustomerId: "cus-1",
      externalReference: "matricula:solicitacao-1:complemento:2",
      competencia: "2026-09",
      valor: new Prisma.Decimal(80),
      vencimentoAsaas: new Date("2026-09-06T15:00:00.000Z"),
      statusAsaas: "PENDING",
      pixCopiaECola: "pix-complemento",
      qrCodeExpiraEm: new Date("2026-09-06T23:00:00.000Z"),
      invoiceUrl: "https://asaas.example/cobranca",
      ultimoEventoAsaas: null,
    }
    mocks.tx.cobrancaMatriculaAsaas.findFirst.mockResolvedValue(null)
    mocks.tx.cobrancaMatriculaAsaas.findUnique.mockResolvedValue({
      ...cobrancaComplemento,
      solicitacao: {
        plano: { id: "plano-1", ativo: true, periodicidade: "MENSAL", valor: 100 },
        aluno: { id: "aluno-1", usuarioId: "usuario-1", tipo: "AVULSO", planoId: null },
        acessoAulaAvulsa: {
          id: "acesso-1",
          status: "USADO",
          valorPago: new Prisma.Decimal(20),
          valorPlanoSnapshot: new Prisma.Decimal(100),
          valorComplemento: new Prisma.Decimal(80),
          prazoConversao: new Date("2026-09-07T03:00:00.000Z"),
          aula: {
            inicio: new Date("2026-09-05T12:00:00.000Z"),
            turma: { modalidadeId: "modalidade-1" },
          },
        },
      },
    })
    mocks.tx.acessoAulaAvulsa.findUnique.mockResolvedValue({ status: "USADO" })
    mocks.tx.aluno.findUnique.mockResolvedValue({ tipo: "AVULSO", planoId: null })
    mocks.obterOuCriarMensalidadeNaTransacao.mockResolvedValue({
      ok: true,
      criada: true,
      mensalidade: { id: "mensalidade-1" },
    })
    mocks.tx.mensalidade.update
      .mockResolvedValueOnce({ id: "mensalidade-1" })
      .mockResolvedValueOnce({ id: "mensalidade-1" })
    mocks.tx.cobrancaAsaas.create.mockResolvedValue({ id: "cobranca-canonica-1" })

    const resultado = await aplicarWebhookPagamentoMatricula(
      mocks.tx as never,
      cobrancaComplemento,
      {
        id: "evt-complemento-recebido",
        event: "PAYMENT_RECEIVED",
        dateCreated: "2026-09-02 12:00:00",
        payment: {
          object: "payment",
          id: "pay-complemento-1",
          customer: "cus-1",
          billingType: "PIX",
          value: 80,
          status: "RECEIVED",
          dueDate: "2026-09-06",
          externalReference: "matricula:solicitacao-1:complemento:2",
          paymentDate: "2026-09-02 12:00:00",
        },
      },
    )

    expect(resultado).toEqual({ ok: true, duplicado: false })
    expect(mocks.tx.aluno.update).toHaveBeenCalledWith({
      where: { id: "aluno-1" },
      data: expect.objectContaining({ tipo: "MENSALISTA", planoId: "plano-1" }),
    })
    expect(mocks.tx.mensalidade.update).toHaveBeenNthCalledWith(1, {
      where: { id: "mensalidade-1" },
      data: expect.objectContaining({ valor: expect.anything(), status: "PAGA" }),
    })
    expect(mocks.tx.cobrancaAsaas.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        mensalidadeId: "mensalidade-1",
        valorCobrado: expect.anything(),
        asaasPaymentId: "pay-complemento-1",
      }),
    })
    expect(mocks.tx.acessoAulaAvulsa.update).toHaveBeenCalledWith({
      where: { id: "acesso-1" },
      data: expect.objectContaining({ status: "CONVERTIDO" }),
    })
  })

  it("cancela o acesso ainda não usado quando o Asaas estorna a aula avulsa", async () => {
    const cobrancaAvulsa = {
      id: "cobranca-avulsa-1",
      solicitacaoId: "solicitacao-1",
      status: "RECEBIDA" as const,
      finalidade: "AULA_AVULSA" as const,
      asaasPaymentId: "pay-avulsa-1",
      asaasCustomerId: "cus-1",
      externalReference: "matricula:solicitacao-1",
      valor: new Prisma.Decimal(20),
      vencimentoAsaas: new Date("2026-09-01T15:00:00.000Z"),
    }
    mocks.tx.cobrancaMatriculaAsaas.findFirst.mockResolvedValue(null)
    mocks.tx.acessoAulaAvulsa.findUnique.mockResolvedValue({
      id: "acesso-1",
      solicitacaoId: "solicitacao-1",
      alunoId: "aluno-1",
      aulaId: "aula-1",
      status: "ATIVO",
      checkinId: null,
      aluno: { id: "aluno-1", usuarioId: "usuario-1" },
    })
    mocks.tx.comparecimento.updateMany.mockResolvedValue({ count: 1 })

    const resultado = await aplicarWebhookPagamentoMatricula(mocks.tx as never, cobrancaAvulsa, {
      id: "evt-avulsa-estornada",
      event: "PAYMENT_REFUNDED",
      dateCreated: "2026-09-02 12:00:00",
      payment: {
        object: "payment",
        id: "pay-avulsa-1",
        customer: "cus-1",
        billingType: "PIX",
        value: 20,
        status: "REFUNDED",
        dueDate: "2026-09-01",
        externalReference: "matricula:solicitacao-1",
      },
    })

    expect(resultado).toEqual({ ok: true, duplicado: false })
    expect(mocks.tx.acessoAulaAvulsa.update).toHaveBeenCalledWith({
      where: { id: "acesso-1" },
      data: { status: "CANCELADO" },
    })
    expect(mocks.tx.comparecimento.updateMany).toHaveBeenCalledWith({
      where: { alunoId: "aluno-1", aulaId: "aula-1", status: "CONFIRMADO" },
      data: expect.objectContaining({ status: "CANCELADO_GESTOR" }),
    })
    expect(mocks.tx.aluno.update).toHaveBeenCalledWith({
      where: { id: "aluno-1" },
      data: { status: "CANCELADO" },
    })
  })
})

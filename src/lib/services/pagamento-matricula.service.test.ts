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
    contaAsaasProfessor: { findMany: vi.fn() },
    splitPagamentoAsaas: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
  }
  const db = {
    plano: { findFirst: vi.fn() },
    solicitacaoMatricula: { findUnique: vi.fn() },
    acessoAulaAvulsa: { findFirst: vi.fn() },
    cobrancaMatriculaAsaas: { updateMany: vi.fn() },
    splitPagamentoAsaas: { findMany: vi.fn() },
    $transaction: vi.fn(async (callback: (cliente: typeof tx) => unknown) => callback(tx)),
  }
  return {
    db,
    tx,
    criarClienteAsaas: vi.fn(),
    criarCobrancaAsaas: vi.fn(),
    excluirCobrancaAsaas: vi.fn(),
    erroApiAsaasTemCodigo: vi.fn((erro: unknown, codigo: string) => {
      if (!erro || typeof erro !== "object") return false
      const codes = Reflect.get(erro, "codes")
      return Array.isArray(codes) && codes.includes(codigo)
    }),
    listarClientesAsaas: vi.fn(),
    listarCobrancasAsaas: vi.fn(),
    obterCobrancaAsaas: vi.fn(),
    obterQrCodePixAsaas: vi.fn(),
    registrarLog: vi.fn(),
    montarRepasseSnapshotMensalidade: vi.fn(),
    lerRepasseSnapshotMensalidade: vi.fn(),
    calcularRepasseFinanceiro: vi.fn(),
    obterOuCriarMensalidadeNaTransacao: vi.fn(),
    criarNotificacao: vi.fn(),
    aprovarMatricula: vi.fn().mockResolvedValue({ ok: true, alunoId: "aluno-1" }),
  }
})

vi.mock("@/lib/db", () => ({ db: mocks.db }))
vi.mock("@/lib/asaas/client", () => ({
  criarClienteAsaas: mocks.criarClienteAsaas,
  criarCobrancaAsaas: mocks.criarCobrancaAsaas,
  excluirCobrancaAsaas: mocks.excluirCobrancaAsaas,
  erroApiAsaasTemCodigo: mocks.erroApiAsaasTemCodigo,
  listarClientesAsaas: mocks.listarClientesAsaas,
  listarCobrancasAsaas: mocks.listarCobrancasAsaas,
  obterCobrancaAsaas: mocks.obterCobrancaAsaas,
  obterQrCodePixAsaas: mocks.obterQrCodePixAsaas,
}))
vi.mock("@/lib/services/auditoria.service", () => ({ registrarLog: mocks.registrarLog }))
vi.mock("@/lib/services/financeiro.service", () => ({
  calcularRepasseFinanceiro: mocks.calcularRepasseFinanceiro,
  lerRepasseSnapshotMensalidade: mocks.lerRepasseSnapshotMensalidade,
  montarRepasseSnapshotMensalidade: mocks.montarRepasseSnapshotMensalidade,
  obterOuCriarMensalidadeNaTransacao: mocks.obterOuCriarMensalidadeNaTransacao,
}))
vi.mock("@/lib/services/notificacao.service", () => ({
  criarNotificacao: mocks.criarNotificacao,
}))
vi.mock("@/lib/services/matricula.service", () => ({
  aprovarMatricula: mocks.aprovarMatricula,
}))

import {
  aplicarWebhookPagamentoMatricula,
  gerarCobrancaComplementoAulaAvulsaAsaas,
  gerarCobrancaMatriculaAsaas,
  obterPagamentoMatriculaPublico,
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
  modalidades: [],
  modalidadePrincipal: {
    id: "modalidade-1",
    nome: "Jiu-Jitsu",
    valorRepasseProfessor: new Prisma.Decimal(50),
    turmas: [],
  },
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
  mocks.tx.splitPagamentoAsaas.findMany.mockResolvedValue([])
  mocks.tx.splitPagamentoAsaas.updateMany.mockResolvedValue({ count: 1 })
  mocks.tx.contaAsaasProfessor.findMany.mockResolvedValue([])
  mocks.db.splitPagamentoAsaas.findMany.mockResolvedValue([])
  mocks.montarRepasseSnapshotMensalidade.mockReturnValue([])
  mocks.lerRepasseSnapshotMensalidade.mockReturnValue([])
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

  it("consulta a cobrança ativa ou, na ausência dela, o erro da geração mais recente", async () => {
    mocks.db.solicitacaoMatricula.findUnique.mockResolvedValue(null)

    await obterPagamentoMatriculaPublico(solicitacao.tokenAcompanhamento)

    expect(mocks.db.solicitacaoMatricula.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        select: expect.objectContaining({
          cobrancasAsaas: expect.objectContaining({
            orderBy: [{ ativa: "desc" }, { geracao: "desc" }],
            take: 1,
          }),
        }),
      }),
    )
  })
})

function configurarComplemento() {
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
    aula: {
      inicio: new Date("2026-09-05T12:00:00.000Z"),
      turma: {
        modalidade: {
          id: "kickboxing",
          nome: "Kickboxing",
          valorRepasseProfessor: new Prisma.Decimal(60),
          turmas: [{ professorId: "vinicius", professor: { usuario: { nome: "Vinicius" } } }],
        },
      },
    },
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
}

describe("sincronização e reemissão", () => {
  it("gera a primeira mensalidade com o valor vigente do plano vinculado", async () => {
    const solicitacaoPlanoAtualizado = {
      ...solicitacao,
      plano: { id: "plano-2", valor: 187.53 },
    }
    mocks.tx.solicitacaoMatricula.findUnique.mockImplementation(({ select }) =>
      select ? { id: solicitacao.id } : solicitacaoPlanoAtualizado,
    )
    mocks.tx.cobrancaMatriculaAsaas.findFirst.mockResolvedValue(null)
    mocks.tx.cobrancaMatriculaAsaas.create.mockImplementation(({ data }) => ({
      id: "cobranca-mensal-1",
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
      value: 187.53,
    })
    mocks.obterQrCodePixAsaas.mockResolvedValue({
      encodedImage: "",
      payload: "pix-mensal",
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
      data: expect.objectContaining({ finalidade: "PRIMEIRA_MENSALIDADE", valor: 187.53 }),
    })
    expect(mocks.criarCobrancaAsaas).toHaveBeenCalledWith(
      expect.objectContaining({ value: 187.53, description: "Primeira mensalidade ECVO" }),
    )
  })

  it("emite a matrícula sem split após invalid_action e reconciliação remota vazia", async () => {
    const snapshot = [
      {
        modalidadeId: "kickboxing",
        modalidadeNome: "Kickboxing",
        professorId: "vinicius",
        professorNome: "Vinicius",
        plataformaExterna: null,
        valorBase: 100,
        valorRepasseProfessor: 60,
      },
    ]
    const splits: Array<Record<string, unknown>> = []
    const cobrancaLocal = {
      id: "cobranca-mensal-1",
      status: "CRIANDO",
      ativa: true,
      asaasPaymentId: null,
      asaasCustomerId: null,
      statusAsaas: null,
      pixCopiaECola: null,
      qrCodeExpiraEm: null,
      atualizadoEm: new Date(),
      finalidade: "PRIMEIRA_MENSALIDADE",
      externalReference: "matricula:solicitacao-1",
      valor: new Prisma.Decimal(100),
      vencimentoAsaas: new Date("2026-09-01T03:00:00.000Z"),
    }
    mocks.montarRepasseSnapshotMensalidade.mockReturnValue(snapshot)
    mocks.lerRepasseSnapshotMensalidade.mockReturnValue(snapshot)
    mocks.calcularRepasseFinanceiro.mockReturnValue({
      professores: [
        {
          professorId: "vinicius",
          valor: 60,
          modalidades: [{ modalidadeId: "kickboxing", modalidadeNome: "Kickboxing", valor: 60 }],
        },
      ],
    })
    mocks.tx.contaAsaasProfessor.findMany.mockResolvedValue([
      { id: "conta-vinicius", professorId: "vinicius", walletId: "wallet-vinicius" },
    ])
    mocks.tx.cobrancaMatriculaAsaas.findFirst.mockResolvedValue(null)
    mocks.tx.cobrancaMatriculaAsaas.create.mockImplementation(({ data }) => ({
      ...cobrancaLocal,
      ...data,
    }))
    mocks.tx.cobrancaMatriculaAsaas.findUnique.mockResolvedValue(cobrancaLocal)
    mocks.tx.cobrancaMatriculaAsaas.findUniqueOrThrow.mockImplementation(() => cobrancaLocal)
    mocks.tx.cobrancaMatriculaAsaas.update.mockImplementation(({ where, data }) => ({
      ...cobrancaLocal,
      id: where.id,
      ...data,
    }))
    mocks.tx.splitPagamentoAsaas.findMany.mockImplementation(() => splits)
    mocks.db.splitPagamentoAsaas.findMany.mockImplementation(() => splits)
    mocks.tx.splitPagamentoAsaas.create.mockImplementation(({ data }) => {
      const split = {
        id: "split-local-1",
        asaasSplitId: null,
        status: "PREPARADO",
        statusAsaas: null,
        ...data,
      }
      splits.push(split)
      return split
    })
    mocks.tx.splitPagamentoAsaas.updateMany.mockImplementation(({ data }) => {
      for (const split of splits) Object.assign(split, data)
      return { count: splits.length }
    })
    mocks.listarCobrancasAsaas.mockResolvedValue({ data: [], totalCount: 0, hasMore: false })
    const erroSplit = Object.assign(new Error("recusado"), {
      name: "ErroApiAsaas",
      status: 400,
      codes: ["invalid_action"],
    })
    mocks.criarCobrancaAsaas
      .mockRejectedValueOnce(erroSplit)
      .mockResolvedValueOnce({ ...pagamentoRemoto("PENDING"), split: [] })
    mocks.obterQrCodePixAsaas.mockResolvedValue({
      encodedImage: "",
      payload: "pix-sem-split",
      expirationDate: "2026-09-01 22:00:00",
    })

    const resultado = await gerarCobrancaMatriculaAsaas(solicitacao.tokenAcompanhamento)

    expect(resultado).toMatchObject({
      ok: true,
      cobranca: { status: "PENDENTE", pixCopiaECola: "pix-sem-split" },
    })
    expect(mocks.listarCobrancasAsaas).toHaveBeenCalledTimes(2)
    expect(mocks.criarCobrancaAsaas).toHaveBeenCalledTimes(2)
    expect(mocks.criarCobrancaAsaas.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({ split: [expect.objectContaining({ fixedValue: 60 })] }),
    )
    expect(mocks.criarCobrancaAsaas.mock.calls[1]?.[0]).not.toHaveProperty("split")
    expect(mocks.tx.splitPagamentoAsaas.updateMany).toHaveBeenCalledWith({
      where: expect.objectContaining({ status: "PREPARADO", asaasSplitId: null }),
      data: expect.objectContaining({
        status: "RECUSADO",
        asaasSplitId: null,
        statusAsaas: null,
      }),
    })
    expect(mocks.registrarLog).toHaveBeenCalledWith(
      expect.objectContaining({
        entidade: "CobrancaMatriculaAsaas",
        valorNovo: expect.objectContaining({ repasse: "CONCILIACAO_MANUAL" }),
      }),
      mocks.tx,
    )
  })

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
    configurarComplemento()

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

  it("envia e confirma split de R$ 60 no complemento de R$ 80", async () => {
    configurarComplemento()
    const snapshot = [
      {
        modalidadeId: "kickboxing",
        modalidadeNome: "Kickboxing",
        professorId: "vinicius",
        professorNome: "Vinicius",
        plataformaExterna: null,
        valorBase: 100,
        valorRepasseProfessor: 60,
      },
    ]
    mocks.montarRepasseSnapshotMensalidade.mockReturnValue(snapshot)
    mocks.lerRepasseSnapshotMensalidade.mockReturnValue(snapshot)
    mocks.calcularRepasseFinanceiro.mockReturnValue({
      professores: [
        {
          professorId: "vinicius",
          valor: 60,
          modalidades: [{ modalidadeId: "kickboxing", modalidadeNome: "Kickboxing", valor: 60 }],
        },
      ],
    })
    mocks.tx.contaAsaasProfessor.findMany.mockResolvedValue([
      { id: "conta-vinicius", professorId: "vinicius", walletId: "wallet-vinicius" },
    ])
    const splits: Array<Record<string, unknown>> = []
    mocks.tx.splitPagamentoAsaas.findMany.mockImplementation(() => splits)
    mocks.db.splitPagamentoAsaas.findMany.mockImplementation(() => splits)
    mocks.tx.splitPagamentoAsaas.create.mockImplementation(({ data }) => {
      const split = { id: "split-local-1", status: "PREPARADO", ...data }
      splits.push(split)
      return split
    })
    mocks.criarCobrancaAsaas.mockResolvedValue({
      object: "payment",
      id: "pay-complemento-1",
      customer: "cus-1",
      billingType: "PIX",
      value: 80,
      status: "PENDING",
      dueDate: "2026-09-06",
      externalReference: "matricula:solicitacao-1:complemento:2",
      split: [
        {
          id: "split-remoto-1",
          walletId: "wallet-vinicius",
          fixedValue: 60,
          status: "PENDING",
          externalReference: "matricula:solicitacao-1:complemento:2:split:1",
        },
      ],
    })

    const resultado = await gerarCobrancaComplementoAulaAvulsaAsaas("aluno-1", {
      agora: new Date("2026-09-01T12:00:00.000Z"),
    })

    expect(resultado.ok).toBe(true)
    expect(mocks.tx.cobrancaMatriculaAsaas.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ repasseSnapshot: snapshot }),
    })
    expect(mocks.calcularRepasseFinanceiro).toHaveBeenCalledWith(
      expect.objectContaining({ valorRecebido: 80 }),
    )
    expect(mocks.criarCobrancaAsaas).toHaveBeenCalledWith(
      expect.objectContaining({
        value: 80,
        split: [
          {
            walletId: "wallet-vinicius",
            fixedValue: 60,
            externalReference: "matricula:solicitacao-1:complemento:2:split:1",
            description: "Repasse automático de professor ECVO",
          },
        ],
      }),
    )
    expect(mocks.tx.splitPagamentoAsaas.update).toHaveBeenCalledWith({
      where: { id: "split-local-1" },
      data: expect.objectContaining({ asaasSplitId: "split-remoto-1", status: "PENDENTE" }),
    })
  })

  it.each([
    "professor ambíguo",
    "conta não habilitada",
  ])("não envia split quando há %s", async (cenario) => {
    configurarComplemento()
    const snapshot = [
      {
        modalidadeId: "kickboxing",
        modalidadeNome: "Kickboxing",
        professorId: cenario === "professor ambíguo" ? null : "vinicius",
        professorNome: cenario,
        plataformaExterna: null,
        valorBase: 100,
        valorRepasseProfessor: 60,
      },
    ]
    mocks.montarRepasseSnapshotMensalidade.mockReturnValue(snapshot)
    mocks.lerRepasseSnapshotMensalidade.mockReturnValue(snapshot)
    mocks.calcularRepasseFinanceiro.mockReturnValue({
      professores: [
        {
          professorId: cenario === "professor ambíguo" ? "pendencia:0" : "vinicius",
          valor: 60,
          modalidades: [],
        },
      ],
    })

    const resultado = await gerarCobrancaComplementoAulaAvulsaAsaas("aluno-1", {
      agora: new Date("2026-09-01T12:00:00.000Z"),
    })

    expect(resultado.ok).toBe(true)
    expect(mocks.tx.splitPagamentoAsaas.create).not.toHaveBeenCalled()
    expect(mocks.criarCobrancaAsaas).toHaveBeenCalledWith(
      expect.objectContaining({ split: undefined }),
    )
  })

  it("retoma cobrança local sem pagamento remoto preservando snapshot e split", async () => {
    configurarComplemento()
    const snapshot = [
      {
        modalidadeId: "kickboxing",
        professorId: "vinicius",
        plataformaExterna: null,
        valorBase: 100,
        valorRepasseProfessor: 60,
      },
    ]
    const existente = {
      id: "cobranca-complemento-1",
      status: "ERRO",
      asaasPaymentId: null,
      repasseSnapshot: snapshot,
      valor: new Prisma.Decimal(80),
      vencimentoAsaas: new Date("2026-09-06T15:00:00.000Z"),
      externalReference: "matricula:solicitacao-1:complemento:2",
      atualizadoEm: new Date("2026-08-31T00:00:00.000Z"),
    }
    const split = {
      id: "split-local-1",
      walletIdSnapshot: "wallet-vinicius",
      valorFixoSnapshot: new Prisma.Decimal(60),
      externalReference: "matricula:solicitacao-1:complemento:2:split:1",
      status: "PREPARADO",
    }
    mocks.tx.cobrancaMatriculaAsaas.findFirst.mockResolvedValue(existente)
    mocks.tx.cobrancaMatriculaAsaas.update.mockImplementation(({ data }) => ({
      ...existente,
      ...data,
    }))
    mocks.tx.splitPagamentoAsaas.findMany.mockResolvedValue([split])
    mocks.db.splitPagamentoAsaas.findMany.mockResolvedValue([split])
    mocks.criarCobrancaAsaas.mockResolvedValue({
      object: "payment",
      id: "pay-complemento-1",
      customer: "cus-1",
      billingType: "PIX",
      value: 80,
      status: "PENDING",
      dueDate: "2026-09-06",
      externalReference: existente.externalReference,
      split: [
        {
          id: "split-remoto-1",
          walletId: "wallet-vinicius",
          fixedValue: 60,
          externalReference: split.externalReference,
          status: "PENDING",
        },
      ],
    })

    const resultado = await gerarCobrancaComplementoAulaAvulsaAsaas("aluno-1", {
      agora: new Date("2026-09-01T12:00:00.000Z"),
    })

    expect(resultado.ok).toBe(true)
    expect(mocks.tx.cobrancaMatriculaAsaas.create).not.toHaveBeenCalled()
    expect(mocks.tx.splitPagamentoAsaas.create).not.toHaveBeenCalled()
    expect(mocks.montarRepasseSnapshotMensalidade).not.toHaveBeenCalled()
    expect(mocks.criarCobrancaAsaas).toHaveBeenCalledWith(
      expect.objectContaining({ split: [expect.objectContaining({ fixedValue: 60 })] }),
    )
  })

  it("não acrescenta split a pagamento remoto já existente", async () => {
    configurarComplemento()
    mocks.tx.cobrancaMatriculaAsaas.findFirst.mockResolvedValue({
      id: "cobranca-complemento-1",
      status: "PENDENTE",
      asaasPaymentId: "pay-complemento-1",
      repasseSnapshot: null,
      valor: new Prisma.Decimal(80),
      vencimentoAsaas: new Date("2026-09-06T15:00:00.000Z"),
      externalReference: "matricula:solicitacao-1:complemento:2",
      atualizadoEm: new Date("2026-08-31T00:00:00.000Z"),
    })
    mocks.obterCobrancaAsaas.mockResolvedValue({
      object: "payment",
      id: "pay-complemento-1",
      customer: "cus-1",
      billingType: "PIX",
      value: 80,
      status: "PENDING",
      dueDate: "2026-09-06",
      externalReference: "matricula:solicitacao-1:complemento:2",
    })

    const resultado = await gerarCobrancaComplementoAulaAvulsaAsaas("aluno-1", {
      verificar: true,
      agora: new Date("2026-09-01T12:00:00.000Z"),
    })

    expect(resultado.ok).toBe(true)
    expect(mocks.montarRepasseSnapshotMensalidade).not.toHaveBeenCalled()
    expect(mocks.tx.splitPagamentoAsaas.create).not.toHaveBeenCalled()
    expect(mocks.criarCobrancaAsaas).not.toHaveBeenCalled()
  })

  it("bloqueia o PIX quando o Asaas não confirma o split preparado", async () => {
    configurarComplemento()
    const split = {
      id: "split-local-1",
      walletIdSnapshot: "wallet-vinicius",
      valorFixoSnapshot: new Prisma.Decimal(60),
      externalReference: "matricula:solicitacao-1:complemento:2:split:1",
      status: "PREPARADO",
    }
    mocks.tx.splitPagamentoAsaas.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([split])
    mocks.db.splitPagamentoAsaas.findMany.mockResolvedValue([split])

    const resultado = await gerarCobrancaComplementoAulaAvulsaAsaas("aluno-1", {
      agora: new Date("2026-09-01T12:00:00.000Z"),
    })

    expect(resultado.ok).toBe(false)
    expect(mocks.tx.splitPagamentoAsaas.update).toHaveBeenCalledWith({
      where: { id: "split-local-1" },
      data: expect.objectContaining({ status: "ERRO" }),
    })
    expect(mocks.db.cobrancaMatriculaAsaas.updateMany).toHaveBeenCalledWith({
      where: expect.objectContaining({ id: "cobranca-complemento-1" }),
      data: expect.objectContaining({ status: "ERRO", ativa: false }),
    })
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
    expect(mocks.aprovarMatricula).toHaveBeenCalledWith(
      expect.objectContaining({
        solicitacaoId: solicitacao.id,
        autorId: null,
        origem: "AUTOMATICA",
        transacao: mocks.tx,
      }),
    )
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

  it("devolve as notificações da aprovação para envio somente após o commit do webhook", async () => {
    const notificacao = {
      id: "notificacao-gestor-1",
      usuarioId: "gestor-1",
      tipo: "MATRICULA",
      titulo: "Matrícula aprovada",
      mensagem: "Acesso liberado.",
    }
    mocks.aprovarMatricula.mockResolvedValueOnce({
      ok: true,
      alunoId: "aluno-1",
      notificacoes: [notificacao],
    })

    const resultado = await aplicarWebhookPagamentoMatricula(
      mocks.tx as never,
      { ...cobrancaAntiga, status: "PENDENTE" as const, valor: new Prisma.Decimal(100) },
      {
        id: "evt-recebido-com-notificacao",
        event: "PAYMENT_RECEIVED",
        dateCreated: "2026-09-01 00:20:00",
        payment: pagamentoRemoto("RECEIVED"),
      },
    )

    expect(resultado).toMatchObject({ ok: true, notificacoes: [notificacao] })
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
    expect(mocks.aprovarMatricula).not.toHaveBeenCalled()
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
      repasseSnapshot: [
        { modalidadeId: "kickboxing", professorId: "vinicius", valorRepasseProfessor: 60 },
      ],
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
    expect(mocks.tx.splitPagamentoAsaas.updateMany).toHaveBeenCalledWith({
      where: { cobrancaMatriculaAsaasId: "cobranca-complemento-1" },
      data: { cobrancaMatriculaAsaasId: null, cobrancaAsaasId: "cobranca-canonica-1" },
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

describe("conversão do complemento confirmado por consulta ao Asaas", () => {
  function prepararConsulta(statusLocal = "PENDENTE") {
    vi.setSystemTime(new Date("2026-09-13T12:00:00.000Z"))
    const aluno = {
      id: "aluno-1",
      usuarioId: "usuario-1",
      tipo: "AVULSO",
      planoId: null,
      cpf: "52998224725",
      telefone: null,
      usuario: { id: "usuario-1", nome: "Aluno", email: "aluno@example.com" },
    }
    const plano = { id: "plano-1", ativo: true, periodicidade: "MENSAL", valor: 100 }
    const acesso = {
      id: "acesso-1",
      solicitacaoId: "solicitacao-1",
      status: "ATIVO",
      prazoConversao: new Date("2026-09-14T03:00:00.000Z"),
      valorPago: new Prisma.Decimal(20),
      valorPlanoSnapshot: new Prisma.Decimal(100),
      valorComplemento: new Prisma.Decimal(80),
      aluno,
      aula: {
        inicio: new Date("2026-09-11T23:00:00.000Z"),
        turma: { modalidadeId: "modalidade-1" },
      },
      solicitacao: { plano },
    }
    let cobranca = {
      ...cobrancaAntiga,
      status: statusLocal,
      finalidade: "COMPLEMENTO_MENSALIDADE",
      mensalidadeId: null as string | null,
      estornoParcialPendenteEm: null as Date | null,
      competencia: "2026-09",
      valor: new Prisma.Decimal(80),
      vencimentoAsaas: new Date("2026-09-14T02:59:59.999Z"),
      externalReference: "matricula:solicitacao-1:complemento:2",
    }
    const remota = {
      ...pagamentoRemoto("RECEIVED"),
      value: 80,
      dueDate: "2026-09-13",
      externalReference: cobranca.externalReference,
      paymentDate: "2026-09-11 17:05:00",
    }
    mocks.tx.acessoAulaAvulsa.findFirst.mockResolvedValue({ id: acesso.id })
    mocks.tx.acessoAulaAvulsa.findUnique.mockImplementation(async () => acesso)
    mocks.tx.acessoAulaAvulsa.update.mockImplementation(async ({ data }) =>
      Object.assign(acesso, data),
    )
    mocks.tx.aluno.findUnique.mockResolvedValue(aluno)
    mocks.tx.cobrancaMatriculaAsaas.findFirst.mockImplementation(async () => cobranca)
    mocks.tx.cobrancaMatriculaAsaas.findUniqueOrThrow.mockImplementation(async () => cobranca)
    mocks.tx.cobrancaMatriculaAsaas.findUnique.mockImplementation(async () => ({
      ...cobranca,
      solicitacao: { plano, aluno, acessoAulaAvulsa: acesso },
    }))
    mocks.tx.cobrancaMatriculaAsaas.update.mockImplementation(async ({ data }) => {
      cobranca = { ...cobranca, ...data }
      return cobranca
    })
    mocks.obterCobrancaAsaas.mockResolvedValue(remota)
    mocks.obterOuCriarMensalidadeNaTransacao.mockResolvedValue({
      ok: true,
      criada: true,
      mensalidade: { id: "mensalidade-1" },
    })
    mocks.tx.mensalidade.update.mockResolvedValue({ id: "mensalidade-1" })
    mocks.tx.cobrancaAsaas.create.mockResolvedValue({ id: "cobranca-canonica-1" })
    return {
      acesso,
      remota,
      atualizarCobrancaLocal: (data: Partial<typeof cobranca>) => {
        cobranca = { ...cobranca, ...data }
      },
    }
  }

  it.each([
    "PENDENTE",
    "RECEBIDA",
  ])("quita setembro ao consultar complemento %s ainda sem mensalidade", async (statusLocal) => {
    prepararConsulta(statusLocal)
    const resultado = await gerarCobrancaComplementoAulaAvulsaAsaas("aluno-1", { verificar: true })

    expect(resultado).toMatchObject({
      ok: true,
      cobranca: { status: "RECEBIDA", mensalidadeId: "mensalidade-1", ativa: false },
    })
    expect(mocks.obterOuCriarMensalidadeNaTransacao).toHaveBeenCalledWith(mocks.tx, {
      alunoId: "aluno-1",
      competencia: "2026-09",
    })
    expect(mocks.tx.mensalidade.update).toHaveBeenNthCalledWith(1, {
      where: { id: "mensalidade-1" },
      data: expect.objectContaining({
        status: "PAGA",
        valor: new Prisma.Decimal(100),
        pagoEm: new Date("2026-09-11T20:05:00.000Z"),
        formaPagamento: "PIX_ASAAS_COMPLEMENTO_AULA_AVULSA",
      }),
    })
    expect(mocks.tx.aluno.update).toHaveBeenCalledWith({
      where: { id: "aluno-1" },
      data: { tipo: "MENSALISTA", planoId: "plano-1", diaVencimento: 11 },
    })
    expect(mocks.tx.cobrancaAsaas.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ valorCobrado: new Prisma.Decimal(80), status: "RECEBIDA" }),
    })
    expect(mocks.registrarLog).toHaveBeenCalledWith(
      expect.objectContaining({
        justificativa: "Conversão da aula avulsa confirmada por consulta ao Asaas.",
      }),
      mocks.tx,
    )

    await gerarCobrancaComplementoAulaAvulsaAsaas("aluno-1", { verificar: true })
    expect(mocks.obterOuCriarMensalidadeNaTransacao).toHaveBeenCalledTimes(1)
    expect(mocks.tx.cobrancaAsaas.create).toHaveBeenCalledTimes(1)
  })

  it("aguarda recebimento quando o Asaas retorna apenas CONFIRMED", async () => {
    const { remota } = prepararConsulta()
    mocks.obterCobrancaAsaas.mockResolvedValue({ ...remota, status: "CONFIRMED" })

    const resultado = await gerarCobrancaComplementoAulaAvulsaAsaas("aluno-1", { verificar: true })

    expect(resultado).toMatchObject({
      ok: true,
      cobranca: { status: "PENDENTE", mensalidadeId: null },
    })
    expect(mocks.tx.aluno.update).not.toHaveBeenCalled()
    expect(mocks.obterOuCriarMensalidadeNaTransacao).not.toHaveBeenCalled()
  })

  it.each([
    { status: "ESTORNADA", statusAsaas: "REFUNDED", ativa: false },
    {
      status: "ERRO",
      statusAsaas: "PARTIALLY_REFUNDED",
      estornoParcialPendenteEm: new Date("2026-09-13T12:00:00.000Z"),
      ativa: false,
    },
    { status: "RECEBIDA", mensalidadeId: "mensalidade-concorrente", ativa: false },
  ])("preserva atualização concorrente durante consulta RECEIVED: %j", async (estadoAtual) => {
    const { remota, atualizarCobrancaLocal } = prepararConsulta()
    mocks.obterCobrancaAsaas.mockImplementation(async () => {
      atualizarCobrancaLocal(estadoAtual)
      return remota
    })

    const resultado = await gerarCobrancaComplementoAulaAvulsaAsaas("aluno-1", { verificar: true })

    expect(resultado).toMatchObject({ ok: true, cobranca: estadoAtual })
    expect(mocks.tx.cobrancaMatriculaAsaas.update).not.toHaveBeenCalled()
    expect(mocks.tx.aluno.update).not.toHaveBeenCalled()
    expect(mocks.obterOuCriarMensalidadeNaTransacao).not.toHaveBeenCalled()
    expect(mocks.tx.cobrancaAsaas.create).not.toHaveBeenCalled()
  })

  it.each([
    { value: 20 },
    { customer: "cus-outro" },
    { id: "pay-outro" },
    { externalReference: "matricula:outra" },
    { dueDate: "2026-09-12" },
    { billingType: "BOLETO" },
  ])("rejeita recebimento com dados divergentes: %j", async (divergencia) => {
    const { remota } = prepararConsulta()
    mocks.obterCobrancaAsaas.mockResolvedValue({ ...remota, ...divergencia })

    const resultado = await gerarCobrancaComplementoAulaAvulsaAsaas("aluno-1", { verificar: true })

    expect(resultado.ok).toBe(false)
    expect(mocks.tx.cobrancaMatriculaAsaas.update).not.toHaveBeenCalled()
    expect(mocks.tx.aluno.update).not.toHaveBeenCalled()
    expect(mocks.obterOuCriarMensalidadeNaTransacao).not.toHaveBeenCalled()
  })

  it("preserva a validação da semana elegível do recebimento", async () => {
    const { remota } = prepararConsulta()
    mocks.obterCobrancaAsaas.mockResolvedValue({ ...remota, paymentDate: "2026-09-06 17:05:00" })

    const resultado = await gerarCobrancaComplementoAulaAvulsaAsaas("aluno-1", { verificar: true })

    expect(resultado).toMatchObject({
      ok: false,
      motivo: expect.stringContaining("fora da semana elegível"),
    })
    expect(mocks.tx.aluno.update).not.toHaveBeenCalled()
    expect(mocks.obterOuCriarMensalidadeNaTransacao).not.toHaveBeenCalled()
  })
})

import "server-only"
import type { Prisma, StatusCobrancaAsaas } from "@prisma/client"
import {
  type CobrancaAsaas as CobrancaRemotaAsaas,
  criarClienteAsaas,
  criarCobrancaAsaas,
  listarClientesAsaas,
  listarCobrancasAsaas,
  obterCobrancaAsaas,
  obterQrCodePixAsaas,
} from "@/lib/asaas/client"
import { proximoStatusCobrancaAsaas } from "@/lib/asaas/estado"
import { mensagemErroAsaasSegura } from "@/lib/asaas/seguranca"
import { db } from "@/lib/db"
import { registrarLog } from "@/lib/services/auditoria.service"
import { chaveCompetencia, dataCivilParaDate, formatarDataInput } from "@/lib/utils/datas"
import type { WebhookAsaas } from "@/lib/validations/asaas"

const TEMPO_RESERVA_MS = 2 * 60 * 1_000
const STATUS_TERMINAIS: StatusCobrancaAsaas[] = ["RECEBIDA", "CANCELADA", "ESTORNADA"]

function somenteDigitos(valor?: string | null) {
  return valor?.replace(/\D/g, "") || undefined
}

function dataAsaas(data: Date) {
  return formatarDataInput(data)
}

function dataValida(valor?: string | null) {
  if (!valor) return null
  if (/^\d{4}-\d{2}-\d{2}$/.test(valor)) return dataCivilParaDate(valor)
  const normalizado = valor.includes("T") ? valor : valor.replace(" ", "T")
  const temFuso = /(?:Z|[+-]\d{2}:\d{2})$/.test(normalizado)
  const data = new Date(temFuso ? normalizado : `${normalizado}Z`)
  return Number.isNaN(data.getTime()) ? null : data
}

function referenciaCliente(solicitacaoId: string) {
  return `ecvo-matricula-${solicitacaoId}`
}

function referenciaCobranca(solicitacaoId: string, geracao = 1) {
  const base = `matricula:${solicitacaoId}`
  return geracao === 1 ? base : `${base}:tentativa:${geracao}`
}

function reservaEmAndamento(atualizadoEm: Date) {
  return Date.now() - atualizadoEm.getTime() < TEMPO_RESERVA_MS
}

function qrCodeValido(cobranca: {
  status: StatusCobrancaAsaas
  pixCopiaECola: string | null
  qrCodeExpiraEm: Date | null
}) {
  return Boolean(
    !STATUS_TERMINAIS.includes(cobranca.status) &&
      cobranca.pixCopiaECola &&
      cobranca.qrCodeExpiraEm &&
      cobranca.qrCodeExpiraEm.getTime() > Date.now(),
  )
}

export function obterPlanoPadraoMatricula() {
  return db.plano.findFirst({
    where: { padrao: true, ativo: true, periodicidade: "MENSAL" },
    select: { id: true, nome: true, valor: true, periodicidade: true },
  })
}

export function obterPagamentoMatriculaPublico(tokenAcompanhamento: string) {
  return db.solicitacaoMatricula.findUnique({
    where: { tokenAcompanhamento },
    select: {
      id: true,
      tokenAcompanhamento: true,
      tipoPagamento: true,
      status: true,
      criadoEm: true,
      plano: { select: { nome: true, valor: true, periodicidade: true } },
      cobrancasAsaas: {
        where: { ativa: true },
        orderBy: { geracao: "desc" },
        take: 1,
        select: {
          status: true,
          valor: true,
          pixCopiaECola: true,
          qrCodeExpiraEm: true,
          invoiceUrl: true,
          ultimoErro: true,
          recebidaEmAsaas: true,
        },
      },
    },
  })
}

async function reservarCobranca(tokenAcompanhamento: string) {
  return db.$transaction(async (tx) => {
    const solicitacao = await tx.solicitacaoMatricula.findUnique({
      where: { tokenAcompanhamento },
      include: { plano: true },
    })
    if (solicitacao?.status !== "PENDENTE") {
      return { ok: false as const, motivo: "Esta solicitação não aceita uma nova cobrança." }
    }
    if (solicitacao.tipoPagamento !== "MENSALISTA") {
      return { ok: false as const, motivo: "Esta modalidade de matrícula não possui cobrança." }
    }
    if (!solicitacao.plano) {
      return { ok: false as const, motivo: "A solicitação não possui um plano vinculado." }
    }
    if (!solicitacao.cpf) {
      return { ok: false as const, motivo: "Informe um CPF válido para gerar o pagamento." }
    }

    await tx.$queryRaw`SELECT "id" FROM "SolicitacaoMatricula" WHERE "id" = ${solicitacao.id} FOR UPDATE`
    const ultima = await tx.cobrancaMatriculaAsaas.findFirst({
      where: { solicitacaoId: solicitacao.id },
      orderBy: { geracao: "desc" },
    })
    if (ultima && !STATUS_TERMINAIS.includes(ultima.status)) {
      if (ultima.asaasPaymentId || qrCodeValido(ultima)) {
        return { ok: true as const, proprietaria: false as const, solicitacao, cobranca: ultima }
      }
      if (ultima.status !== "ERRO" && reservaEmAndamento(ultima.atualizadoEm)) {
        return { ok: false as const, motivo: "O pagamento está sendo preparado." }
      }
      const retomada = await tx.cobrancaMatriculaAsaas.update({
        where: { id: ultima.id },
        data: { status: "CRIANDO", ultimoErro: null, ativa: true },
      })
      return { ok: true as const, proprietaria: true as const, solicitacao, cobranca: retomada }
    }
    if (ultima?.status === "RECEBIDA") {
      return { ok: true as const, proprietaria: false as const, solicitacao, cobranca: ultima }
    }
    if (ultima) {
      await tx.cobrancaMatriculaAsaas.update({ where: { id: ultima.id }, data: { ativa: false } })
    }

    const geracao = (ultima?.geracao ?? 0) + 1
    const hoje = dataCivilParaDate(formatarDataInput(new Date()))
    const cobranca = await tx.cobrancaMatriculaAsaas.create({
      data: {
        solicitacaoId: solicitacao.id,
        geracao,
        externalReference: referenciaCobranca(solicitacao.id, geracao),
        competencia: chaveCompetencia(),
        valor: solicitacao.plano.valor,
        vencimentoAsaas: hoje,
      },
    })
    return { ok: true as const, proprietaria: true as const, solicitacao, cobranca }
  })
}

async function garantirClienteAsaas(params: {
  solicitacaoId: string
  nome: string
  email: string
  cpf: string
  telefone: string | null
}) {
  const externalReference = referenciaCliente(params.solicitacaoId)
  const encontrados = await listarClientesAsaas({ externalReference, limit: 2 })
  if (encontrados.data.length > 1) {
    throw new Error("Mais de um cliente Asaas corresponde à mesma matrícula.")
  }
  const existente = encontrados.data[0]
  if (existente) return existente
  return criarClienteAsaas({
    name: params.nome,
    cpfCnpj: params.cpf,
    email: params.email,
    mobilePhone: somenteDigitos(params.telefone),
    externalReference,
    notificationDisabled: true,
  })
}

async function criarOuRecuperarCobranca(params: {
  customerId: string
  externalReference: string
  valor: number
  vencimento: Date
}) {
  const encontradas = await listarCobrancasAsaas({
    externalReference: params.externalReference,
    limit: 2,
  })
  if (encontradas.data.length > 1) {
    throw new Error("Mais de uma cobrança Asaas corresponde à mesma matrícula.")
  }
  if (encontradas.data[0]) return encontradas.data[0]
  return criarCobrancaAsaas({
    customer: params.customerId,
    billingType: "PIX",
    value: params.valor,
    dueDate: dataAsaas(params.vencimento),
    description: "Primeira mensalidade ECVO",
    externalReference: params.externalReference,
  })
}

async function persistirCobranca(id: string, customerId: string, remota: CobrancaRemotaAsaas) {
  const qrCode = remota.status === "RECEIVED" ? null : await obterQrCodePixAsaas(remota.id)
  const recebida = remota.status === "RECEIVED"
  return db.$transaction(async (tx) => {
    const anterior = await tx.cobrancaMatriculaAsaas.findUniqueOrThrow({ where: { id } })
    const atualizada = await tx.cobrancaMatriculaAsaas.update({
      where: { id },
      data: {
        asaasCustomerId: customerId,
        asaasPaymentId: remota.id,
        status: recebida ? "RECEBIDA" : "PENDENTE",
        statusAsaas: remota.status,
        pixCopiaECola: qrCode?.payload ?? anterior.pixCopiaECola,
        qrCodeExpiraEm: dataValida(qrCode?.expirationDate) ?? anterior.qrCodeExpiraEm,
        invoiceUrl: remota.invoiceUrl ?? null,
        recebidaEmAsaas: recebida ? (dataValida(remota.paymentDate) ?? new Date()) : null,
        ultimoErro: null,
      },
    })
    await registrarLog(
      {
        autorId: null,
        acao: "PAGAMENTO",
        entidade: "CobrancaMatriculaAsaas",
        entidadeId: atualizada.id,
        valorAntigo: { status: anterior.status, asaasPaymentId: anterior.asaasPaymentId },
        valorNovo: { status: atualizada.status, asaasPaymentId: atualizada.asaasPaymentId },
      },
      tx,
    )
    return atualizada
  })
}

export async function gerarCobrancaMatriculaAsaas(
  tokenAcompanhamento: string,
  opcoes: { verificar?: boolean } = {},
) {
  const reserva = await reservarCobranca(tokenAcompanhamento)
  if (!reserva.ok) return reserva
  if (
    reserva.cobranca.status === "RECEBIDA" ||
    (!opcoes.verificar && qrCodeValido(reserva.cobranca))
  ) {
    return { ok: true as const, cobranca: reserva.cobranca }
  }
  if (
    opcoes.verificar &&
    !reserva.proprietaria &&
    reserva.cobranca.asaasPaymentId &&
    Date.now() - reserva.cobranca.atualizadoEm.getTime() < 3_000
  ) {
    return { ok: false as const, motivo: "Aguarde alguns segundos antes de verificar novamente." }
  }

  try {
    const cliente = await garantirClienteAsaas({
      solicitacaoId: reserva.solicitacao.id,
      nome: reserva.solicitacao.nome,
      email: reserva.solicitacao.email,
      cpf: reserva.solicitacao.cpf!,
      telefone: reserva.solicitacao.telefone,
    })
    const remota = reserva.cobranca.asaasPaymentId
      ? await obterCobrancaAsaas(reserva.cobranca.asaasPaymentId)
      : await criarOuRecuperarCobranca({
          customerId: cliente.id,
          externalReference: reserva.cobranca.externalReference,
          valor: Number(reserva.cobranca.valor),
          vencimento: reserva.cobranca.vencimentoAsaas,
        })
    const cobranca = await persistirCobranca(reserva.cobranca.id, cliente.id, remota)
    return { ok: true as const, cobranca }
  } catch (erro) {
    const motivo = mensagemErroAsaasSegura(erro)
    await db.cobrancaMatriculaAsaas.update({
      where: { id: reserva.cobranca.id },
      data: { status: "ERRO", ultimoErro: motivo },
    })
    return { ok: false as const, motivo }
  }
}

function divergenciaWebhook(
  cobranca: {
    asaasPaymentId: string | null
    asaasCustomerId: string | null
    externalReference: string
    valor: Prisma.Decimal
    vencimentoAsaas: Date
  },
  pagamento: NonNullable<WebhookAsaas["payment"]>,
) {
  if (cobranca.asaasPaymentId && cobranca.asaasPaymentId !== pagamento.id) {
    return "Identificador da cobrança de matrícula divergente."
  }
  if (cobranca.externalReference !== pagamento.externalReference)
    return "Referência da cobrança de matrícula divergente."
  if (
    !pagamento.customer ||
    (cobranca.asaasCustomerId && cobranca.asaasCustomerId !== pagamento.customer)
  ) {
    return "Cliente da cobrança de matrícula divergente."
  }
  if (pagamento.billingType !== "PIX") return "Meio de pagamento da matrícula divergente."
  if (pagamento.value === undefined || Math.abs(pagamento.value - Number(cobranca.valor)) > 0.001) {
    return "Valor da cobrança de matrícula divergente."
  }
  if (!pagamento.dueDate || pagamento.dueDate !== dataAsaas(cobranca.vencimentoAsaas)) {
    return "Vencimento da cobrança de matrícula divergente."
  }
  return null
}

function statusMatriculaPorEvento(evento: string): StatusCobrancaAsaas | null {
  const mapa: Record<string, StatusCobrancaAsaas> = {
    PAYMENT_RECEIVED: "RECEBIDA",
    PAYMENT_OVERDUE: "VENCIDA",
    PAYMENT_DELETED: "CANCELADA",
    PAYMENT_REFUNDED: "ESTORNADA",
    PAYMENT_PARTIALLY_REFUNDED: "ERRO",
  }
  return mapa[evento] ?? null
}

export async function aplicarWebhookPagamentoMatricula(
  tx: Prisma.TransactionClient,
  cobranca: {
    id: string
    status: StatusCobrancaAsaas
    asaasPaymentId: string | null
    asaasCustomerId: string | null
    externalReference: string
    valor: Prisma.Decimal
    vencimentoAsaas: Date
  },
  webhook: WebhookAsaas,
) {
  if (!webhook.payment) return { ok: true as const, duplicado: false as const }
  const divergencia = divergenciaWebhook(cobranca, webhook.payment)
  if (divergencia) return { ok: false as const, duplicado: false as const, motivo: divergencia }

  const recebido = statusMatriculaPorEvento(webhook.event)
  const status = recebido ? proximoStatusCobrancaAsaas(cobranca.status, recebido) : cobranca.status
  const pagamentoRecebido = webhook.event === "PAYMENT_RECEIVED"
  await tx.cobrancaMatriculaAsaas.update({
    where: { id: cobranca.id },
    data: {
      status,
      asaasPaymentId: webhook.payment.id,
      asaasCustomerId: webhook.payment.customer,
      ativa: !["CANCELADA", "ESTORNADA"].includes(status),
      statusAsaas: webhook.payment.status ?? null,
      ultimoEventoAsaas: webhook.event,
      recebidaEmAsaas: pagamentoRecebido
        ? (dataValida(webhook.payment.paymentDate ?? webhook.dateCreated) ?? new Date())
        : undefined,
      estornoParcialPendenteEm:
        webhook.event === "PAYMENT_PARTIALLY_REFUNDED" ? new Date() : undefined,
      ultimoErro:
        webhook.event === "PAYMENT_PARTIALLY_REFUNDED"
          ? "Estorno parcial recebido; conciliação manual necessária."
          : null,
    },
  })
  if (status !== cobranca.status) {
    await registrarLog(
      {
        autorId: null,
        acao: "PAGAMENTO",
        entidade: "CobrancaMatriculaAsaas",
        entidadeId: cobranca.id,
        valorAntigo: { status: cobranca.status },
        valorNovo: { status, evento: webhook.event },
        justificativa: `Evento Asaas ${webhook.id}.`,
      },
      tx,
    )
  }
  return { ok: true as const, duplicado: false as const }
}

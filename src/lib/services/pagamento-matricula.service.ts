import "server-only"
import type { Prisma, StatusCobrancaAsaas } from "@prisma/client"
import {
  type CobrancaAsaas as CobrancaRemotaAsaas,
  criarClienteAsaas,
  criarCobrancaAsaas,
  excluirCobrancaAsaas,
  listarClientesAsaas,
  listarCobrancasAsaas,
  obterCobrancaAsaas,
  obterQrCodePixAsaas,
  type QrCodePixAsaas,
} from "@/lib/asaas/client"
import { interpretarDataAsaas } from "@/lib/asaas/datas"
import {
  proximoStatusCobrancaAsaas,
  statusCobrancaMatriculaPorStatusAsaas,
} from "@/lib/asaas/estado"
import { mensagemErroAsaasSegura } from "@/lib/asaas/seguranca"
import { db } from "@/lib/db"
import { registrarLog } from "@/lib/services/auditoria.service"
import { chaveCompetencia, dataCivilParaDate, formatarDataInput } from "@/lib/utils/datas"
import type { WebhookAsaas } from "@/lib/validations/asaas"

const TEMPO_RESERVA_MS = 2 * 60 * 1_000
const STATUS_SEM_PIX: StatusCobrancaAsaas[] = [
  "RECEBIDA",
  "CANCELANDO",
  "VENCIDA",
  "CANCELADA",
  "RECUSADA",
  "ESTORNADA",
  "ERRO",
]

function somenteDigitos(valor?: string | null) {
  return valor?.replace(/\D/g, "") || undefined
}

function dataAsaas(data: Date) {
  return formatarDataInput(data)
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

export function pixCobrancaMatriculaDisponivel(
  cobranca: {
    status: StatusCobrancaAsaas
    statusAsaas?: string | null
    pixCopiaECola: string | null
    qrCodeExpiraEm: Date | null
  },
  agora = new Date(),
) {
  return Boolean(
    cobranca.status === "PENDENTE" &&
      (!cobranca.statusAsaas || cobranca.statusAsaas === "PENDING") &&
      cobranca.pixCopiaECola &&
      cobranca.qrCodeExpiraEm &&
      cobranca.qrCodeExpiraEm.getTime() > agora.getTime(),
  )
}

function motivoStatusRemoto(status: CobrancaRemotaAsaas["status"]) {
  if (status === "CONFIRMED") return "Pagamento confirmado; aguardando o recebimento pelo Asaas."
  if (status === "OVERDUE") return "A cobrança PIX venceu e precisa ser reemitida."
  if (status === "DELETED") return "A cobrança PIX foi cancelada e precisa ser reemitida."
  if (status === "REFUNDED") return "O pagamento foi estornado; gere uma nova cobrança PIX."
  if (status === "PARTIALLY_REFUNDED") {
    return "O pagamento teve estorno parcial e requer conciliação manual."
  }
  if (status !== "PENDING" && status !== "RECEIVED") {
    return `A cobrança está no estado ${status} e requer conciliação.`
  }
  return null
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
          statusAsaas: true,
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
    const identificada = await tx.solicitacaoMatricula.findUnique({
      where: { tokenAcompanhamento },
      select: { id: true },
    })
    if (!identificada) {
      return { ok: false as const, motivo: "Solicitação de matrícula não encontrada." }
    }
    await tx.$queryRaw`SELECT "id" FROM "SolicitacaoMatricula" WHERE "id" = ${identificada.id} FOR UPDATE`
    const solicitacao = await tx.solicitacaoMatricula.findUnique({
      where: { id: identificada.id },
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

    const ultima = await tx.cobrancaMatriculaAsaas.findFirst({
      where: { solicitacaoId: solicitacao.id },
      orderBy: { geracao: "desc" },
    })
    if (ultima) {
      if (
        ultima.asaasPaymentId ||
        pixCobrancaMatriculaDisponivel(ultima) ||
        !["CRIANDO", "ERRO"].includes(ultima.status)
      ) {
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

    const geracao = 1
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

async function persistirCobranca(
  id: string,
  customerId: string,
  remota: CobrancaRemotaAsaas,
  qrCodeInformado?: QrCodePixAsaas | null,
) {
  const status = statusCobrancaMatriculaPorStatusAsaas(remota.status)
  const qrCode =
    remota.status === "PENDING"
      ? qrCodeInformado === undefined
        ? await obterQrCodePixAsaas(remota.id)
        : qrCodeInformado
      : null
  const qrCodeExpiraEm = interpretarDataAsaas(qrCode?.expirationDate)
  const qrValido = Boolean(qrCode?.payload && qrCodeExpiraEm && qrCodeExpiraEm > new Date())
  const recebida = status === "RECEBIDA"
  const ultimoErro =
    remota.status === "PENDING" && !qrValido
      ? "O QR Code PIX retornado pelo Asaas está vencido ou inválido."
      : motivoStatusRemoto(remota.status)
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "CobrancaMatriculaAsaas" WHERE "id" = ${id} FOR UPDATE`
    const anterior = await tx.cobrancaMatriculaAsaas.findUniqueOrThrow({ where: { id } })
    if (anterior.status === "RECEBIDA" && !recebida) return anterior
    const atualizada = await tx.cobrancaMatriculaAsaas.update({
      where: { id },
      data: {
        asaasCustomerId: customerId,
        asaasPaymentId: remota.id,
        status,
        ativa: !STATUS_SEM_PIX.includes(status),
        statusAsaas: remota.status,
        pixCopiaECola: qrValido ? qrCode?.payload : recebida ? anterior.pixCopiaECola : null,
        qrCodeExpiraEm: qrValido ? qrCodeExpiraEm : recebida ? anterior.qrCodeExpiraEm : null,
        invoiceUrl: remota.invoiceUrl ?? null,
        recebidaEmAsaas: recebida
          ? (interpretarDataAsaas(remota.paymentDate) ?? new Date())
          : undefined,
        ultimoErro,
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
    (!opcoes.verificar && pixCobrancaMatriculaDisponivel(reserva.cobranca))
  ) {
    return { ok: true as const, cobranca: reserva.cobranca }
  }
  if (reserva.cobranca.status === "CANCELANDO") {
    return { ok: false as const, motivo: "A cobrança está sendo substituída." }
  }
  if (
    !reserva.cobranca.asaasPaymentId &&
    ["VENCIDA", "CANCELADA", "RECUSADA", "ESTORNADA"].includes(reserva.cobranca.status)
  ) {
    return { ok: false as const, motivo: "Esta cobrança precisa ser reemitida." }
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
    await db.cobrancaMatriculaAsaas.updateMany({
      where: {
        id: reserva.cobranca.id,
        status: { notIn: ["RECEBIDA", "ESTORNADA"] },
      },
      data: {
        status: "ERRO",
        ativa: false,
        pixCopiaECola: null,
        qrCodeExpiraEm: null,
        ultimoErro: motivo,
      },
    })
    return { ok: false as const, motivo }
  }
}

async function reservarReemissao(tokenAcompanhamento: string) {
  return db.$transaction(async (tx) => {
    const identificada = await tx.solicitacaoMatricula.findUnique({
      where: { tokenAcompanhamento },
      select: { id: true },
    })
    if (!identificada) {
      return { ok: false as const, motivo: "Solicitação de matrícula não encontrada." }
    }
    await tx.$queryRaw`SELECT "id" FROM "SolicitacaoMatricula" WHERE "id" = ${identificada.id} FOR UPDATE`
    const solicitacao = await tx.solicitacaoMatricula.findUnique({
      where: { id: identificada.id },
      include: { plano: true },
    })
    if (solicitacao?.status !== "PENDENTE" || solicitacao.tipoPagamento !== "MENSALISTA") {
      return { ok: false as const, motivo: "Esta solicitação não aceita uma nova cobrança." }
    }
    if (!solicitacao.plano || !solicitacao.cpf) {
      return {
        ok: false as const,
        motivo: "Os dados financeiros da solicitação estão incompletos.",
      }
    }
    const cobranca = await tx.cobrancaMatriculaAsaas.findFirst({
      where: { solicitacaoId: solicitacao.id },
      orderBy: { geracao: "desc" },
    })
    if (!cobranca) return { ok: true as const, retomar: true as const, solicitacao }
    if (cobranca.status === "RECEBIDA") {
      return { ok: false as const, motivo: "O pagamento já foi recebido pelo Asaas." }
    }
    if (cobranca.statusAsaas === "CONFIRMED") {
      return {
        ok: false as const,
        motivo: "O pagamento já foi confirmado e aguarda recebimento pelo Asaas.",
      }
    }
    if (cobranca.statusAsaas === "PARTIALLY_REFUNDED") {
      return { ok: false as const, motivo: "O pagamento requer conciliação manual." }
    }
    if (!cobranca.asaasPaymentId) {
      return { ok: true as const, retomar: true as const, solicitacao }
    }
    if (cobranca.status === "CANCELANDO" && reservaEmAndamento(cobranca.atualizadoEm)) {
      return { ok: false as const, motivo: "A cobrança já está sendo substituída." }
    }
    const reservada = await tx.cobrancaMatriculaAsaas.update({
      where: { id: cobranca.id },
      data: { status: "CANCELANDO", ativa: false, ultimoErro: null },
    })
    return {
      ok: true as const,
      retomar: false as const,
      solicitacao,
      cobranca: reservada,
    }
  })
}

type EncerramentoCobrancaRemota = {
  status: Extract<StatusCobrancaAsaas, "CANCELADA" | "ESTORNADA">
  statusAsaas: "DELETED" | "REFUNDED"
  justificativa: string
}

async function criarNovaGeracaoAposEncerramento(params: {
  solicitacaoId: string
  cobrancaId: string
  asaasPaymentId: string
  encerramento: EncerramentoCobrancaRemota
}) {
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "SolicitacaoMatricula" WHERE "id" = ${params.solicitacaoId} FOR UPDATE`
    const solicitacao = await tx.solicitacaoMatricula.findUnique({
      where: { id: params.solicitacaoId },
      include: { plano: true },
    })
    if (solicitacao?.status !== "PENDENTE" || !solicitacao.plano) {
      return { ok: false as const, motivo: "Esta solicitação não aceita uma nova cobrança." }
    }
    const atual = await tx.cobrancaMatriculaAsaas.findUniqueOrThrow({
      where: { id: params.cobrancaId },
    })
    if (atual.status === "RECEBIDA") {
      return { ok: false as const, motivo: "O pagamento já foi recebido pelo Asaas." }
    }
    const ultima = await tx.cobrancaMatriculaAsaas.findFirst({
      where: { solicitacaoId: solicitacao.id },
      orderBy: { geracao: "desc" },
    })
    if (ultima?.id !== atual.id) {
      return { ok: false as const, motivo: "A cobrança foi alterada por outra operação." }
    }
    await tx.cobrancaMatriculaAsaas.update({
      where: { id: atual.id },
      data: {
        status: params.encerramento.status,
        ativa: false,
        statusAsaas: params.encerramento.statusAsaas,
        pixCopiaECola: null,
        qrCodeExpiraEm: null,
        ultimoErro: null,
      },
    })
    const geracao = atual.geracao + 1
    const hoje = dataCivilParaDate(formatarDataInput(new Date()))
    const nova = await tx.cobrancaMatriculaAsaas.create({
      data: {
        solicitacaoId: solicitacao.id,
        geracao,
        externalReference: referenciaCobranca(solicitacao.id, geracao),
        competencia: chaveCompetencia(),
        valor: solicitacao.plano.valor,
        vencimentoAsaas: hoje,
      },
    })
    await registrarLog(
      {
        autorId: null,
        acao: "PAGAMENTO",
        entidade: "CobrancaMatriculaAsaas",
        entidadeId: atual.id,
        valorAntigo: { status: atual.status, ativa: atual.ativa },
        valorNovo: {
          status: params.encerramento.status,
          statusAsaas: params.encerramento.statusAsaas,
          ativa: false,
          substituidaPor: nova.id,
        },
        justificativa: params.encerramento.justificativa,
      },
      tx,
    )
    return { ok: true as const, cobranca: nova, solicitacao }
  })
}

async function registrarFalhaReemissao(params: {
  cobrancaId: string
  asaasPaymentId: string
  motivo: string
  encerramento: EncerramentoCobrancaRemota | null
}) {
  return db.$transaction(async (tx) => {
    const status = params.encerramento?.status ?? "ERRO"
    const atualizada = await tx.cobrancaMatriculaAsaas.updateMany({
      where: { id: params.cobrancaId, status: "CANCELANDO" },
      data: {
        status,
        ativa: false,
        statusAsaas: params.encerramento?.statusAsaas,
        pixCopiaECola: null,
        qrCodeExpiraEm: null,
        ultimoErro: params.motivo,
      },
    })
    if (atualizada.count === 0) return
    await registrarLog(
      {
        autorId: null,
        acao: "PAGAMENTO",
        entidade: "CobrancaMatriculaAsaas",
        entidadeId: params.cobrancaId,
        valorAntigo: { status: "CANCELANDO", ativa: false },
        valorNovo: {
          status,
          statusAsaas: params.encerramento?.statusAsaas ?? null,
          ativa: false,
          erro: params.motivo,
        },
        justificativa: params.encerramento
          ? `Cobrança remota ${params.asaasPaymentId} encerrada, mas a reemissão local falhou.`
          : "Falha ao reemitir a cobrança PIX de matrícula.",
      },
      tx,
    )
  })
}

export async function reemitirCobrancaMatriculaAsaas(tokenAcompanhamento: string) {
  const reserva = await reservarReemissao(tokenAcompanhamento)
  if (!reserva.ok) return reserva
  if (reserva.retomar) {
    return gerarCobrancaMatriculaAsaas(tokenAcompanhamento, { verificar: true })
  }

  const { cobranca, solicitacao } = reserva
  let encerramento: EncerramentoCobrancaRemota | null = null
  try {
    const remota = await obterCobrancaAsaas(cobranca.asaasPaymentId!)
    const divergencia = divergenciaWebhook(cobranca, {
      id: remota.id,
      customer: remota.customer,
      externalReference: remota.externalReference,
      billingType: remota.billingType,
      value: remota.value,
      dueDate: remota.dueDate,
      status: remota.status,
    })
    if (divergencia) throw new Error(divergencia)

    if (remota.status === "PENDING") {
      const qrCode = await obterQrCodePixAsaas(remota.id)
      const expiraEm = interpretarDataAsaas(qrCode.expirationDate)
      if (qrCode.payload && expiraEm && expiraEm > new Date()) {
        const sincronizada = await persistirCobranca(cobranca.id, remota.customer, remota, qrCode)
        return { ok: true as const, cobranca: sincronizada, reemitida: false as const }
      }
    } else if (!["OVERDUE", "DELETED", "REFUNDED"].includes(remota.status)) {
      const sincronizada = await persistirCobranca(cobranca.id, remota.customer, remota, null)
      const motivo = motivoStatusRemoto(remota.status)
      return sincronizada.status === "RECEBIDA"
        ? { ok: true as const, cobranca: sincronizada, reemitida: false as const }
        : { ok: false as const, motivo: motivo ?? "A cobrança requer conciliação manual." }
    }

    if (remota.status === "PENDING" || remota.status === "OVERDUE") {
      const excluida = await excluirCobrancaAsaas(remota.id)
      if (!excluida.deleted || excluida.id !== remota.id) {
        throw new Error("O Asaas não confirmou o cancelamento da cobrança anterior.")
      }
      encerramento = {
        status: "CANCELADA",
        statusAsaas: "DELETED",
        justificativa: `Cobrança remota ${remota.id} cancelada antes da reemissão.`,
      }
    } else if (remota.status === "DELETED") {
      encerramento = {
        status: "CANCELADA",
        statusAsaas: "DELETED",
        justificativa: `Cobrança remota ${remota.id} já estava cancelada antes da reemissão.`,
      }
    } else if (remota.status === "REFUNDED") {
      encerramento = {
        status: "ESTORNADA",
        statusAsaas: "REFUNDED",
        justificativa: `Cobrança remota ${remota.id} estava estornada antes da reemissão.`,
      }
    }

    if (!encerramento) throw new Error("A cobrança anterior não foi encerrada para reemissão.")
    const novaReserva = await criarNovaGeracaoAposEncerramento({
      solicitacaoId: solicitacao.id,
      cobrancaId: cobranca.id,
      asaasPaymentId: remota.id,
      encerramento,
    })
    if (!novaReserva.ok) throw new Error(novaReserva.motivo)
    const cliente = await garantirClienteAsaas({
      solicitacaoId: solicitacao.id,
      nome: solicitacao.nome,
      email: solicitacao.email,
      cpf: solicitacao.cpf!,
      telefone: solicitacao.telefone,
    })
    const novaRemota = await criarOuRecuperarCobranca({
      customerId: cliente.id,
      externalReference: novaReserva.cobranca.externalReference,
      valor: Number(novaReserva.cobranca.valor),
      vencimento: novaReserva.cobranca.vencimentoAsaas,
    })
    const nova = await persistirCobranca(novaReserva.cobranca.id, cliente.id, novaRemota)
    return { ok: true as const, cobranca: nova, reemitida: true as const }
  } catch (erro) {
    const motivo = mensagemErroAsaasSegura(erro)
    await registrarFalhaReemissao({
      cobrancaId: cobranca.id,
      asaasPaymentId: cobranca.asaasPaymentId!,
      motivo,
      encerramento,
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
    PAYMENT_CONFIRMED: "PENDENTE",
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
    solicitacaoId: string
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
  const pagamentoPriorizado = pagamentoRecebido || webhook.event === "PAYMENT_CONFIRMED"
  const outraAtiva = pagamentoPriorizado
    ? await tx.cobrancaMatriculaAsaas.findFirst({
        where: {
          solicitacaoId: cobranca.solicitacaoId,
          id: { not: cobranca.id },
          ativa: true,
        },
        select: { id: true, status: true },
      })
    : null
  if (outraAtiva) {
    await tx.cobrancaMatriculaAsaas.update({
      where: { id: outraAtiva.id },
      data: {
        ativa: false,
        pixCopiaECola: null,
        qrCodeExpiraEm: null,
        ultimoErro: "Outra tentativa foi confirmada; concilie a cobrança remota substituída.",
      },
    })
    await registrarLog(
      {
        autorId: null,
        acao: "PAGAMENTO",
        entidade: "CobrancaMatriculaAsaas",
        entidadeId: outraAtiva.id,
        valorAntigo: { ativa: true, status: outraAtiva.status },
        valorNovo: { ativa: false, status: outraAtiva.status },
        justificativa: `Outra tentativa foi priorizada pelo evento Asaas ${webhook.id}.`,
      },
      tx,
    )
  }
  await tx.cobrancaMatriculaAsaas.update({
    where: { id: cobranca.id },
    data: {
      status,
      asaasPaymentId: webhook.payment.id,
      asaasCustomerId: webhook.payment.customer,
      ativa: pagamentoPriorizado || (!STATUS_SEM_PIX.includes(status) && !outraAtiva),
      statusAsaas: webhook.payment.status ?? null,
      pixCopiaECola: !pagamentoRecebido ? null : undefined,
      qrCodeExpiraEm: !pagamentoRecebido ? null : undefined,
      ultimoEventoAsaas: webhook.event,
      recebidaEmAsaas: pagamentoRecebido
        ? (interpretarDataAsaas(webhook.payment.paymentDate ?? webhook.dateCreated) ?? new Date())
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

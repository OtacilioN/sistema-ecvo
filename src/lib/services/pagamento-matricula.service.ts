import "server-only"
import type { FinalidadeCobrancaMatriculaAsaas, Prisma, StatusCobrancaAsaas } from "@prisma/client"
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
import {
  planoCompativelComAulaAvulsa,
  situacaoConversaoAulaAvulsa,
  VALOR_AULA_AVULSA,
  VALOR_COMPLEMENTO_AULA_AVULSA,
} from "@/lib/aula-avulsa"
import { db } from "@/lib/db"
import { registrarLog } from "@/lib/services/auditoria.service"
import { obterOuCriarMensalidadeNaTransacao } from "@/lib/services/financeiro.service"
import { criarNotificacao } from "@/lib/services/notificacao.service"
import {
  chaveCompetencia,
  dataCivilParaDate,
  formatarDataInput,
  inicioDaSemanaAcademia,
} from "@/lib/utils/datas"
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

function finalidadeInicial(tipoPagamento: "MENSALISTA" | "AULA_AVULSA") {
  return tipoPagamento === "AULA_AVULSA" ? "AULA_AVULSA" : "PRIMEIRA_MENSALIDADE"
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
      aulaAvulsa: {
        select: {
          inicio: true,
          fim: true,
          turma: { select: { nome: true, local: true, modalidade: { select: { nome: true } } } },
        },
      },
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
    if (solicitacao.tipoPagamento !== "MENSALISTA" && solicitacao.tipoPagamento !== "AULA_AVULSA") {
      return { ok: false as const, motivo: "Esta modalidade de matrícula não possui cobrança." }
    }
    if (!solicitacao.plano) {
      return { ok: false as const, motivo: "A solicitação não possui um plano vinculado." }
    }
    if (
      solicitacao.tipoPagamento === "AULA_AVULSA" &&
      !planoCompativelComAulaAvulsa(Number(solicitacao.plano.valor))
    ) {
      return { ok: false as const, motivo: "O plano mensal padrão não está em R$ 100,00." }
    }
    if (!solicitacao.cpf) {
      return { ok: false as const, motivo: "Informe um CPF válido para gerar o pagamento." }
    }

    const ultima = await tx.cobrancaMatriculaAsaas.findFirst({
      where: {
        solicitacaoId: solicitacao.id,
        finalidade: finalidadeInicial(solicitacao.tipoPagamento),
      },
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
        finalidade: finalidadeInicial(solicitacao.tipoPagamento),
        geracao,
        externalReference: referenciaCobranca(solicitacao.id, geracao),
        competencia: chaveCompetencia(),
        valor:
          solicitacao.tipoPagamento === "AULA_AVULSA" ? VALOR_AULA_AVULSA : solicitacao.plano.valor,
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
  descricao: string
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
    description: params.descricao,
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
          descricao:
            reserva.cobranca.finalidade === "AULA_AVULSA"
              ? "Aula avulsa ECVO"
              : "Primeira mensalidade ECVO",
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

export function obterConversaoAulaAvulsa(alunoId: string) {
  return db.acessoAulaAvulsa.findFirst({
    where: { alunoId },
    orderBy: { criadoEm: "desc" },
    include: {
      aula: {
        select: {
          inicio: true,
          fim: true,
          turma: { select: { nome: true, local: true, modalidade: { select: { nome: true } } } },
        },
      },
      solicitacao: {
        select: {
          plano: { select: { nome: true, valor: true, ativo: true, periodicidade: true } },
          cobrancasAsaas: {
            where: { finalidade: "COMPLEMENTO_MENSALIDADE" },
            orderBy: { geracao: "desc" },
            take: 1,
          },
        },
      },
    },
  })
}

async function reservarComplementoAulaAvulsa(alunoId: string, agora: Date) {
  return db.$transaction(async (tx) => {
    const acessoIdentificado = await tx.acessoAulaAvulsa.findFirst({
      where: { alunoId },
      orderBy: { criadoEm: "desc" },
      select: { id: true },
    })
    if (!acessoIdentificado) {
      return { ok: false as const, motivo: "Aula avulsa não encontrada para este aluno." }
    }
    await tx.$queryRaw`SELECT "id" FROM "AcessoAulaAvulsa" WHERE "id" = ${acessoIdentificado.id} FOR UPDATE`
    const acesso = await tx.acessoAulaAvulsa.findUnique({
      where: { id: acessoIdentificado.id },
      include: {
        aluno: {
          select: {
            id: true,
            tipo: true,
            planoId: true,
            usuario: { select: { id: true, nome: true, email: true } },
            cpf: true,
            telefone: true,
          },
        },
        aula: { select: { inicio: true } },
        solicitacao: { include: { plano: true } },
      },
    })
    if (!acesso || !["ATIVO", "USADO"].includes(acesso.status) || acesso.aluno.tipo !== "AVULSO") {
      return { ok: false as const, motivo: "A mensalidade desta aula avulsa já foi fechada." }
    }
    if (acesso.aluno.planoId) {
      return { ok: false as const, motivo: "O aluno já possui um plano mensal vinculado." }
    }
    const situacao = situacaoConversaoAulaAvulsa({ inicioAula: acesso.aula.inicio, agora })
    if (situacao === "AGUARDANDO_SEMANA") {
      return {
        ok: false as const,
        motivo: "O complemento fica disponível a partir da segunda-feira da semana da aula.",
      }
    }
    if (situacao === "EXPIRADA" || agora.getTime() >= acesso.prazoConversao.getTime()) {
      return {
        ok: false as const,
        motivo: "O prazo para fechar a mensalidade por R$ 80,00 terminou.",
      }
    }
    if (
      !acesso.solicitacao.plano?.ativo ||
      acesso.solicitacao.plano.periodicidade !== "MENSAL" ||
      !planoCompativelComAulaAvulsa(Number(acesso.solicitacao.plano.valor))
    ) {
      return { ok: false as const, motivo: "O plano mensal de R$ 100,00 não está disponível." }
    }
    if (!acesso.aluno.cpf) {
      return { ok: false as const, motivo: "O CPF do aluno é necessário para gerar o PIX." }
    }

    const existente = await tx.cobrancaMatriculaAsaas.findFirst({
      where: {
        solicitacaoId: acesso.solicitacaoId,
        finalidade: "COMPLEMENTO_MENSALIDADE",
      },
      orderBy: { geracao: "desc" },
    })
    if (existente) {
      return { ok: true as const, proprietaria: false as const, acesso, cobranca: existente }
    }

    const ultima = await tx.cobrancaMatriculaAsaas.findFirst({
      where: { solicitacaoId: acesso.solicitacaoId },
      orderBy: { geracao: "desc" },
      select: { geracao: true },
    })
    const geracao = (ultima?.geracao ?? 0) + 1
    const cobranca = await tx.cobrancaMatriculaAsaas.create({
      data: {
        solicitacaoId: acesso.solicitacaoId,
        finalidade: "COMPLEMENTO_MENSALIDADE",
        geracao,
        externalReference: `matricula:${acesso.solicitacaoId}:complemento:${geracao}`,
        competencia: chaveCompetencia(acesso.aula.inicio),
        valor: acesso.valorComplemento,
        vencimentoAsaas: new Date(acesso.prazoConversao.getTime() - 1),
      },
    })
    return { ok: true as const, proprietaria: true as const, acesso, cobranca }
  })
}

export async function gerarCobrancaComplementoAulaAvulsaAsaas(
  alunoId: string,
  opcoes: { verificar?: boolean; agora?: Date } = {},
) {
  const reserva = await reservarComplementoAulaAvulsa(alunoId, opcoes.agora ?? new Date())
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
    reserva.cobranca.asaasPaymentId &&
    ["VENCIDA", "CANCELADA", "RECUSADA", "ESTORNADA"].includes(reserva.cobranca.status)
  ) {
    return { ok: false as const, motivo: "A cobrança precisa ser reemitida." }
  }

  try {
    const cliente = await garantirClienteAsaas({
      solicitacaoId: reserva.acesso.solicitacaoId,
      nome: reserva.acesso.aluno.usuario.nome,
      email: reserva.acesso.aluno.usuario.email,
      cpf: reserva.acesso.aluno.cpf!,
      telefone: reserva.acesso.aluno.telefone,
    })
    const remota = reserva.cobranca.asaasPaymentId
      ? await obterCobrancaAsaas(reserva.cobranca.asaasPaymentId)
      : await criarOuRecuperarCobranca({
          customerId: cliente.id,
          externalReference: reserva.cobranca.externalReference,
          valor: VALOR_COMPLEMENTO_AULA_AVULSA,
          vencimento: reserva.cobranca.vencimentoAsaas,
          descricao: "Complemento da mensalidade ECVO",
        })
    const cobranca = await persistirCobranca(reserva.cobranca.id, cliente.id, remota)
    return { ok: true as const, cobranca }
  } catch (erro) {
    const motivo = mensagemErroAsaasSegura(erro)
    await db.cobrancaMatriculaAsaas.updateMany({
      where: { id: reserva.cobranca.id, status: { notIn: ["RECEBIDA", "ESTORNADA"] } },
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
    if (
      solicitacao?.status !== "PENDENTE" ||
      (solicitacao.tipoPagamento !== "MENSALISTA" && solicitacao.tipoPagamento !== "AULA_AVULSA")
    ) {
      return { ok: false as const, motivo: "Esta solicitação não aceita uma nova cobrança." }
    }
    if (!solicitacao.plano || !solicitacao.cpf) {
      return {
        ok: false as const,
        motivo: "Os dados financeiros da solicitação estão incompletos.",
      }
    }
    const cobranca = await tx.cobrancaMatriculaAsaas.findFirst({
      where: {
        solicitacaoId: solicitacao.id,
        finalidade: finalidadeInicial(solicitacao.tipoPagamento),
      },
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
        finalidade: atual.finalidade,
        geracao,
        externalReference: referenciaCobranca(solicitacao.id, geracao),
        competencia: chaveCompetencia(),
        valor: atual.valor,
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
      descricao:
        novaReserva.cobranca.finalidade === "AULA_AVULSA"
          ? "Aula avulsa ECVO"
          : "Primeira mensalidade ECVO",
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

async function concluirConversaoAulaAvulsa(
  tx: Prisma.TransactionClient,
  params: { cobrancaId: string; recebidaEm: Date },
) {
  const cobranca = await tx.cobrancaMatriculaAsaas.findUnique({
    where: { id: params.cobrancaId },
    include: {
      solicitacao: {
        include: {
          plano: true,
          aluno: { select: { id: true, usuarioId: true, tipo: true, planoId: true } },
          acessoAulaAvulsa: {
            include: {
              aula: { select: { inicio: true, turma: { select: { modalidadeId: true } } } },
            },
          },
        },
      },
    },
  })
  if (cobranca?.finalidade !== "COMPLEMENTO_MENSALIDADE") return
  const { solicitacao } = cobranca
  const acesso = solicitacao.acessoAulaAvulsa
  const aluno = solicitacao.aluno
  const plano = solicitacao.plano
  if (!acesso || !aluno || !plano) {
    throw new Error("Dados da conversão da aula avulsa estão incompletos.")
  }

  await tx.$queryRaw`SELECT "id" FROM "AcessoAulaAvulsa" WHERE "id" = ${acesso.id} FOR UPDATE`
  await tx.$queryRaw`SELECT "id" FROM "Aluno" WHERE "id" = ${aluno.id} FOR UPDATE`
  const [acessoAtual, alunoAtual] = await Promise.all([
    tx.acessoAulaAvulsa.findUnique({ where: { id: acesso.id }, select: { status: true } }),
    tx.aluno.findUnique({ where: { id: aluno.id }, select: { tipo: true, planoId: true } }),
  ])
  if (acessoAtual?.status === "CONVERTIDO") return
  if (!acessoAtual || !["ATIVO", "USADO"].includes(acessoAtual.status)) {
    throw new Error("O acesso avulso não está elegível para conversão.")
  }
  const inicioSemana = inicioDaSemanaAcademia(acesso.aula.inicio)
  if (
    params.recebidaEm.getTime() < inicioSemana.getTime() ||
    params.recebidaEm.getTime() >= acesso.prazoConversao.getTime()
  ) {
    throw new Error("O complemento foi recebido fora da semana elegível e requer conciliação.")
  }
  if (alunoAtual?.tipo !== "AVULSO" || alunoAtual.planoId) {
    throw new Error("O aluno não está mais elegível para a conversão da aula avulsa.")
  }
  if (
    !plano.ativo ||
    plano.periodicidade !== "MENSAL" ||
    !planoCompativelComAulaAvulsa(Number(plano.valor)) ||
    Number(acesso.valorPlanoSnapshot) !== 100 ||
    Number(acesso.valorPago) !== VALOR_AULA_AVULSA ||
    Number(acesso.valorComplemento) !== VALOR_COMPLEMENTO_AULA_AVULSA
  ) {
    throw new Error(
      "Os valores ou o plano da conversão não correspondem ao acordo de R$ 20 + R$ 80.",
    )
  }

  const diaVencimento = Math.min(28, Number(formatarDataInput(params.recebidaEm).slice(-2)))
  await tx.aluno.update({
    where: { id: aluno.id },
    data: { tipo: "MENSALISTA", planoId: plano.id, diaVencimento },
  })
  await tx.alunoPlanoModalidade.upsert({
    where: {
      alunoId_modalidadeId: { alunoId: aluno.id, modalidadeId: acesso.aula.turma.modalidadeId },
    },
    update: { plataformaExterna: null },
    create: {
      alunoId: aluno.id,
      modalidadeId: acesso.aula.turma.modalidadeId,
      plataformaExterna: null,
    },
  })

  const mensalidade = await obterOuCriarMensalidadeNaTransacao(tx, {
    alunoId: aluno.id,
    competencia: cobranca.competencia,
  })
  if (!mensalidade.ok) throw new Error(mensalidade.motivo)
  if (!mensalidade.criada) {
    throw new Error("Já existe mensalidade para a competência da conversão.")
  }
  const mensalidadePaga = await tx.mensalidade.update({
    where: { id: mensalidade.mensalidade.id },
    data: {
      valor: acesso.valorPlanoSnapshot,
      status: "PAGA",
      pagoEm: params.recebidaEm,
      formaPagamento: "PIX_ASAAS_COMPLEMENTO_AULA_AVULSA",
      observacao:
        "Mensalidade de R$ 100,00 quitada com crédito da aula avulsa de R$ 20,00 e complemento Asaas de R$ 80,00.",
    },
  })
  const cobrancaCanonica = await tx.cobrancaAsaas.create({
    data: {
      mensalidadeId: mensalidadePaga.id,
      tipo: "PIX_MENSAL",
      status: "RECEBIDA",
      valorCobrado: acesso.valorComplemento,
      ativa: true,
      asaasPaymentId: cobranca.asaasPaymentId,
      externalReference: cobranca.externalReference,
      vencimentoAsaas: cobranca.vencimentoAsaas,
      statusAsaas: cobranca.statusAsaas,
      pixCopiaECola: cobranca.pixCopiaECola,
      qrCodeExpiraEm: cobranca.qrCodeExpiraEm,
      invoiceUrl: cobranca.invoiceUrl,
      ultimoEventoAsaas: cobranca.ultimoEventoAsaas,
      recebidaEmAsaas: params.recebidaEm,
    },
  })
  await tx.mensalidade.update({
    where: { id: mensalidadePaga.id },
    data: { cobrancaQuitacaoAsaasId: cobrancaCanonica.id },
  })
  await tx.cobrancaMatriculaAsaas.update({
    where: { id: cobranca.id },
    data: { mensalidadeId: mensalidadePaga.id, ativa: false },
  })
  await tx.acessoAulaAvulsa.update({
    where: { id: acesso.id },
    data: { status: "CONVERTIDO", convertidoEm: params.recebidaEm },
  })

  await registrarLog(
    {
      autorId: null,
      acao: "PLANO",
      entidade: "Aluno",
      entidadeId: aluno.id,
      valorAntigo: { tipo: "AVULSO", planoId: null },
      valorNovo: {
        tipo: "MENSALISTA",
        planoId: plano.id,
        diaVencimento,
        mensalidadeId: mensalidadePaga.id,
        valorMensalidade: Number(acesso.valorPlanoSnapshot),
        creditoAulaAvulsa: Number(acesso.valorPago),
        valorComplemento: Number(acesso.valorComplemento),
        asaasPaymentId: cobranca.asaasPaymentId,
      },
      justificativa: "Conversão da aula avulsa confirmada pelo webhook Asaas.",
    },
    tx,
  )
  await criarNotificacao(tx, {
    usuarioId: aluno.usuarioId,
    tipo: "FINANCEIRO",
    titulo: "Mensalidade fechada",
    mensagem: "O complemento de R$ 80,00 foi confirmado. Seu plano mensal ECVO está ativo.",
  })
}

async function tratarEstornoAulaAvulsa(
  tx: Prisma.TransactionClient,
  params: { solicitacaoId: string; eventoId: string },
) {
  const acesso = await tx.acessoAulaAvulsa.findUnique({
    where: { solicitacaoId: params.solicitacaoId },
    include: { aluno: { select: { id: true, usuarioId: true } } },
  })
  if (!acesso || acesso.status === "CANCELADO") return

  if (acesso.status === "CONVERTIDO") {
    await tx.aluno.update({ where: { id: acesso.alunoId }, data: { status: "INADIMPLENTE" } })
    await criarNotificacao(tx, {
      usuarioId: acesso.aluno.usuarioId,
      tipo: "FINANCEIRO",
      titulo: "Crédito da aula avulsa estornado",
      mensagem: "O estorno dos R$ 20,00 requer conciliação da mensalidade com a ECVO.",
    })
    await registrarLog(
      {
        autorId: null,
        acao: "PAGAMENTO",
        entidade: "AcessoAulaAvulsa",
        entidadeId: acesso.id,
        valorAntigo: { status: acesso.status },
        valorNovo: { status: acesso.status, alunoStatus: "INADIMPLENTE" },
        justificativa: `Estorno Asaas ${params.eventoId} após conversão; conciliação manual necessária.`,
      },
      tx,
    )
    return
  }

  const consumido = acesso.status === "USADO" || Boolean(acesso.checkinId)
  await tx.acessoAulaAvulsa.update({
    where: { id: acesso.id },
    data: { status: "CANCELADO" },
  })
  if (!consumido) {
    await tx.comparecimento.updateMany({
      where: { alunoId: acesso.alunoId, aulaId: acesso.aulaId, status: "CONFIRMADO" },
      data: { status: "CANCELADO_GESTOR", canceladoEm: new Date() },
    })
  }
  await tx.aluno.update({
    where: { id: acesso.alunoId },
    data: { status: consumido ? "INADIMPLENTE" : "CANCELADO" },
  })
  await criarNotificacao(tx, {
    usuarioId: acesso.aluno.usuarioId,
    tipo: "FINANCEIRO",
    titulo: "Aula avulsa estornada",
    mensagem: consumido
      ? "O pagamento da aula avulsa utilizada foi estornado e requer regularização com a ECVO."
      : "O pagamento de R$ 20,00 foi estornado e o acesso à aula avulsa foi cancelado.",
  })
  await registrarLog(
    {
      autorId: null,
      acao: "PAGAMENTO",
      entidade: "AcessoAulaAvulsa",
      entidadeId: acesso.id,
      valorAntigo: { status: acesso.status },
      valorNovo: {
        status: "CANCELADO",
        alunoStatus: consumido ? "INADIMPLENTE" : "CANCELADO",
      },
      justificativa: `Estorno integral confirmado pelo evento Asaas ${params.eventoId}.`,
    },
    tx,
  )
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
    finalidade: FinalidadeCobrancaMatriculaAsaas
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
  if (pagamentoRecebido && cobranca.finalidade === "COMPLEMENTO_MENSALIDADE") {
    const recebidaEm =
      interpretarDataAsaas(webhook.payment.paymentDate ?? webhook.dateCreated) ?? new Date()
    await concluirConversaoAulaAvulsa(tx, { cobrancaId: cobranca.id, recebidaEm })
  }
  if (webhook.event === "PAYMENT_REFUNDED" && cobranca.finalidade === "AULA_AVULSA") {
    await tratarEstornoAulaAvulsa(tx, {
      solicitacaoId: cobranca.solicitacaoId,
      eventoId: webhook.id,
    })
  }
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

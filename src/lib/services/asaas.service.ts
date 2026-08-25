import "server-only"
import type {
  Mensalidade,
  Prisma,
  StatusContratoPixAutomatico,
  TipoCobrancaPix,
} from "@prisma/client"
import {
  competenciasDoSemestre,
  estaNaJanelaDeCriacaoPixAutomatico,
  somarMesesCompetencia,
} from "@/lib/asaas/ciclos"
import {
  type AutorizacaoPixAutomaticoAsaas,
  type CobrancaAsaas as CobrancaRemotaAsaas,
  criarAutorizacaoPixAutomaticoAsaas,
  criarClienteAsaas,
  criarCobrancaAsaas,
  listarAutorizacoesPixAutomaticoAsaas,
  listarClientesAsaas,
  listarCobrancasAsaas,
  obterQrCodePixAsaas,
} from "@/lib/asaas/client"
import {
  eventoPagamentoParaStatusAsaas,
  proximoStatusCobrancaAsaas,
  proximoStatusContratoPixAutomatico,
} from "@/lib/asaas/estado"
import { mensagemErroAsaasSegura } from "@/lib/asaas/seguranca"
import { db } from "@/lib/db"
import { registrarLog } from "@/lib/services/auditoria.service"
import {
  gerarMensalidade,
  sincronizarStatusFinanceiroAluno,
} from "@/lib/services/financeiro.service"
import { chaveCompetencia } from "@/lib/utils/datas"
import { idAutorizacaoDoWebhook, type WebhookAsaas } from "@/lib/validations/asaas"

const TOTAL_CICLOS_PIX_AUTOMATICO = 6
const EXPIRACAO_QR_AUTORIZACAO_SEGUNDOS = 86_400

function somenteDigitos(valor?: string | null) {
  return valor?.replace(/\D/g, "") || undefined
}

function dataAsaas(data: Date) {
  return data.toISOString().slice(0, 10)
}

function dataValida(valor?: string | null) {
  if (!valor) return null
  const normalizado = valor.includes("T") ? valor : valor.replace(" ", "T")
  const data = new Date(normalizado.endsWith("Z") ? normalizado : `${normalizado}Z`)
  return Number.isNaN(data.getTime()) ? null : data
}

function referenciaCliente(alunoId: string) {
  return `ecvo-aluno-${alunoId}`
}

function referenciaMensalidade(mensalidadeId: string) {
  return `mensalidade:${mensalidadeId}`
}

function referenciaCiclo(contratoId: string, numeroCiclo: number) {
  return `pixauto:${contratoId}:${numeroCiclo}`
}

function descricaoMensalidade(competencia: string) {
  return `Mensalidade ECVO ${competencia}`
}

async function obterPagador(alunoId: string) {
  const aluno = await db.aluno.findUnique({
    where: { id: alunoId },
    select: {
      id: true,
      cpf: true,
      telefone: true,
      usuario: { select: { nome: true, email: true } },
      responsavel: true,
      clienteAsaas: true,
    },
  })
  if (!aluno) return { ok: false as const, motivo: "Aluno não encontrado." }

  const responsavel = aluno.responsavel?.responsavelFinanceiro ? aluno.responsavel : null
  const tipoPagador = responsavel ? ("RESPONSAVEL" as const) : ("ALUNO" as const)
  const cpfCnpj = somenteDigitos(responsavel?.cpf ?? aluno.cpf)
  if (!cpfCnpj || ![11, 14].includes(cpfCnpj.length)) {
    return {
      ok: false as const,
      motivo: responsavel
        ? "Informe um CPF válido para o responsável financeiro."
        : "Informe um CPF válido para o aluno.",
    }
  }

  return {
    ok: true as const,
    aluno,
    tipoPagador,
    dados: {
      name: responsavel?.nome ?? aluno.usuario.nome,
      cpfCnpj,
      email: responsavel?.email ?? aluno.usuario.email,
      mobilePhone: somenteDigitos(responsavel?.telefone ?? aluno.telefone),
      externalReference: referenciaCliente(aluno.id),
      notificationDisabled: true,
    },
  }
}

async function garantirClienteAsaas(alunoId: string) {
  const pagador = await obterPagador(alunoId)
  if (!pagador.ok) return pagador
  if (pagador.aluno.clienteAsaas) {
    return { ok: true as const, customerId: pagador.aluno.clienteAsaas.asaasCustomerId }
  }

  const encontrados = await listarClientesAsaas({
    externalReference: pagador.dados.externalReference,
    limit: 1,
  })
  const remoto = encontrados.data[0] ?? (await criarClienteAsaas(pagador.dados))

  const cliente = await db.clienteAsaas.upsert({
    where: { alunoId },
    create: {
      alunoId,
      asaasCustomerId: remoto.id,
      tipoPagador: pagador.tipoPagador,
    },
    update: {
      asaasCustomerId: remoto.id,
      tipoPagador: pagador.tipoPagador,
    },
  })
  return { ok: true as const, customerId: cliente.asaasCustomerId }
}

async function criarOuRecuperarCobrancaRemota(params: {
  customerId: string
  externalReference: string
  value: number
  dueDate: Date
  description: string
  pixAutomaticAuthorizationId?: string
}) {
  const encontradas = await listarCobrancasAsaas({
    externalReference: params.externalReference,
    limit: 1,
  })
  if (encontradas.data[0]) return encontradas.data[0]

  return criarCobrancaAsaas({
    customer: params.customerId,
    billingType: "PIX",
    value: params.value,
    dueDate: dataAsaas(params.dueDate),
    description: params.description,
    externalReference: params.externalReference,
    pixAutomaticAuthorizationId: params.pixAutomaticAuthorizationId,
  })
}

async function persistirCobrancaRemota(
  cobrancaId: string,
  remota: CobrancaRemotaAsaas,
  incluirQrCode: boolean,
) {
  const qrCode = incluirQrCode ? await obterQrCodePixAsaas(remota.id) : null
  return db.cobrancaAsaas.update({
    where: { id: cobrancaId },
    data: {
      asaasPaymentId: remota.id,
      status: remota.status === "RECEIVED" ? "RECEBIDA" : "PENDENTE",
      statusAsaas: remota.status,
      invoiceUrl: remota.invoiceUrl ?? null,
      pixCopiaECola: qrCode?.payload ?? null,
      qrCodeExpiraEm: dataValida(qrCode?.expirationDate),
      ultimoErro: null,
    },
  })
}

export async function gerarCobrancaPixMensal(params: { alunoId: string; mensalidadeId: string }) {
  const mensalidade = await db.mensalidade.findFirst({
    where: {
      id: params.mensalidadeId,
      alunoId: params.alunoId,
      aluno: { tipoCobrancaPix: "MENSAL" },
    },
    include: { cobrancaAsaas: true },
  })
  if (!mensalidade) return { ok: false as const, motivo: "Mensalidade não encontrada." }
  if (["PAGA", "ISENTA", "CANCELADA"].includes(mensalidade.status)) {
    return { ok: false as const, motivo: "Esta mensalidade não aceita uma nova cobrança." }
  }
  if (mensalidade.contratoPixAutomaticoId) {
    return { ok: false as const, motivo: "Mensalidade vinculada ao PIX Automático." }
  }

  const externalReference = referenciaMensalidade(mensalidade.id)
  const intencao = await db.cobrancaAsaas.upsert({
    where: { mensalidadeId: mensalidade.id },
    create: {
      mensalidadeId: mensalidade.id,
      tipo: "PIX_MENSAL",
      externalReference,
    },
    update: {},
  })

  try {
    const cliente = await garantirClienteAsaas(params.alunoId)
    if (!cliente.ok) return cliente
    const remota = await criarOuRecuperarCobrancaRemota({
      customerId: cliente.customerId,
      externalReference,
      value: Number(mensalidade.valor),
      dueDate: mensalidade.vencimento,
      description: descricaoMensalidade(mensalidade.competencia),
    })
    const cobranca = await persistirCobrancaRemota(intencao.id, remota, true)
    return { ok: true as const, cobranca }
  } catch (erro) {
    const motivo = mensagemErroAsaasSegura(erro)
    await db.cobrancaAsaas.update({
      where: { id: intencao.id },
      data: { status: "ERRO", ultimoErro: motivo },
    })
    return { ok: false as const, motivo }
  }
}

async function competenciaInicialDisponivel(alunoId: string) {
  const atual = chaveCompetencia()
  const mensalidade = await db.mensalidade.findUnique({
    where: { alunoId_competencia: { alunoId, competencia: atual } },
    select: { status: true },
  })
  return mensalidade && ["PAGA", "ISENTA", "CANCELADA"].includes(mensalidade.status)
    ? somarMesesCompetencia(atual, 1)
    : atual
}

async function prepararContratoPixAutomatico(params: { alunoId: string; autorId: string }) {
  const aluno = await db.aluno.findUnique({
    where: { id: params.alunoId },
    include: { plano: true },
  })
  if (!aluno?.plano) {
    return { ok: false as const, motivo: "Vincule um plano mensal ao aluno antes de habilitar." }
  }
  if (aluno.plano.periodicidade !== "MENSAL") {
    return { ok: false as const, motivo: "O PIX Automático semestral exige um plano mensal." }
  }
  const contratoAberto = await db.contratoPixAutomatico.findFirst({
    where: {
      alunoId: aluno.id,
      status: { in: ["CRIANDO", "PENDENTE_AUTORIZACAO", "ATIVO"] },
    },
    select: { id: true },
  })
  if (contratoAberto) {
    return { ok: false as const, motivo: "O aluno já possui um ciclo de PIX Automático." }
  }

  const competenciaInicial = await competenciaInicialDisponivel(aluno.id)
  const competencias = competenciasDoSemestre(competenciaInicial)
  const mensalidades: Mensalidade[] = []
  for (const competencia of competencias) {
    const resultado = await gerarMensalidade({
      alunoId: aluno.id,
      competencia,
      autorId: params.autorId,
    })
    if (!resultado.ok) return resultado
    if (["PAGA", "ISENTA", "CANCELADA"].includes(resultado.mensalidade.status)) {
      return {
        ok: false as const,
        motivo: `A competência ${competencia} já está finalizada e não pode compor o semestre.`,
      }
    }
    mensalidades.push(resultado.mensalidade)
  }

  const contratoRetomavel = await db.contratoPixAutomatico.findFirst({
    where: {
      alunoId: aluno.id,
      status: "ERRO",
      mensalidades: {
        some: { id: mensalidades[0].id },
        every: { id: { in: mensalidades.map((mensalidade) => mensalidade.id) } },
      },
    },
    orderBy: { atualizadoEm: "desc" },
  })
  const cobrancaExistente = await db.cobrancaAsaas.findFirst({
    where: { mensalidadeId: { in: mensalidades.map((mensalidade) => mensalidade.id) } },
    select: {
      id: true,
      contratoPixAutomaticoId: true,
      tipo: true,
      status: true,
      contratoPixAutomatico: { select: { status: true } },
    },
  })
  const podeSubstituirContratoTerminal =
    cobrancaExistente?.tipo === "PIX_AUTOMATICO_INICIAL" &&
    cobrancaExistente.status !== "RECEBIDA" &&
    cobrancaExistente.contratoPixAutomatico &&
    ["RECUSADO", "EXPIRADO", "CANCELADO"].includes(cobrancaExistente.contratoPixAutomatico.status)
  if (
    cobrancaExistente &&
    !podeSubstituirContratoTerminal &&
    (!contratoRetomavel ||
      cobrancaExistente.contratoPixAutomaticoId !== contratoRetomavel.id ||
      cobrancaExistente.tipo !== "PIX_AUTOMATICO_INICIAL")
  ) {
    return {
      ok: false as const,
      motivo: "Uma das mensalidades do semestre já possui cobrança emitida no Asaas.",
    }
  }

  const inicio = new Date()
  const fim = new Date(mensalidades[5].vencimento)
  fim.setUTCDate(fim.getUTCDate() + 1)

  const contrato = await db.$transaction(async (tx) => {
    const salvo = contratoRetomavel
      ? await tx.contratoPixAutomatico.update({
          where: { id: contratoRetomavel.id },
          data: {
            asaasAuthorizationId: null,
            asaasConciliationId: null,
            status: "CRIANDO",
            inicio,
            fim,
            valor: aluno.plano!.valor,
            pixCopiaECola: null,
            qrCodeExpiraEm: null,
            ultimoErro: null,
          },
        })
      : await tx.contratoPixAutomatico.create({
          data: {
            alunoId: aluno.id,
            inicio,
            fim,
            valor: aluno.plano!.valor,
          },
        })

    for (const [indice, mensalidade] of mensalidades.entries()) {
      await tx.mensalidade.update({
        where: { id: mensalidade.id },
        data: { contratoPixAutomaticoId: salvo.id, numeroCicloPix: indice + 1 },
      })
    }

    const primeira = mensalidades[0]
    await tx.cobrancaAsaas.upsert({
      where: { mensalidadeId: primeira.id },
      create: {
        mensalidadeId: primeira.id,
        contratoPixAutomaticoId: salvo.id,
        tipo: "PIX_AUTOMATICO_INICIAL",
        externalReference: referenciaCiclo(salvo.id, 1),
      },
      update: {
        contratoPixAutomaticoId: salvo.id,
        tipo: "PIX_AUTOMATICO_INICIAL",
        externalReference: referenciaCiclo(salvo.id, 1),
        status: "CRIANDO",
        asaasPaymentId: null,
        pixCopiaECola: null,
        ultimoErro: null,
      },
    })
    return salvo
  })

  return { ok: true as const, aluno, contrato, mensalidades }
}

async function criarOuRecuperarAutorizacao(params: {
  contratoId: string
  customerId: string
  inicio: Date
  fim: Date
  valor: number
}) {
  const contractId = `ecvo-${params.contratoId}`.slice(0, 35)
  const encontradas = await listarAutorizacoesPixAutomaticoAsaas({
    customerId: params.customerId,
    limit: 100,
  })
  const existente = encontradas.data.find((item) => item.contractId === contractId)
  if (existente) return existente

  return criarAutorizacaoPixAutomaticoAsaas({
    frequency: "MONTHLY",
    contractId,
    startDate: dataAsaas(params.inicio),
    finishDate: dataAsaas(params.fim),
    value: params.valor,
    description: "Semestralidade ECVO",
    customerId: params.customerId,
    paymentCreationMode: "MANUAL",
    retryPolicy: "NOT_ALLOWED",
    immediateQrCode: {
      ...(process.env.ASAAS_PIX_KEY ? { pixKey: process.env.ASAAS_PIX_KEY } : {}),
      expirationSeconds: EXPIRACAO_QR_AUTORIZACAO_SEGUNDOS,
      originalValue: params.valor,
      description: "Mensalidade 1 de 6",
    },
  })
}

export async function configurarTipoCobrancaPix(params: {
  alunoId: string
  tipoCobrancaPix: TipoCobrancaPix
  autorId: string
}) {
  if (params.tipoCobrancaPix === "MENSAL") {
    const aluno = await db.aluno.findUnique({
      where: { id: params.alunoId },
      include: {
        contratosPixAutomatico: {
          where: { status: { in: ["CRIANDO", "PENDENTE_AUTORIZACAO", "ATIVO"] } },
          take: 1,
        },
      },
    })
    if (!aluno) return { ok: false as const, motivo: "Aluno não encontrado." }
    if (aluno.contratosPixAutomatico.length > 0) {
      return {
        ok: false as const,
        motivo: "Cancele ou conclua o PIX Automático antes de voltar à cobrança mensal.",
      }
    }
    await db.$transaction(async (tx) => {
      await tx.aluno.update({ where: { id: aluno.id }, data: { tipoCobrancaPix: "MENSAL" } })
      await registrarLog(
        {
          autorId: params.autorId,
          acao: "PAGAMENTO",
          entidade: "Aluno",
          entidadeId: aluno.id,
          valorAntigo: { tipoCobrancaPix: aluno.tipoCobrancaPix },
          valorNovo: { tipoCobrancaPix: "MENSAL" },
        },
        tx,
      )
    })
    return { ok: true as const }
  }

  const preparado = await prepararContratoPixAutomatico(params)
  if (!preparado.ok) return preparado

  try {
    const cliente = await garantirClienteAsaas(params.alunoId)
    if (!cliente.ok) return cliente
    const autorizacao = await criarOuRecuperarAutorizacao({
      contratoId: preparado.contrato.id,
      customerId: cliente.customerId,
      inicio: preparado.contrato.inicio,
      fim: preparado.contrato.fim,
      valor: Number(preparado.contrato.valor),
    })
    const primeira = preparado.mensalidades[0]
    const resultado = await db.$transaction(async (tx) => {
      const contrato = await tx.contratoPixAutomatico.update({
        where: { id: preparado.contrato.id },
        data: {
          asaasAuthorizationId: autorizacao.id,
          asaasConciliationId: autorizacao.immediateQrCode.conciliationIdentifier,
          status: statusContrato(autorizacao),
          pixCopiaECola: autorizacao.payload ?? null,
          qrCodeExpiraEm: dataValida(autorizacao.immediateQrCode.expirationDate),
          ultimoErro: null,
        },
      })
      await tx.cobrancaAsaas.update({
        where: { mensalidadeId: primeira.id },
        data: {
          status: "PENDENTE",
          pixCopiaECola: autorizacao.payload ?? null,
          qrCodeExpiraEm: dataValida(autorizacao.immediateQrCode.expirationDate),
        },
      })
      await tx.aluno.update({
        where: { id: params.alunoId },
        data: { tipoCobrancaPix: "AUTOMATICO_SEMESTRAL" },
      })
      await registrarLog(
        {
          autorId: params.autorId,
          acao: "PAGAMENTO",
          entidade: "ContratoPixAutomatico",
          entidadeId: contrato.id,
          valorNovo: {
            alunoId: params.alunoId,
            tipoCobrancaPix: "AUTOMATICO_SEMESTRAL",
            totalCiclos: TOTAL_CICLOS_PIX_AUTOMATICO,
            valorMensal: Number(contrato.valor),
            inicio: contrato.inicio.toISOString(),
            fim: contrato.fim.toISOString(),
          },
        },
        tx,
      )
      return contrato
    })
    return { ok: true as const, contrato: resultado }
  } catch (erro) {
    const motivo = mensagemErroAsaasSegura(erro)
    await db.contratoPixAutomatico.update({
      where: { id: preparado.contrato.id },
      data: { status: "ERRO", ultimoErro: motivo },
    })
    return { ok: false as const, motivo }
  }
}

function statusContrato(autorizacao: AutorizacaoPixAutomaticoAsaas): StatusContratoPixAutomatico {
  const mapa: Record<AutorizacaoPixAutomaticoAsaas["status"], StatusContratoPixAutomatico> = {
    CREATED: "PENDENTE_AUTORIZACAO",
    ACTIVE: "ATIVO",
    CANCELLED: "CANCELADO",
    REFUSED: "RECUSADO",
    EXPIRED: "EXPIRADO",
  }
  return mapa[autorizacao.status]
}

export async function processarCobrancasPixAutomaticoPendentes(hoje = new Date()) {
  const mensalidades = await db.mensalidade.findMany({
    where: {
      numeroCicloPix: { gte: 2, lte: TOTAL_CICLOS_PIX_AUTOMATICO },
      vencimento: {
        gte: new Date(hoje.getTime() + 2 * 86_400_000),
        lte: new Date(hoje.getTime() + 14 * 86_400_000),
      },
      contratoPixAutomatico: { status: "ATIVO", asaasAuthorizationId: { not: null } },
      status: { in: ["EM_ABERTO", "VENCIDA"] },
    },
    include: {
      cobrancaAsaas: true,
      contratoPixAutomatico: { include: { aluno: { include: { clienteAsaas: true } } } },
    },
    orderBy: { vencimento: "asc" },
  })

  let criadas = 0
  const falhas: Array<{ mensalidadeId: string; motivo: string }> = []
  for (const mensalidade of mensalidades) {
    if (!estaNaJanelaDeCriacaoPixAutomatico(mensalidade.vencimento, hoje)) continue
    const contrato = mensalidade.contratoPixAutomatico
    const customerId = contrato?.aluno.clienteAsaas?.asaasCustomerId
    const authorizationId = contrato?.asaasAuthorizationId
    const numero = mensalidade.numeroCicloPix
    if (!contrato || !customerId || !authorizationId || !numero) continue

    const externalReference = referenciaCiclo(contrato.id, numero)
    const intencao = await db.cobrancaAsaas.upsert({
      where: { mensalidadeId: mensalidade.id },
      create: {
        mensalidadeId: mensalidade.id,
        contratoPixAutomaticoId: contrato.id,
        tipo: "PIX_AUTOMATICO_RECORRENTE",
        externalReference,
      },
      update: {},
    })
    if (intencao.asaasPaymentId) continue

    try {
      const remota = await criarOuRecuperarCobrancaRemota({
        customerId,
        externalReference,
        value: Number(mensalidade.valor),
        dueDate: mensalidade.vencimento,
        description: `Mensalidade ${numero} de ${TOTAL_CICLOS_PIX_AUTOMATICO}`,
        pixAutomaticAuthorizationId: authorizationId,
      })
      await persistirCobrancaRemota(intencao.id, remota, false)
      criadas++
    } catch (erro) {
      const motivo = mensagemErroAsaasSegura(erro)
      await db.cobrancaAsaas.update({
        where: { id: intencao.id },
        data: { status: "ERRO", ultimoErro: motivo },
      })
      falhas.push({ mensalidadeId: mensalidade.id, motivo })
    }
  }

  return { ok: falhas.length === 0, analisadas: mensalidades.length, criadas, falhas }
}

export async function reconciliarPendenciasAsaas() {
  const cobrancas = await db.cobrancaAsaas.findMany({
    where: { status: { in: ["CRIANDO", "PENDENTE", "VENCIDA", "ERRO"] } },
    orderBy: { atualizadoEm: "asc" },
    take: 100,
  })
  let pagamentosAtualizados = 0
  for (const cobranca of cobrancas) {
    const remota = (
      await listarCobrancasAsaas({ externalReference: cobranca.externalReference, limit: 1 })
    ).data[0]
    if (!remota) continue
    const evento = eventoPagamentoParaStatusAsaas(remota.status)
    if (evento) {
      await processarWebhookAsaas({
        id: `reconcile:${remota.id}:${remota.status}`,
        event: evento,
        payment: {
          id: remota.id,
          externalReference: cobranca.externalReference,
          status: remota.status,
          value: remota.value,
        },
      })
    } else {
      await db.cobrancaAsaas.update({
        where: { id: cobranca.id },
        data: { asaasPaymentId: remota.id, statusAsaas: remota.status, ultimoErro: null },
      })
    }
    pagamentosAtualizados++
  }

  const contratos = await db.contratoPixAutomatico.findMany({
    where: {
      status: { in: ["PENDENTE_AUTORIZACAO", "ATIVO"] },
      asaasAuthorizationId: { not: null },
    },
    include: { aluno: { include: { clienteAsaas: true } } },
    orderBy: { atualizadoEm: "asc" },
    take: 100,
  })
  let autorizacoesAtualizadas = 0
  const eventosAutorizacao: Record<AutorizacaoPixAutomaticoAsaas["status"], string> = {
    CREATED: "PIX_AUTOMATIC_RECURRING_AUTHORIZATION_CREATED",
    ACTIVE: "PIX_AUTOMATIC_RECURRING_AUTHORIZATION_ACTIVATED",
    CANCELLED: "PIX_AUTOMATIC_RECURRING_AUTHORIZATION_CANCELLED",
    REFUSED: "PIX_AUTOMATIC_RECURRING_AUTHORIZATION_REFUSED",
    EXPIRED: "PIX_AUTOMATIC_RECURRING_AUTHORIZATION_EXPIRED",
  }
  for (const contrato of contratos) {
    const customerId = contrato.aluno.clienteAsaas?.asaasCustomerId
    if (!customerId || !contrato.asaasAuthorizationId) continue
    const remota = (
      await listarAutorizacoesPixAutomaticoAsaas({ customerId, limit: 100 })
    ).data.find((item) => item.id === contrato.asaasAuthorizationId)
    if (!remota) continue
    await processarWebhookAsaas({
      id: `reconcile:${remota.id}:${remota.status}`,
      event: eventosAutorizacao[remota.status],
      pixAutomaticAuthorization: remota.id,
    })
    autorizacoesAtualizadas++
  }

  return { pagamentosAnalisados: cobrancas.length, pagamentosAtualizados, autorizacoesAtualizadas }
}

function statusCobrancaPorEvento(evento: string) {
  if (evento === "PAYMENT_RECEIVED" || evento === "PAYMENT_CONFIRMED") return "RECEBIDA" as const
  if (evento === "PAYMENT_OVERDUE") return "VENCIDA" as const
  if (evento === "PAYMENT_DELETED") return "CANCELADA" as const
  if (evento === "PAYMENT_REFUNDED" || evento === "PAYMENT_PARTIALLY_REFUNDED") {
    return "ESTORNADA" as const
  }
  if (evento.includes("REFUSED")) return "RECUSADA" as const
  return null
}

async function baixarMensalidadePeloAsaas(
  tx: Prisma.TransactionClient,
  cobranca: { id: string; mensalidadeId: string; externalReference: string },
  webhook: WebhookAsaas,
) {
  const mensalidade = await tx.mensalidade.findUnique({
    where: { id: cobranca.mensalidadeId },
    include: { aluno: { select: { usuarioId: true } } },
  })
  if (!mensalidade) return
  if (
    webhook.payment?.externalReference &&
    webhook.payment.externalReference !== cobranca.externalReference
  ) {
    await tx.cobrancaAsaas.update({
      where: { id: cobranca.id },
      data: { status: "ERRO", ultimoErro: "Referência externa divergente no webhook." },
    })
    return
  }
  if (
    webhook.payment?.value !== undefined &&
    Math.abs(webhook.payment.value - Number(mensalidade.valor)) > 0.001
  ) {
    await tx.cobrancaAsaas.update({
      where: { id: cobranca.id },
      data: { status: "ERRO", ultimoErro: "Valor divergente no webhook." },
    })
    return
  }

  const alterada = await tx.mensalidade.updateMany({
    where: { id: mensalidade.id, status: { in: ["EM_ABERTO", "VENCIDA"] } },
    data: { status: "PAGA", pagoEm: new Date(), formaPagamento: "PIX_ASAAS" },
  })
  if (alterada.count === 0) return

  await registrarLog(
    {
      autorId: null,
      acao: "PAGAMENTO",
      entidade: "Mensalidade",
      entidadeId: mensalidade.id,
      valorAntigo: { status: mensalidade.status },
      valorNovo: { status: "PAGA", formaPagamento: "PIX_ASAAS", evento: webhook.id },
    },
    tx,
  )
  await tx.notificacao.create({
    data: {
      usuarioId: mensalidade.aluno.usuarioId,
      tipo: "FINANCEIRO",
      titulo: "Pagamento confirmado",
      mensagem: `${mensalidade.competencia}: pagamento via PIX confirmado.`,
    },
  })
  await sincronizarStatusFinanceiroAluno(tx, mensalidade.alunoId)
}

export async function processarWebhookAsaas(webhook: WebhookAsaas) {
  const authorizationId = idAutorizacaoDoWebhook(webhook)
  return db.$transaction(async (tx) => {
    const inserido = await tx.eventoWebhookAsaas.createMany({
      data: {
        asaasEventId: webhook.id,
        evento: webhook.event,
        asaasPaymentId: webhook.payment?.id ?? null,
        asaasAuthorizationId: authorizationId,
      },
      skipDuplicates: true,
    })
    if (inserido.count === 0) return { ok: true as const, duplicado: true }

    if (webhook.payment) {
      const cobranca = await tx.cobrancaAsaas.findFirst({
        where: {
          OR: [
            { asaasPaymentId: webhook.payment.id },
            ...(webhook.payment.externalReference
              ? [{ externalReference: webhook.payment.externalReference }]
              : []),
          ],
        },
        select: { id: true, mensalidadeId: true, externalReference: true, status: true },
      })
      if (cobranca) {
        const status = statusCobrancaPorEvento(webhook.event)
        await tx.cobrancaAsaas.update({
          where: { id: cobranca.id },
          data: {
            asaasPaymentId: webhook.payment.id,
            status: proximoStatusCobrancaAsaas(cobranca.status, status),
            statusAsaas: webhook.payment.status ?? null,
            ultimoEventoAsaas: webhook.event,
          },
        })
        if (webhook.event === "PAYMENT_RECEIVED" || webhook.event === "PAYMENT_CONFIRMED") {
          await baixarMensalidadePeloAsaas(tx, cobranca, webhook)
        }
      }
    }

    if (authorizationId) {
      const status = statusContratoPorEvento(webhook.event)
      if (status) {
        const contrato = await tx.contratoPixAutomatico.findUnique({
          where: { asaasAuthorizationId: authorizationId },
          include: {
            mensalidades: {
              where: { numeroCicloPix: 1 },
              include: { cobrancaAsaas: true },
            },
          },
        })
        if (contrato) {
          const statusAplicado = proximoStatusContratoPixAutomatico(contrato.status, status)
          await tx.contratoPixAutomatico.update({
            where: { id: contrato.id },
            data: { status: statusAplicado },
          })
          const primeira = contrato.mensalidades[0]
          if (statusAplicado === "ATIVO" && primeira?.cobrancaAsaas) {
            const cobranca = {
              id: primeira.cobrancaAsaas.id,
              mensalidadeId: primeira.id,
              externalReference: primeira.cobrancaAsaas.externalReference,
            }
            await tx.cobrancaAsaas.update({
              where: { id: cobranca.id },
              data: {
                asaasPaymentId: webhook.payment?.id ?? undefined,
                status: "RECEBIDA",
                ultimoEventoAsaas: webhook.event,
              },
            })
            await baixarMensalidadePeloAsaas(tx, cobranca, webhook)
          }
        }
      }
    }

    const contratoId = authorizationId
      ? (
          await tx.contratoPixAutomatico.findUnique({
            where: { asaasAuthorizationId: authorizationId },
            select: { id: true },
          })
        )?.id
      : null
    if (contratoId) {
      const recebidas = await tx.cobrancaAsaas.count({
        where: { contratoPixAutomaticoId: contratoId, status: "RECEBIDA" },
      })
      if (recebidas === TOTAL_CICLOS_PIX_AUTOMATICO) {
        await tx.contratoPixAutomatico.update({
          where: { id: contratoId },
          data: { status: "CONCLUIDO" },
        })
      }
    }

    return { ok: true as const, duplicado: false }
  })
}

function statusContratoPorEvento(evento: string): StatusContratoPixAutomatico | null {
  const mapa: Record<string, StatusContratoPixAutomatico> = {
    PIX_AUTOMATIC_RECURRING_AUTHORIZATION_CREATED: "PENDENTE_AUTORIZACAO",
    PIX_AUTOMATIC_RECURRING_AUTHORIZATION_ACTIVATED: "ATIVO",
    PIX_AUTOMATIC_RECURRING_AUTHORIZATION_CANCELLED: "CANCELADO",
    PIX_AUTOMATIC_RECURRING_AUTHORIZATION_REFUSED: "RECUSADO",
    PIX_AUTOMATIC_RECURRING_AUTHORIZATION_EXPIRED: "EXPIRADO",
  }
  return mapa[evento] ?? null
}

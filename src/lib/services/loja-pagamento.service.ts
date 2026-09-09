import "server-only"
import { Prisma, type StatusCobrancaAsaas, type StatusPedidoLoja } from "@prisma/client"
import {
  type CobrancaAsaas as CobrancaRemotaAsaas,
  criarCobrancaAsaas,
  listarCobrancasAsaas,
  obterQrCodePixAsaas,
  type SplitCobrancaAsaas,
} from "@/lib/asaas/client"
import { interpretarDataAsaas } from "@/lib/asaas/datas"
import { mensagemErroAsaasSegura } from "@/lib/asaas/seguranca"
import { db } from "@/lib/db"
import { registrarLog } from "@/lib/services/auditoria.service"
import { proximoStatusSplitAsaas, statusLocalSplitAsaas } from "@/lib/services/split-asaas.service"
import { formatarDataInput } from "@/lib/utils/datas"
import type { WebhookAsaas } from "@/lib/validations/asaas"

type SplitLojaPersistido = {
  id: string
  walletIdSnapshot: string
  percentualSplitSnapshot: Prisma.Decimal
  externalReference: string
  status: import("@prisma/client").StatusSplitPagamentoAsaas
}

export function payloadSplitLojaAsaas(split: SplitLojaPersistido) {
  return [
    {
      walletId: split.walletIdSnapshot,
      percentualValue: Number(split.percentualSplitSnapshot),
      externalReference: split.externalReference,
      description: "Repasse integral líquido da ECVO Loja",
    },
  ]
}

function splitRemotoCompativel(local: SplitLojaPersistido, remoto: SplitCobrancaAsaas) {
  return (
    local.walletIdSnapshot === remoto.walletId &&
    Math.abs(Number(local.percentualSplitSnapshot) - Number(remoto.percentualValue)) < 0.001
  )
}

export async function persistirSplitLojaRemoto(
  tx: Prisma.TransactionClient,
  local: SplitLojaPersistido,
  remota: Pick<CobrancaRemotaAsaas, "split">,
) {
  const remoto = (remota.split ?? []).find(
    (item) =>
      item.externalReference === local.externalReference || splitRemotoCompativel(local, item),
  )
  if (!remoto || !splitRemotoCompativel(local, remoto)) {
    await tx.splitLojaAsaas.update({
      where: { id: local.id },
      data: {
        status: "ERRO",
        motivo: "Split percentual ausente ou divergente na resposta do Asaas.",
      },
    })
    return {
      ok: false as const,
      motivo: "A cobrança não confirmou o repasse integral à wallet da loja.",
    }
  }
  await tx.splitLojaAsaas.update({
    where: { id: local.id },
    data: {
      asaasSplitId: remoto.id,
      status: proximoStatusSplitAsaas(local.status, statusLocalSplitAsaas(remoto.status)),
      statusAsaas: remoto.status,
      motivo: remoto.refusalReason ?? remoto.cancellationReason ?? null,
    },
  })
  return { ok: true as const }
}

async function prepararCobranca(params: {
  pedidoId: string
  asaasCustomerId: string
  vencimento: Date
  autorId: string
}) {
  return db.$transaction(async (tx) => {
    const [pedido, conta, ativa] = await Promise.all([
      tx.pedidoLoja.findUnique({ where: { id: params.pedidoId } }),
      tx.contaAsaasLoja.findUnique({ where: { id: "principal" } }),
      tx.cobrancaLojaAsaas.findFirst({
        where: { pedidoId: params.pedidoId, ativa: true },
        include: { split: true },
      }),
    ])
    if (!pedido) return { ok: false as const, motivo: "Pedido da loja não encontrado." }
    if (conta?.status !== "HABILITADA" || !conta.walletId) {
      return {
        ok: false as const,
        motivo: "A wallet da loja precisa estar aprovada antes de criar cobranças.",
      }
    }
    if (["PAGO", "CANCELADO", "ESTORNADO"].includes(pedido.status)) {
      return { ok: false as const, motivo: "O estado atual do pedido não permite nova cobrança." }
    }
    if (ativa) {
      if (!ativa.split) {
        return {
          ok: false as const,
          motivo: "A cobrança ativa da loja está sem o split obrigatório e requer conciliação.",
        }
      }
      return { ok: true as const, pedido, cobranca: ativa, split: ativa.split }
    }

    const ultima = await tx.cobrancaLojaAsaas.findFirst({
      where: { pedidoId: pedido.id },
      orderBy: { geracao: "desc" },
      select: { geracao: true },
    })
    const geracao = (ultima?.geracao ?? 0) + 1
    const externalReference = `loja:pedido:${pedido.id}:tentativa:${geracao}`
    const cobranca = await tx.cobrancaLojaAsaas.create({
      data: {
        pedidoId: pedido.id,
        geracao,
        valor: pedido.valorTotal,
        asaasCustomerId: params.asaasCustomerId,
        externalReference,
        vencimentoAsaas: params.vencimento,
      },
    })
    const split = await tx.splitLojaAsaas.create({
      data: {
        cobrancaId: cobranca.id,
        contaAsaasLojaId: conta.id,
        walletIdSnapshot: conta.walletId,
        percentualSplitSnapshot: new Prisma.Decimal(100),
        externalReference: `${externalReference}:split:1`,
      },
    })
    await tx.pedidoLoja.update({
      where: { id: pedido.id },
      data: { status: "AGUARDANDO_PAGAMENTO" },
    })
    await registrarLog(
      {
        autorId: params.autorId,
        acao: "VENDA_LOJA",
        entidade: "CobrancaLojaAsaas",
        entidadeId: cobranca.id,
        valorNovo: {
          pedidoId: pedido.id,
          geracao,
          valor: Number(pedido.valorTotal),
          splitPercentual: 100,
        },
      },
      tx,
    )
    return { ok: true as const, pedido, cobranca, split }
  })
}

function cobrancaRemotaCompativel(
  local: { asaasCustomerId: string | null; externalReference: string; valor: Prisma.Decimal },
  remota: CobrancaRemotaAsaas,
) {
  return (
    remota.customer === local.asaasCustomerId &&
    remota.externalReference === local.externalReference &&
    Math.abs(remota.value - Number(local.valor)) < 0.001 &&
    remota.billingType === "PIX"
  )
}

export async function criarCobrancaPedidoLojaAsaas(params: {
  pedidoId: string
  asaasCustomerId: string
  vencimento: Date
  autorId: string
}) {
  const autor = await db.usuario.findUnique({
    where: { id: params.autorId },
    select: { ativo: true, papel: true },
  })
  if (!autor?.ativo || !["LOJA", "GESTOR"].includes(autor.papel)) {
    return { ok: false as const, motivo: "Usuário não autorizado para operar a loja." }
  }
  const preparada = await prepararCobranca(params)
  if (!preparada.ok) return preparada
  const { pedido, cobranca, split } = preparada

  try {
    const lista = await listarCobrancasAsaas({ externalReference: cobranca.externalReference })
    if (lista.data.length > 1) {
      throw new Error("Mais de uma cobrança Asaas corresponde à referência da loja.")
    }
    const remota =
      lista.data[0] ??
      (await criarCobrancaAsaas({
        customer: params.asaasCustomerId,
        billingType: "PIX",
        value: Number(cobranca.valor),
        dueDate: formatarDataInput(params.vencimento),
        description: pedido.descricao,
        externalReference: cobranca.externalReference,
        split: payloadSplitLojaAsaas(split),
      }))

    if (!cobrancaRemotaCompativel(cobranca, remota)) {
      throw new Error("A cobrança retornada pelo Asaas diverge da intenção da loja.")
    }
    const persistida = await db.$transaction(async (tx) => {
      const resultadoSplit = await persistirSplitLojaRemoto(tx, split, remota)
      if (!resultadoSplit.ok) throw new Error(resultadoSplit.motivo)
      return tx.cobrancaLojaAsaas.update({
        where: { id: cobranca.id },
        data: {
          asaasPaymentId: remota.id,
          status: remota.status === "PENDING" ? "PENDENTE" : "ERRO",
          statusAsaas: remota.status,
          invoiceUrl: remota.invoiceUrl,
          ultimoErro: remota.status === "PENDING" ? null : "Estado inicial inesperado no Asaas.",
        },
      })
    })
    if (persistida.status !== "PENDENTE") {
      return { ok: false as const, motivo: "A cobrança não ficou pendente no Asaas." }
    }

    const qr = await obterQrCodePixAsaas(remota.id)
    const atualizada = await db.cobrancaLojaAsaas.update({
      where: { id: cobranca.id },
      data: {
        pixCopiaECola: qr.payload,
        qrCodeExpiraEm: interpretarDataAsaas(qr.expirationDate),
      },
    })
    return { ok: true as const, cobranca: atualizada }
  } catch (erro) {
    const motivo = mensagemErroAsaasSegura(erro)
    await db.$transaction(async (tx) => {
      await tx.cobrancaLojaAsaas.update({
        where: { id: cobranca.id },
        data: { status: "ERRO", ultimoErro: motivo },
      })
      await tx.splitLojaAsaas.update({
        where: { id: split.id },
        data: { status: "ERRO", motivo },
      })
      await tx.pedidoLoja.update({
        where: { id: pedido.id },
        data: { status: "CONCILIACAO" },
      })
    })
    return { ok: false as const, motivo }
  }
}

function statusCobrancaLojaPorEvento(evento: string): StatusCobrancaAsaas | null {
  if (["PAYMENT_CREATED", "PAYMENT_UPDATED"].includes(evento)) return "PENDENTE"
  if (["PAYMENT_RECEIVED", "PAYMENT_CONFIRMED"].includes(evento)) return "RECEBIDA"
  if (evento === "PAYMENT_OVERDUE") return "VENCIDA"
  if (evento === "PAYMENT_DELETED") return "CANCELADA"
  if (evento === "PAYMENT_REFUNDED") return "ESTORNADA"
  if (evento === "PAYMENT_PARTIALLY_REFUNDED") return "ERRO"
  return null
}

function statusPedidoPorCobranca(status: StatusCobrancaAsaas, evento: string): StatusPedidoLoja {
  if (evento === "PAYMENT_PARTIALLY_REFUNDED") return "CONCILIACAO"
  if (status === "RECEBIDA") return "PAGO"
  if (status === "ESTORNADA") return "ESTORNADO"
  if (status === "CANCELADA") return "CANCELADO"
  if (status === "ERRO") return "CONCILIACAO"
  return "AGUARDANDO_PAGAMENTO"
}

export async function reconciliarSplitLojaWebhook(
  tx: Prisma.TransactionClient,
  params: {
    evento: string
    splitId?: string | null
    splits?: SplitCobrancaAsaas[]
    asaasPaymentId?: string | null
  },
) {
  let local = params.splitId
    ? await tx.splitLojaAsaas.findUnique({ where: { asaasSplitId: params.splitId } })
    : null
  const remoto = (params.splits ?? []).find((item) =>
    local
      ? item.id === local.asaasSplitId || item.externalReference === local.externalReference
      : Boolean(item.externalReference?.startsWith("loja:pedido:")),
  )
  if (!local && remoto) {
    local = await tx.splitLojaAsaas.findFirst({
      where: {
        OR: [
          ...(remoto.id ? [{ asaasSplitId: remoto.id }] : []),
          ...(remoto.externalReference ? [{ externalReference: remoto.externalReference }] : []),
        ],
      },
    })
  }
  if (!local && params.asaasPaymentId) {
    local = await tx.splitLojaAsaas.findFirst({
      where: { cobranca: { asaasPaymentId: params.asaasPaymentId } },
    })
  }
  if (!local) return false

  const statusRecebido = remoto
    ? statusLocalSplitAsaas(remoto.status)
    : params.evento === "PAYMENT_SPLIT_DONE"
      ? "CONCLUIDO"
      : params.evento === "PAYMENT_SPLIT_CANCELLED"
        ? "CANCELADO"
        : params.evento === "PAYMENT_SPLIT_DIVERGENCE_BLOCK"
          ? "BLOQUEADO"
          : "PENDENTE"
  await tx.splitLojaAsaas.update({
    where: { id: local.id },
    data: {
      asaasSplitId: remoto?.id ?? params.splitId ?? local.asaasSplitId,
      status: proximoStatusSplitAsaas(local.status, statusRecebido),
      statusAsaas: remoto?.status ?? local.statusAsaas,
      motivo: remoto?.refusalReason ?? remoto?.cancellationReason ?? local.motivo,
      ultimoEventoAsaas: params.evento,
    },
  })
  return true
}

export async function aplicarWebhookPagamentoLoja(
  tx: Prisma.TransactionClient,
  webhook: WebhookAsaas,
) {
  if (!webhook.payment) return false
  const cobranca = await tx.cobrancaLojaAsaas.findFirst({
    where: {
      OR: [
        { asaasPaymentId: webhook.payment.id },
        ...(webhook.payment.externalReference
          ? [{ externalReference: webhook.payment.externalReference }]
          : []),
      ],
    },
  })
  if (!cobranca) return false

  const divergencia =
    (webhook.payment.externalReference &&
      webhook.payment.externalReference !== cobranca.externalReference) ||
    (webhook.payment.value !== undefined &&
      Math.abs(webhook.payment.value - Number(cobranca.valor)) >= 0.001)
  if (divergencia) {
    await tx.cobrancaLojaAsaas.update({
      where: { id: cobranca.id },
      data: {
        status: "ERRO",
        ultimoEventoAsaas: webhook.event,
        ultimoErro: "Evento Asaas divergente da cobrança da loja.",
      },
    })
    await tx.pedidoLoja.update({
      where: { id: cobranca.pedidoId },
      data: { status: "CONCILIACAO" },
    })
    return true
  }

  if (webhook.payment.split || webhook.event.startsWith("PAYMENT_SPLIT_")) {
    await reconciliarSplitLojaWebhook(tx, {
      evento: webhook.event,
      splitId: webhook.additionalInfo?.splitId,
      splits: webhook.payment.split,
      asaasPaymentId: webhook.payment.id,
    })
  }
  const status = statusCobrancaLojaPorEvento(webhook.event)
  if (!status) return true
  const pedidoStatus = statusPedidoPorCobranca(status, webhook.event)
  await tx.cobrancaLojaAsaas.update({
    where: { id: cobranca.id },
    data: {
      asaasPaymentId: webhook.payment.id,
      status,
      ativa: !["RECEBIDA", "CANCELADA", "ESTORNADA", "ERRO"].includes(status),
      statusAsaas: webhook.payment.status ?? null,
      recebidaEmAsaas:
        status === "RECEBIDA"
          ? (interpretarDataAsaas(webhook.payment.paymentDate ?? webhook.dateCreated) ?? new Date())
          : undefined,
      ultimoEventoAsaas: webhook.event,
      ultimoErro:
        webhook.event === "PAYMENT_PARTIALLY_REFUNDED"
          ? "Estorno parcial requer conciliação da loja."
          : null,
    },
  })
  await tx.pedidoLoja.update({
    where: { id: cobranca.pedidoId },
    data: { status: pedidoStatus },
  })
  await registrarLog(
    {
      autorId: null,
      acao: "VENDA_LOJA",
      entidade: "CobrancaLojaAsaas",
      entidadeId: cobranca.id,
      valorAntigo: { status: cobranca.status },
      valorNovo: { status, pedidoStatus, evento: webhook.event },
      justificativa: `Evento Asaas ${webhook.id}.`,
    },
    tx,
  )
  return true
}

export async function obterResumoLoja() {
  const [pedidos, cobrancas, recentes] = await Promise.all([
    db.pedidoLoja.groupBy({
      by: ["status"],
      _count: { _all: true },
      _sum: { valorTotal: true },
    }),
    db.cobrancaLojaAsaas.aggregate({
      where: { status: "RECEBIDA" },
      _sum: { valor: true },
    }),
    db.pedidoLoja.findMany({
      orderBy: { criadoEm: "desc" },
      take: 8,
      include: {
        cobrancas: {
          orderBy: { geracao: "desc" },
          take: 1,
          include: { split: true },
        },
      },
    }),
  ])
  return {
    faturamentoRecebido: Number(cobrancas._sum.valor ?? 0),
    pedidos: pedidos.reduce((total, item) => total + item._count._all, 0),
    pedidosPendentes: pedidos
      .filter((item) => ["RASCUNHO", "AGUARDANDO_PAGAMENTO", "CONCILIACAO"].includes(item.status))
      .reduce((total, item) => total + item._count._all, 0),
    recentes,
  }
}

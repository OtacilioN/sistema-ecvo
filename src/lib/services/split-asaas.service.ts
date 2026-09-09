import "server-only"

import { Prisma, type StatusSplitPagamentoAsaas } from "@prisma/client"
import type { CobrancaAsaas as CobrancaRemotaAsaas, SplitCobrancaAsaas } from "@/lib/asaas/client"
import {
  calcularRepasseFinanceiro,
  lerRepasseSnapshotMensalidade,
} from "@/lib/services/financeiro.service"

type AlvoCobranca =
  | { cobrancaAsaasId: string; cobrancaMatriculaAsaasId?: never }
  | { cobrancaAsaasId?: never; cobrancaMatriculaAsaasId: string }

type SplitPersistido = {
  id: string
  walletIdSnapshot: string
  valorFixoSnapshot: Prisma.Decimal
  externalReference: string
  status?: StatusSplitPagamentoAsaas
}

export function statusLocalSplitAsaas(status?: string | null): StatusSplitPagamentoAsaas {
  if (status === "PENDING") return "PENDENTE"
  if (status === "AWAITING_CREDIT") return "AGUARDANDO_CREDITO"
  if (status === "PROCESSING" || status === "PROCESSING_REFUND") return "PROCESSANDO"
  if (status === "DONE") return "CONCLUIDO"
  if (status === "BLOCKED_BY_VALUE_DIVERGENCE") return "BLOQUEADO"
  if (status === "CANCELLED") return "CANCELADO"
  if (status === "REFUSED") return "RECUSADO"
  if (status === "REFUNDED") return "ESTORNADO"
  return "ERRO"
}

export function proximoStatusSplitAsaas(
  atual: StatusSplitPagamentoAsaas | undefined,
  recebido: StatusSplitPagamentoAsaas,
) {
  if (!atual || atual === "PREPARADO" || atual === "ERRO") return recebido
  if (recebido === "ERRO") return atual
  if (atual === "ESTORNADO") return atual
  if (recebido === "ESTORNADO") return recebido
  if (atual === "CONCLUIDO") return atual
  if (recebido === "CONCLUIDO") return recebido
  if (
    ["CANCELADO", "RECUSADO"].includes(atual) &&
    ["PENDENTE", "AGUARDANDO_CREDITO", "PROCESSANDO", "BLOQUEADO"].includes(recebido)
  ) {
    return atual
  }
  return recebido
}

export function payloadSplitAsaas(splits?: SplitPersistido[]):
  | Array<{
      walletId: string
      fixedValue: number
      externalReference: string
      description: string
    }>
  | undefined {
  if (!splits?.length) return undefined
  return splits.map((split) => ({
    walletId: split.walletIdSnapshot,
    fixedValue: Number(split.valorFixoSnapshot),
    externalReference: split.externalReference,
    description: "Repasse automático de professor ECVO",
  }))
}

export async function prepararSplitsPagamento(
  tx: Prisma.TransactionClient,
  params: AlvoCobranca & {
    repasseSnapshot: Prisma.JsonValue | null
    valorCobranca: Prisma.Decimal | number
    externalReferenceCobranca: string
  },
) {
  const where =
    "cobrancaAsaasId" in params
      ? { cobrancaAsaasId: params.cobrancaAsaasId }
      : { cobrancaMatriculaAsaasId: params.cobrancaMatriculaAsaasId }
  const existentes = await tx.splitPagamentoAsaas.findMany({ where, orderBy: { criadoEm: "asc" } })
  if (existentes.length > 0) return existentes

  const itens = lerRepasseSnapshotMensalidade(params.repasseSnapshot).filter(
    (item) => !item.plataformaExterna && item.valorRepasseProfessor,
  )
  if (itens.length === 0) return []
  const repasse = calcularRepasseFinanceiro({
    valorRecebido: Number(params.valorCobranca),
    politica: "MENSALIDADE_INTERNA",
    itens: itens.map((item, indice) => ({
      professorId: item.professorId ?? `pendencia:${indice}`,
      professorNome: item.professorNome,
      modalidadeId: item.modalidadeId,
      modalidadeNome: item.modalidadeNome,
      valorBase: item.valorBase,
      valorRepasseProfessor: item.valorRepasseProfessor,
    })),
  })
  const professorIds = Array.from(
    new Set(
      repasse.professores.flatMap((item) =>
        item.professorId.startsWith("pendencia:") ? [] : [item.professorId],
      ),
    ),
  )
  if (professorIds.length === 0) return []

  const contas = await tx.contaAsaasProfessor.findMany({
    where: {
      professorId: { in: professorIds },
      status: "HABILITADA",
      walletId: { not: null },
      professor: { ativo: true, usuario: { ativo: true } },
    },
    select: { id: true, professorId: true, walletId: true },
  })
  const contaPorProfessor = new Map(contas.map((conta) => [conta.professorId, conta]))
  const grupos = new Map<
    string,
    {
      contaId: string
      walletId: string
      valor: number
      modalidades: Array<{
        modalidadeId: string | null
        modalidadeNome: string | null
        valor: number
      }>
    }
  >()
  for (const item of repasse.professores) {
    if (item.professorId.startsWith("pendencia:")) continue
    const conta = contaPorProfessor.get(item.professorId)
    if (!conta?.walletId) continue
    const atual = grupos.get(conta.walletId) ?? {
      contaId: conta.id,
      walletId: conta.walletId,
      valor: 0,
      modalidades: [],
    }
    atual.valor += item.valor
    atual.modalidades.push(
      ...item.modalidades.map((modalidade) => ({
        modalidadeId: modalidade.modalidadeId,
        modalidadeNome: modalidade.modalidadeNome,
        valor: modalidade.valor,
      })),
    )
    grupos.set(conta.walletId, atual)
  }

  const total = Array.from(grupos.values()).reduce((soma, grupo) => soma + grupo.valor, 0)
  if (total > Number(params.valorCobranca)) {
    throw new Error("O total dos repasses aos professores supera o valor da cobrança.")
  }

  const criados = []
  let indice = 0
  for (const grupo of grupos.values()) {
    indice += 1
    criados.push(
      await tx.splitPagamentoAsaas.create({
        data: {
          ...where,
          contaAsaasProfessorId: grupo.contaId,
          walletIdSnapshot: grupo.walletId,
          valorFixoSnapshot: new Prisma.Decimal(grupo.valor),
          modalidadesSnapshot: grupo.modalidades,
          externalReference: `${params.externalReferenceCobranca}:split:${indice}`,
        },
      }),
    )
  }
  return criados
}

function splitRemotoCompativel(local: SplitPersistido, remoto: SplitCobrancaAsaas) {
  return (
    local.walletIdSnapshot === remoto.walletId &&
    Math.abs(Number(local.valorFixoSnapshot) - Number(remoto.fixedValue ?? remoto.totalValue)) <
      0.001
  )
}

export async function persistirSplitsRemotos(
  tx: Prisma.TransactionClient,
  locais: SplitPersistido[] | undefined,
  remota: Pick<CobrancaRemotaAsaas, "split">,
) {
  if (!locais?.length) return { ok: true as const }
  const remotos = remota.split ?? []
  for (const local of locais) {
    const remoto = remotos.find(
      (item) =>
        item.externalReference === local.externalReference || splitRemotoCompativel(local, item),
    )
    if (!remoto || !splitRemotoCompativel(local, remoto)) {
      await tx.splitPagamentoAsaas.update({
        where: { id: local.id },
        data: {
          status: "ERRO",
          motivo: "Split ausente ou divergente na cobrança retornada pelo Asaas.",
        },
      })
      return {
        ok: false as const,
        motivo: "A cobrança Asaas não confirmou o split esperado; concilie antes de cobrar.",
      }
    }
    await tx.splitPagamentoAsaas.update({
      where: { id: local.id },
      data: {
        asaasSplitId: remoto.id,
        status: proximoStatusSplitAsaas(local.status, statusLocalSplitAsaas(remoto.status)),
        statusAsaas: remoto.status,
        motivo: remoto.refusalReason ?? remoto.cancellationReason ?? null,
      },
    })
  }
  return { ok: true as const }
}

export async function reconciliarSplitsWebhook(
  tx: Prisma.TransactionClient,
  params: {
    evento: string
    splitId?: string | null
    splits?: SplitCobrancaAsaas[]
    asaasPaymentId?: string | null
  },
) {
  const idsAtualizados: string[] = []
  for (const remoto of params.splits ?? []) {
    const local = await tx.splitPagamentoAsaas.findFirst({
      where: {
        OR: [
          ...(remoto.id ? [{ asaasSplitId: remoto.id }] : []),
          ...(remoto.externalReference ? [{ externalReference: remoto.externalReference }] : []),
        ],
      },
    })
    if (!local) continue
    await tx.splitPagamentoAsaas.update({
      where: { id: local.id },
      data: {
        asaasSplitId: remoto.id ?? local.asaasSplitId,
        status: proximoStatusSplitAsaas(local.status, statusLocalSplitAsaas(remoto.status)),
        statusAsaas: remoto.status,
        motivo: remoto.refusalReason ?? remoto.cancellationReason ?? null,
        ultimoEventoAsaas: params.evento,
      },
    })
    idsAtualizados.push(local.id)
  }

  if (idsAtualizados.length === 0 && params.splitId) {
    const local = await tx.splitPagamentoAsaas.findUnique({
      where: { asaasSplitId: params.splitId },
    })
    if (local) {
      const status =
        params.evento === "PAYMENT_SPLIT_DONE"
          ? "CONCLUIDO"
          : params.evento === "PAYMENT_SPLIT_CANCELLED"
            ? "CANCELADO"
            : params.evento === "PAYMENT_SPLIT_DIVERGENCE_BLOCK"
              ? "BLOQUEADO"
              : "PENDENTE"
      await tx.splitPagamentoAsaas.update({
        where: { id: local.id },
        data: {
          status: proximoStatusSplitAsaas(local.status, status),
          ultimoEventoAsaas: params.evento,
        },
      })
      idsAtualizados.push(local.id)
    }
  }
  if (idsAtualizados.length === 0 && params.splitId && params.asaasPaymentId) {
    const candidatos = await tx.splitPagamentoAsaas.findMany({
      where: {
        OR: [
          { cobrancaAsaas: { is: { asaasPaymentId: params.asaasPaymentId } } },
          { cobrancaMatriculaAsaas: { is: { asaasPaymentId: params.asaasPaymentId } } },
        ],
      },
    })
    if (candidatos.length === 1) {
      const local = candidatos[0]
      const status = params.evento === "PAYMENT_SPLIT_DONE" ? "CONCLUIDO" : "PENDENTE"
      await tx.splitPagamentoAsaas.update({
        where: { id: local.id },
        data: {
          asaasSplitId: params.splitId,
          status: proximoStatusSplitAsaas(local.status, status),
          ultimoEventoAsaas: params.evento,
        },
      })
      idsAtualizados.push(local.id)
    }
  }
  return idsAtualizados
}

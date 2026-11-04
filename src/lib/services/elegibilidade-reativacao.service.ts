import "server-only"
import type { Prisma } from "@prisma/client"

/** Só reconhece a isenção automática da última operação, sem edições posteriores. */
export async function isencaoAtualDoTrancamento(
  tx: Prisma.TransactionClient,
  mensalidade: { id: string; alunoId: string; atualizadoEm: Date },
) {
  const operacao = await tx.operacaoIsencaoTrancamento.findFirst({
    where: { alunoId: mensalidade.alunoId },
    orderBy: [{ criadoEm: "desc" }, { id: "desc" }],
    select: { id: true, status: true, mensalidadeIds: true },
  })
  if (
    operacao?.status !== "CONCLUIDA" ||
    !Array.isArray(operacao.mensalidadeIds) ||
    !operacao.mensalidadeIds.includes(mensalidade.id)
  )
    return false
  const log = await tx.logAuditoria.findFirst({
    where: { entidade: "Mensalidade", entidadeId: mensalidade.id, acao: "PAGAMENTO" },
    orderBy: [{ criadoEm: "desc" }, { id: "desc" }],
    select: { valorNovo: true },
  })
  if (!log?.valorNovo || typeof log.valorNovo !== "object" || Array.isArray(log.valorNovo))
    return false
  return (
    log.valorNovo.status === "ISENTA" &&
    log.valorNovo.operacaoId === operacao.id &&
    log.valorNovo.atualizadoEm === mensalidade.atualizadoEm.toISOString()
  )
}

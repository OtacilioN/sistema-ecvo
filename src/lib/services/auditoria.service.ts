import "server-only"
import type { Prisma, TipoAcaoAudit } from "@prisma/client"
import { db } from "@/lib/db"

// Serviço central de auditoria (RF-079/080, RNF-006). Toda ação crítica deve gravar um log.
// Aceita um TransactionClient para participar da mesma transação da operação auditada.

type RegistrarLogParams = {
  autorId: string
  acao: TipoAcaoAudit
  entidade: string
  entidadeId: string
  valorAntigo?: Prisma.InputJsonValue
  valorNovo?: Prisma.InputJsonValue
  justificativa?: string | null
}

export function registrarLog(params: RegistrarLogParams, tx?: Prisma.TransactionClient) {
  const client = tx ?? db
  return client.logAuditoria.create({
    data: {
      autorId: params.autorId,
      acao: params.acao,
      entidade: params.entidade,
      entidadeId: params.entidadeId,
      valorAntigo: params.valorAntigo,
      valorNovo: params.valorNovo,
      justificativa: params.justificativa ?? null,
    },
  })
}

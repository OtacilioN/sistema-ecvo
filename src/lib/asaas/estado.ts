import type { StatusCobrancaAsaas, StatusContratoPixAutomatico } from "@prisma/client"
import type { StatusCobrancaAsaas as StatusCobrancaRemotaAsaas } from "@/lib/asaas/client"

export function statusCobrancaMatriculaPorStatusAsaas(
  status: StatusCobrancaRemotaAsaas,
): StatusCobrancaAsaas {
  const mapa: Partial<Record<StatusCobrancaRemotaAsaas, StatusCobrancaAsaas>> = {
    RECEIVED: "RECEBIDA",
    OVERDUE: "VENCIDA",
    DELETED: "CANCELADA",
    REFUNDED: "ESTORNADA",
    PARTIALLY_REFUNDED: "ERRO",
  }
  if (status === "PENDING" || status === "CONFIRMED") return "PENDENTE"
  return mapa[status] ?? "ERRO"
}

export function proximoStatusCobrancaAsaas(
  atual: StatusCobrancaAsaas,
  recebido: StatusCobrancaAsaas | null,
) {
  if (!recebido || atual === "ESTORNADA") return atual
  if (atual === "RECEBIDA" && recebido !== "ESTORNADA") return atual
  return recebido
}

export function proximoStatusContratoPixAutomatico(
  atual: StatusContratoPixAutomatico,
  recebido: StatusContratoPixAutomatico,
) {
  if (["CONCLUIDO", "CANCELADO", "RECUSADO", "EXPIRADO"].includes(atual)) return atual
  if (atual === "ATIVO" && recebido === "PENDENTE_AUTORIZACAO") return atual
  return recebido
}

export function eventoPagamentoParaStatusAsaas(status: string) {
  const mapa: Record<string, string> = {
    RECEIVED: "PAYMENT_RECEIVED",
    CONFIRMED: "PAYMENT_CONFIRMED",
    OVERDUE: "PAYMENT_OVERDUE",
    REFUNDED: "PAYMENT_REFUNDED",
    PARTIALLY_REFUNDED: "PAYMENT_PARTIALLY_REFUNDED",
    DELETED: "PAYMENT_DELETED",
  }
  return mapa[status] ?? null
}

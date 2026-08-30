import type { StatusCobrancaAsaas, StatusContratoPixAutomatico } from "@prisma/client"

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

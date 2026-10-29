export const STATUS_PIX_AUTOMATICO_EM_ANDAMENTO = [
  "CRIANDO",
  "PENDENTE_AUTORIZACAO",
  "ATIVO",
  "CANCELANDO",
  "ERRO",
] as const

export function pixAutomaticoEmAndamento(status?: string | null) {
  return STATUS_PIX_AUTOMATICO_EM_ANDAMENTO.some((emAndamento) => emAndamento === status)
}

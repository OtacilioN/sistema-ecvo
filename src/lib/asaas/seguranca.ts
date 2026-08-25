import { timingSafeEqual } from "node:crypto"

export function tokenWebhookValido(recebido: string | null, esperado: string): boolean {
  if (!recebido || !esperado) return false
  const recebidoBuffer = Buffer.from(recebido)
  const esperadoBuffer = Buffer.from(esperado)
  return (
    recebidoBuffer.length === esperadoBuffer.length &&
    timingSafeEqual(recebidoBuffer, esperadoBuffer)
  )
}

export function mensagemErroAsaasSegura(erro: unknown): string {
  const mensagem = erro instanceof Error ? erro.message : "Falha desconhecida na integração Asaas."
  return mensagem
    .replace(/\$aact_(?:prod|hmlg)_[A-Za-z0-9_-]+/g, "[CHAVE_ASAAS_OCULTA]")
    .replace(/\b\d{11,14}\b/g, "[DOCUMENTO_OCULTO]")
    .slice(0, 500)
}

import { tokenWebhookValido } from "@/lib/asaas/seguranca"
import { processarWebhookAsaas } from "@/lib/services/asaas.service"
import { webhookAsaasSchema } from "@/lib/validations/asaas"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

const LIMITE_BODY_BYTES = 256 * 1024

export async function POST(request: Request) {
  const segredo = process.env.ASAAS_WEBHOOK_TOKEN
  if (!segredo || segredo.length < 32 || segredo.length > 255) {
    return Response.json({ erro: "Webhook Asaas não configurado." }, { status: 500 })
  }
  if (!tokenWebhookValido(request.headers.get("asaas-access-token"), segredo)) {
    return Response.json({ erro: "Não autorizado." }, { status: 401 })
  }

  const tamanhoInformado = Number(request.headers.get("content-length") ?? 0)
  if (tamanhoInformado > LIMITE_BODY_BYTES) {
    return Response.json({ erro: "Payload muito grande." }, { status: 413 })
  }

  const texto = await request.text()
  if (Buffer.byteLength(texto) > LIMITE_BODY_BYTES) {
    return Response.json({ erro: "Payload muito grande." }, { status: 413 })
  }

  let json: unknown
  try {
    json = JSON.parse(texto)
  } catch {
    return Response.json({ erro: "JSON inválido." }, { status: 400 })
  }
  const parsed = webhookAsaasSchema.safeParse(json)
  if (!parsed.success) {
    return Response.json({ erro: "Evento Asaas inválido." }, { status: 400 })
  }

  try {
    const resultado = await processarWebhookAsaas(parsed.data)
    if (!resultado.ok) {
      return Response.json({ erro: "Evento não processado." }, { status: 500 })
    }
    return Response.json({ received: true }, { status: 200 })
  } catch (erro) {
    console.error("Falha ao processar webhook Asaas.", erro)
    return Response.json({ erro: "Evento não processado." }, { status: 500 })
  }
}

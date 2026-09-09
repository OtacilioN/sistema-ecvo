import { tokenWebhookValido } from "@/lib/asaas/seguranca"
import { processarWebhookAsaas } from "@/lib/services/asaas.service"
import { webhookAsaasSchema } from "@/lib/validations/asaas"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

const LIMITE_BODY_BYTES = 256 * 1024

function segredosWebhookConfigurados() {
  return [process.env.ASAAS_WEBHOOK_TOKEN, process.env.ASAAS_WEBHOOK_TOKEN_SUBCONTAS]
    .map((segredo) => segredo?.trim())
    .filter((segredo): segredo is string =>
      Boolean(segredo && segredo.length >= 32 && segredo.length <= 255),
    )
}

export async function POST(request: Request) {
  const segredos = segredosWebhookConfigurados()
  if (segredos.length === 0) {
    return Response.json({ erro: "Webhook Asaas não configurado." }, { status: 500 })
  }
  const tokenRecebido = request.headers.get("asaas-access-token")
  const autorizado = segredos.reduce(
    (valido, segredo) => tokenWebhookValido(tokenRecebido, segredo) || valido,
    false,
  )
  if (!autorizado) {
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

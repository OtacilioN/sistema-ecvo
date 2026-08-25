import {
  processarCobrancasPixAutomaticoPendentes,
  reconciliarPendenciasAsaas,
} from "@/lib/services/asaas.service"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

export async function GET(request: Request) {
  const segredo = process.env.CRON_SECRET
  if (!segredo) {
    return Response.json({ erro: "CRON_SECRET não configurado." }, { status: 500 })
  }
  if (request.headers.get("authorization") !== `Bearer ${segredo}`) {
    return Response.json({ erro: "Não autorizado." }, { status: 401 })
  }

  const reconciliacao = await reconciliarPendenciasAsaas()
  const criacao = await processarCobrancasPixAutomaticoPendentes()
  return Response.json({ reconciliacao, criacao })
}

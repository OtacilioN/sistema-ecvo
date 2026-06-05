import { gerarLembretesFinanceirosGestores } from "@/lib/services/financeiro.service"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

export async function GET(request: Request) {
  const segredo = process.env.CRON_SECRET
  const authorization = request.headers.get("authorization")

  if (!segredo) {
    return Response.json({ erro: "CRON_SECRET não configurado." }, { status: 500 })
  }

  if (authorization !== `Bearer ${segredo}`) {
    return Response.json({ erro: "Não autorizado." }, { status: 401 })
  }

  const resultado = await gerarLembretesFinanceirosGestores()

  return Response.json(resultado)
}

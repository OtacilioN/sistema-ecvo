import { gerarAulasFuturasDeTurmasAtivas } from "@/lib/services/turma.service"

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

  const resultado = await gerarAulasFuturasDeTurmasAtivas({ semanas: 8 })

  return Response.json({
    ok: true,
    ...resultado,
  })
}

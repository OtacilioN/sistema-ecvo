import {
  gerarLembretesFinanceirosGestores,
  gerarMensalidadesRecorrentes,
} from "@/lib/services/financeiro.service"
import { gerarLembretesAniversario } from "@/lib/services/notificacao.service"

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

  const mensalidades = await gerarMensalidadesRecorrentes()
  const [financeiro, aniversarios] = await Promise.all([
    gerarLembretesFinanceirosGestores(),
    gerarLembretesAniversario(),
  ])

  return Response.json({
    ok: true,
    mensalidades,
    financeiro,
    aniversarios,
  })
}

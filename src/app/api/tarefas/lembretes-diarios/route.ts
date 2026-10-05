import {
  gerarLembretesFinanceiros,
  gerarMensalidadesRecorrentes,
} from "@/lib/services/financeiro.service"
import { trancarAvulsosExpirados } from "@/lib/services/matricula-trancada.service"
import {
  expurgarNotificacoesAntigas,
  gerarLembretesAluguelGestores,
  gerarLembretesAniversario,
} from "@/lib/services/notificacao.service"

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

  const avulsos = await trancarAvulsosExpirados()
  const mensalidades = await gerarMensalidadesRecorrentes()
  const [financeiro, aniversarios, aluguel, expurgoNotificacoes] = await Promise.all([
    gerarLembretesFinanceiros(),
    gerarLembretesAniversario(),
    gerarLembretesAluguelGestores(),
    expurgarNotificacoesAntigas(),
  ])

  return Response.json({
    ok: true,
    avulsos,
    mensalidades,
    financeiro,
    aniversarios,
    aluguel,
    expurgoNotificacoes,
  })
}

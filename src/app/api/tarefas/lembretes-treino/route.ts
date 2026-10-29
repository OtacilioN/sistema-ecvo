import { gerarLembretesTreino } from "@/lib/services/notificacao.service"
import { responderTarefaAgendada } from "@/lib/tarefa-agendada-http"

export const dynamic = "force-dynamic"
export const maxDuration = 300

export async function GET(request: Request) {
  return responderTarefaAgendada(request, "lembretes-treino", () =>
    gerarLembretesTreino(undefined, { antecedenciaMinutos: 60, janelaMinutos: 15 }),
  )
}

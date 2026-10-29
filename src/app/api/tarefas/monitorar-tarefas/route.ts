import { monitorarTarefasAgendadas } from "@/lib/services/monitoramento-tarefas.service"
import { responderTarefaAgendada } from "@/lib/tarefa-agendada-http"

export const dynamic = "force-dynamic"
export const maxDuration = 300

export async function GET(request: Request) {
  return responderTarefaAgendada(request, "monitorar-tarefas", monitorarTarefasAgendadas)
}

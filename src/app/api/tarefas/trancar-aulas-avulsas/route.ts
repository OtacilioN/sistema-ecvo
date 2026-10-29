import { trancarAvulsosExpirados } from "@/lib/services/matricula-trancada.service"
import { responderTarefaAgendada } from "@/lib/tarefa-agendada-http"

export const dynamic = "force-dynamic"
export const maxDuration = 300

export async function GET(request: Request) {
  return responderTarefaAgendada(request, "trancar-aulas-avulsas", async () => ({
    ok: true,
    ...(await trancarAvulsosExpirados()),
  }))
}

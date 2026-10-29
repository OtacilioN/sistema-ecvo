import { reconciliarPendenciasAsaas } from "@/lib/services/asaas.service"
import { responderTarefaAgendada } from "@/lib/tarefa-agendada-http"

export const dynamic = "force-dynamic"
export const maxDuration = 300

export async function GET(request: Request) {
  return responderTarefaAgendada(request, "reconciliar-asaas", () =>
    reconciliarPendenciasAsaas({ somenteRecuperacao: true }),
  )
}

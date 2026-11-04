import { reconciliarPendenciasAsaas } from "@/lib/services/asaas.service"
import { reconciliarCobrancasReativacao } from "@/lib/services/cobranca-reativacao.service"
import { processarIsencoesTrancamento } from "@/lib/services/isencao-trancamento.service"
import { executarEtapasIndependentes } from "@/lib/services/rotinas-agendadas.service"
import { responderTarefaAgendada } from "@/lib/tarefa-agendada-http"

export const dynamic = "force-dynamic"
export const maxDuration = 300

export async function GET(request: Request) {
  return responderTarefaAgendada(request, "reconciliar-asaas", () =>
    executarEtapasIndependentes({
      isencoesTrancamento: () => processarIsencoesTrancamento(),
      reativacoes: async () => {
        const resultado = await reconciliarCobrancasReativacao({})
        return { ...resultado, ok: resultado.falhas === 0 }
      },
      reconciliacao: () => reconciliarPendenciasAsaas({ somenteRecuperacao: true }),
    }),
  )
}

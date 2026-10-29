import "server-only"
import { tokenWebhookValido } from "@/lib/asaas/seguranca"
import { executarTarefaAgendada } from "@/lib/services/tarefa-agendada.service"
import type { NomeTarefaAgendada } from "@/lib/tarefas-agendadas"

export async function responderTarefaAgendada<T extends { ok?: boolean }>(
  request: Request,
  tarefa: NomeTarefaAgendada,
  executar: () => Promise<T>,
) {
  const segredo = process.env.CRON_SECRET
  if (!segredo) return Response.json({ erro: "CRON_SECRET não configurado." }, { status: 500 })
  if (!tokenWebhookValido(request.headers.get("authorization"), `Bearer ${segredo}`)) {
    return Response.json({ erro: "Não autorizado." }, { status: 401 })
  }

  try {
    const execucao = await executarTarefaAgendada({ tarefa, executar })
    if (execucao.status === "IGNORADA") {
      return Response.json(
        { ok: true, ignorada: true, motivo: "Tarefa já está em execução." },
        { status: 202 },
      )
    }
    return Response.json(
      {
        ...execucao.resultado,
        ok: execucao.status === "CONCLUIDA",
        execucaoId: execucao.execucaoId,
        ...("erro" in execucao ? { erro: execucao.erro } : {}),
      },
      { status: execucao.status === "CONCLUIDA" ? 200 : 500 },
    )
  } catch {
    // Nunca executar sem a reserva persistente nem expor mensagens de banco/credenciais.
    console.error("Falha na infraestrutura da tarefa agendada", { tarefa })
    return Response.json(
      { erro: "Não foi possível registrar a execução da tarefa." },
      { status: 503 },
    )
  }
}

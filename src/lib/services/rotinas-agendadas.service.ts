import "server-only"
import {
  processarCobrancasPixAutomaticoPendentes,
  reconciliarPendenciasAsaas,
  sincronizarCobrancasDescontoAdimplencia,
} from "@/lib/services/asaas.service"
import {
  gerarLembretesFinanceiros,
  gerarMensalidadesRecorrentes,
  sincronizarValoresAdimplencia,
  vencerMensalidadesAtrasadas,
} from "@/lib/services/financeiro.service"
import {
  expurgarNotificacoesAntigas,
  gerarLembretesAluguelGestores,
  gerarLembretesAniversario,
} from "@/lib/services/notificacao.service"
import {
  executarTarefaAgendada,
  expurgarExecucoesTarefasAntigas,
} from "@/lib/services/tarefa-agendada.service"

// Uma etapa indisponível não impede as outras; erro bruto nunca integra o histórico.
export async function executarEtapasIndependentes(etapas: Record<string, () => Promise<unknown>>) {
  const resultados: Record<string, unknown> = {}
  const erros: Array<{ etapa: string; motivo: string }> = []
  for (const [etapa, executar] of Object.entries(etapas)) {
    try {
      const resultado = await executar()
      resultados[etapa] = resultado
      if (
        resultado &&
        typeof resultado === "object" &&
        "ok" in resultado &&
        resultado.ok === false
      ) {
        erros.push({ etapa, motivo: "Existem itens pendentes nesta etapa." })
      }
    } catch {
      erros.push({ etapa, motivo: "Não foi possível concluir esta etapa." })
    }
  }
  return { ...resultados, ok: erros.length === 0, erros }
}

export function realizarManutencaoFinanceira() {
  return executarEtapasIndependentes({
    precosAdimplencia: () => sincronizarValoresAdimplencia(),
    vencimentos: () => vencerMensalidadesAtrasadas(undefined, { notificarAlunos: false }),
  })
}

export function gerarAvisosFinanceiros() {
  return executarEtapasIndependentes({
    // A geração cria o aviso de nova mensalidade e envia push; permanece às 08h.
    mensalidades: () => gerarMensalidadesRecorrentes(),
    financeiro: () => gerarLembretesFinanceiros(),
  })
}

export function gerarLembretesDiarios() {
  return executarEtapasIndependentes({
    aniversarios: () => gerarLembretesAniversario(),
    aluguel: () => gerarLembretesAluguelGestores(),
  })
}

export function realizarLimpezaDiaria() {
  return executarEtapasIndependentes({
    notificacoes: () => expurgarNotificacoesAntigas(),
    execucoes: () => expurgarExecucoesTarefasAntigas(),
  })
}

export async function realizarCicloDiarioAsaas() {
  return executarEtapasIndependentes({
    // Mesmo nome da recuperação horária: as duas modalidades compartilham a reserva.
    reconciliacao: async () => {
      const execucao = await executarTarefaAgendada({
        tarefa: "reconciliar-asaas",
        executar: () => reconciliarPendenciasAsaas(),
      })
      return {
        ...(execucao.status !== "IGNORADA" ? execucao.resultado : {}),
        ok: execucao.status === "CONCLUIDA",
      }
    },
    adimplencia: async () => {
      await sincronizarValoresAdimplencia()
      return sincronizarCobrancasDescontoAdimplencia()
    },
    criacao: () => processarCobrancasPixAutomaticoPendentes(),
  })
}

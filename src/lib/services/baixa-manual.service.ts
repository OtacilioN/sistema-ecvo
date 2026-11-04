import "server-only"
import { db } from "@/lib/db"
import { pixAutomaticoEmAndamento } from "@/lib/financeiro/pix-automatico"
import {
  cancelarCobrancaAsaasAntesDeBaixaManual,
  cancelarPixAutomatico,
} from "@/lib/services/asaas.service"
import { baixarMensalidade, gerarMensalidade } from "@/lib/services/financeiro.service"

type ParametrosBaixaManual = {
  mensalidadeId: string
  formaPagamento?: string | null
  observacao?: string | null
  confirmarCancelamentoPixAutomatico?: boolean
  autorId: string
}

export async function baixarMensalidadeManual(params: ParametrosBaixaManual) {
  const mensalidade = await db.mensalidade.findUnique({
    where: { id: params.mensalidadeId },
    select: {
      status: true,
      alunoId: true,
      contratoPixAutomatico: { select: { status: true } },
    },
  })

  if (!mensalidade || ["PAGA", "ISENTA"].includes(mensalidade.status)) {
    return baixarMensalidade(params)
  }

  const isencaoPendente = await db.operacaoIsencaoTrancamento.findFirst({
    where: { alunoId: mensalidade.alunoId, status: { in: ["PENDENTE", "PROCESSANDO"] } },
    select: { id: true },
  })
  if (isencaoPendente)
    return {
      ok: false as const,
      motivo:
        "A isenção do trancamento está em processamento. Aguarde a conclusão antes de alterar a mensalidade.",
    }

  let cobrancaEncerrada = false
  let recorrenciaEncerrada = false
  function informarCancelamentos(motivo: string) {
    const avisos = [
      cobrancaEncerrada ? "A cobrança PIX foi encerrada ou já estava encerrada." : "",
      recorrenciaEncerrada ? "O cancelamento do PIX Automático foi confirmado." : "",
    ].filter(Boolean)
    return [motivo, ...avisos].join(" ")
  }

  const cancelarRecorrencia = pixAutomaticoEmAndamento(mensalidade.contratoPixAutomatico?.status)
  if (cancelarRecorrencia && params.confirmarCancelamentoPixAutomatico !== true) {
    return {
      ok: false as const,
      motivo:
        "Confirme que esta baixa manual cancelará todo o Pix recorrente do aluno, incluindo as próximas cobranças automáticas.",
      confirmacaoPixAutomaticoNecessaria: true as const,
    }
  }

  const cobrancaAtiva = await db.cobrancaAsaas.findFirst({
    where: { mensalidadeId: params.mensalidadeId, ativa: true },
    select: { id: true, status: true },
  })

  if (cobrancaAtiva?.status === "RECEBIDA") {
    return {
      ok: false as const,
      motivo: "O pagamento já foi confirmado pelo Asaas e não pode receber baixa manual.",
    }
  }

  if (cobrancaAtiva) {
    const cancelamento = await cancelarCobrancaAsaasAntesDeBaixaManual({
      cobrancaId: cobrancaAtiva.id,
      autorId: params.autorId,
    })
    if (!cancelamento.ok) return cancelamento
    cobrancaEncerrada = true
  }

  if (cancelarRecorrencia) {
    const cancelamentoPixAutomatico = await cancelarPixAutomatico({
      alunoId: mensalidade.alunoId,
      autorId: params.autorId,
    })
    if (!cancelamentoPixAutomatico.ok)
      return {
        ...cancelamentoPixAutomatico,
        motivo: informarCancelamentos(cancelamentoPixAutomatico.motivo),
      }
    recorrenciaEncerrada = true
  }

  const resultado = await baixarMensalidade(params)
  if (!resultado.ok && (cobrancaEncerrada || recorrenciaEncerrada))
    return { ...resultado, motivo: informarCancelamentos(resultado.motivo) }
  return resultado
}

export async function darBaixaMensalidadeAlunoManual(params: {
  alunoId: string
  competencia: string
  formaPagamento?: string | null
  observacao?: string | null
  confirmarCancelamentoPixAutomatico?: boolean
  autorId: string
}) {
  const mensalidade = await gerarMensalidade({
    alunoId: params.alunoId,
    competencia: params.competencia,
    autorId: params.autorId,
  })
  if (!mensalidade.ok) return mensalidade

  return baixarMensalidadeManual({
    mensalidadeId: mensalidade.mensalidade.id,
    formaPagamento: params.formaPagamento,
    observacao: params.observacao,
    confirmarCancelamentoPixAutomatico: params.confirmarCancelamentoPixAutomatico,
    autorId: params.autorId,
  })
}

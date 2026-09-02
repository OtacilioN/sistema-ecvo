import "server-only"
import { db } from "@/lib/db"
import {
  cancelarCobrancaAsaasAntesDeBaixaManual,
  cancelarPixAutomatico,
} from "@/lib/services/asaas.service"
import { baixarMensalidade, gerarMensalidade } from "@/lib/services/financeiro.service"

type ParametrosBaixaManual = {
  mensalidadeId: string
  formaPagamento?: string | null
  observacao?: string | null
  autorId: string
}

const STATUS_PIX_AUTOMATICO_EM_ANDAMENTO = new Set([
  "CRIANDO",
  "PENDENTE_AUTORIZACAO",
  "ATIVO",
  "CANCELANDO",
  "ERRO",
])

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
  }

  if (
    mensalidade.contratoPixAutomatico &&
    STATUS_PIX_AUTOMATICO_EM_ANDAMENTO.has(mensalidade.contratoPixAutomatico.status)
  ) {
    const cancelamentoPixAutomatico = await cancelarPixAutomatico({
      alunoId: mensalidade.alunoId,
      autorId: params.autorId,
    })
    if (!cancelamentoPixAutomatico.ok) return cancelamentoPixAutomatico
  }

  return baixarMensalidade(params)
}

export async function darBaixaMensalidadeAlunoManual(params: {
  alunoId: string
  competencia: string
  formaPagamento?: string | null
  observacao?: string | null
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
    autorId: params.autorId,
  })
}

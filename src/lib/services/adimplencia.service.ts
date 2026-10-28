import "server-only"
import type { Prisma } from "@prisma/client"
import { formatInTimeZone } from "date-fns-tz"
import { STATUS_ALUNO_OPERACIONAIS } from "@/lib/alunos/status"
import { db } from "@/lib/db"
import { DIAS_CARENCIA_ADIMPLENCIA, resumoAdimplencia } from "@/lib/financeiro/adimplencia"
import { criarNotificacao, notificacaoAtiva } from "@/lib/services/notificacao.service"
import { formatarCompetencia, formatarData, inicioDoDiaAcademia, TIMEZONE } from "@/lib/utils/datas"
import { formatarBRL } from "@/lib/utils/formato"

type Cliente = Prisma.TransactionClient | typeof db

function ehDuplicacao(erro: unknown): boolean {
  return typeof erro === "object" && erro !== null && "code" in erro && erro.code === "P2002"
}

/** Confirma a perda do desconto no primeiro dia após o prazo de pagamento. */
export async function gerarAvisosDiariosAdimplencia(
  cliente: Cliente = db,
  params?: { agora?: Date },
) {
  if (!(await notificacaoAtiva(cliente, "FINANCEIRO"))) {
    return { ok: true as const, total: 0 }
  }

  const agora = params?.agora ?? new Date()
  const dia = formatInTimeZone(agora, TIMEZONE, "yyyy-MM-dd")
  const mensalidades = await cliente.mensalidade.findMany({
    where: {
      status: { in: ["EM_ABERTO", "VENCIDA"] },
      vencimento: { lt: inicioDoDiaAcademia(agora) },
      valorBase: { not: null },
      valorComDesconto: { not: null },
      aluno: {
        status: { in: [...STATUS_ALUNO_OPERACIONAIS] },
        usuario: { ativo: true },
      },
    },
    select: {
      id: true,
      competencia: true,
      status: true,
      valor: true,
      valorBase: true,
      valorComDesconto: true,
      vencimento: true,
      aluno: { select: { usuarioId: true } },
    },
  })

  let total = 0
  for (const mensalidade of mensalidades) {
    const resumo = resumoAdimplencia(mensalidade, agora)
    if (
      !resumo.temDesconto ||
      resumo.diasAtraso < 1 ||
      resumo.diasAtraso > DIAS_CARENCIA_ADIMPLENCIA + 1
    ) {
      continue
    }

    const competencia = formatarCompetencia(mensalidade.competencia)
    const valorComDesconto = formatarBRL(resumo.valorComDesconto)
    const valorBase = formatarBRL(resumo.valorBase)
    const titulo = resumo.descontoAtivo
      ? "Seu desconto de adimplência está em risco"
      : "Desconto de adimplência encerrado"
    const mensagem = resumo.descontoAtivo
      ? `Sua mensalidade de ${competencia} está atrasada. Pague ${valorComDesconto} até ${formatarData(resumo.ultimoDiaComDesconto)} para manter o desconto de adimplência. A partir de ${formatarData(resumo.perdeDescontoEm)}, o valor será ${valorBase}.`
      : `Sua mensalidade de ${competencia} venceu em ${formatarData(mensalidade.vencimento)}. O prazo para pagar ${valorComDesconto} com desconto de adimplência terminou e o valor para pagamento agora é ${valorBase}. Acesse o financeiro para regularizar.`

    try {
      const criada = await criarNotificacao(cliente, {
        usuarioId: mensalidade.aluno.usuarioId,
        tipo: "FINANCEIRO",
        titulo,
        mensagem,
        // A restrição única também protege execuções concorrentes do cron.
        chaveDeduplicacao: `adimplencia:${mensalidade.id}:${mensalidade.aluno.usuarioId}:${dia}`,
      })
      if (criada) total++
    } catch (erro) {
      if (!ehDuplicacao(erro)) throw erro
    }
  }

  return { ok: true as const, total }
}

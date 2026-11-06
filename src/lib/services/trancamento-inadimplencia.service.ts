import "server-only"
import type { Prisma } from "@prisma/client"
import { format, subDays } from "date-fns"
import { fromZonedTime } from "date-fns-tz"
import { STATUS_ALUNO_OPERACIONAIS } from "@/lib/alunos/status"
import { db } from "@/lib/db"
import { registrarLog } from "@/lib/services/auditoria.service"
import {
  agendarIsencaoTrancamento,
  processarIsencoesTrancamento,
} from "@/lib/services/isencao-trancamento.service"
import { paraFusoAcademia, TIMEZONE } from "@/lib/utils/datas"

/** Tranca a partir do 8º dia civil de atraso, inclusive em sessões já abertas. */
export async function trancarAlunosInadimplentes(params: { alunoId?: string; agora?: Date } = {}) {
  const agora = params.agora ?? new Date()
  // Vencimento dia 10: no dia 18, o limite exclusivo é o início do dia 11.
  const diaLimite = subDays(paraFusoAcademia(agora), 7)
  const limiteExclusivo = fromZonedTime(`${format(diaLimite, "yyyy-MM-dd")}T00:00:00`, TIMEZONE)
  const mensalidadeElegivel = {
    status: { in: ["EM_ABERTO", "VENCIDA"] },
    vencimento: { lt: limiteExclusivo },
  } satisfies Prisma.MensalidadeWhereInput
  const candidatos = await db.aluno.findMany({
    where: {
      ...(params.alunoId ? { id: params.alunoId } : {}),
      status: { in: [...STATUS_ALUNO_OPERACIONAIS] },
      mensalidades: { some: mensalidadeElegivel },
    },
    select: { id: true },
    orderBy: { id: "asc" },
  })

  let trancados = 0
  let isencoesPendentes = 0
  for (const candidato of candidatos) {
    const operacaoId = await db.$transaction(async (tx) => {
      // Mesma ordem da baixa, do trancamento manual e da reativação.
      await tx.$queryRaw`SELECT "id" FROM "Mensalidade" WHERE "alunoId" = ${candidato.id} ORDER BY "id" FOR UPDATE`
      await tx.$queryRaw`SELECT "id" FROM "Aluno" WHERE "id" = ${candidato.id} FOR UPDATE`
      const aluno = await tx.aluno.findUnique({
        where: { id: candidato.id },
        select: { status: true },
      })
      if (!aluno || !STATUS_ALUNO_OPERACIONAIS.some((status) => status === aluno.status))
        return null
      // Pagamento ou adiamento anterior ao lock pode ter eliminado o atraso.
      const mensalidade = await tx.mensalidade.findFirst({
        where: { alunoId: candidato.id, ...mensalidadeElegivel },
        select: { id: true, vencimento: true },
        orderBy: [{ vencimento: "asc" }, { id: "asc" }],
      })
      if (!mensalidade) return null
      const alterado = await tx.aluno.updateMany({
        where: {
          id: candidato.id,
          status: { in: [...STATUS_ALUNO_OPERACIONAIS] },
          mensalidades: { some: mensalidadeElegivel },
        },
        data: { status: "TRANCADO" },
      })
      if (!alterado.count) return null
      const operacao = await agendarIsencaoTrancamento(tx, candidato.id, null)
      await registrarLog(
        {
          autorId: null,
          acao: "STATUS_ALUNO",
          entidade: "Aluno",
          entidadeId: candidato.id,
          valorAntigo: { status: aluno.status },
          valorNovo: {
            status: "TRANCADO",
            motivo: "INADIMPLENCIA_SUPERIOR_A_SETE_DIAS",
            mensalidadeId: mensalidade.id,
            vencimento: mensalidade.vencimento.toISOString(),
            operacaoIsencaoId: operacao.id,
          },
          justificativa: "Trancamento automático a partir do 8º dia de inadimplência.",
        },
        tx,
      )
      return operacao.id
    })
    if (!operacaoId) continue
    trancados++
    // A operação persistida permite retentativa pela reconciliação horária.
    const isencao = await processarIsencoesTrancamento({ operacaoId }).catch(() => ({ ok: false }))
    if (!isencao.ok) isencoesPendentes++
  }
  return { ok: isencoesPendentes === 0, trancados, isencoesPendentes }
}

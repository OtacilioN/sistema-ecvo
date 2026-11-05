import type { Prisma } from "@prisma/client"
import { fimExclusivoDoDiaAcademia, inicioDoDiaAcademia } from "@/lib/utils/datas"

/** O limite considera o dia da aula na academia, inclusive em lançamentos retroativos. */
export function filtroCheckinNaModalidadeNoDia(params: {
  alunoId: string
  modalidadeId: string
  inicioAula: Date
  aulaIdIgnorada?: string
}): Prisma.CheckinWhereInput {
  return {
    alunoId: params.alunoId,
    status: { in: ["VALIDO", "PENDENTE_REVISAO"] },
    ...(params.aulaIdIgnorada ? { aulaId: { not: params.aulaIdIgnorada } } : {}),
    aula: {
      inicio: {
        gte: inicioDoDiaAcademia(params.inicioAula),
        lt: fimExclusivoDoDiaAcademia(params.inicioAula),
      },
      turma: { modalidadeId: params.modalidadeId },
    },
  }
}

export function mensagemLimiteDiarioCheckin(modalidade: string): string {
  return `Você já tem um check-in em ${modalidade} neste dia. É permitida apenas uma aula por modalidade por dia.`
}

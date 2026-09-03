import { fimExclusivoDaSemanaAcademia, inicioDaSemanaAcademia } from "@/lib/utils/datas"

export const VALOR_AULA_AVULSA = 20
export const VALOR_MENSALIDADE_AULA_AVULSA = 100
export const VALOR_COMPLEMENTO_AULA_AVULSA = 80

export type SituacaoConversaoAulaAvulsa = "AGUARDANDO_SEMANA" | "DISPONIVEL" | "EXPIRADA"

export function situacaoConversaoAulaAvulsa(params: {
  inicioAula: Date
  agora?: Date
}): SituacaoConversaoAulaAvulsa {
  const agora = params.agora ?? new Date()
  const inicio = inicioDaSemanaAcademia(params.inicioAula)
  const fim = fimExclusivoDaSemanaAcademia(params.inicioAula)
  if (agora.getTime() < inicio.getTime()) return "AGUARDANDO_SEMANA"
  if (agora.getTime() >= fim.getTime()) return "EXPIRADA"
  return "DISPONIVEL"
}

export function planoCompativelComAulaAvulsa(valor: number): boolean {
  return Math.abs(valor - VALOR_MENSALIDADE_AULA_AVULSA) < 0.001
}

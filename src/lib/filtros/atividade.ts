export const FILTRO_ATIVIDADE_PADRAO = "ATIVAS" as const

export type FiltroAtividade = typeof FILTRO_ATIVIDADE_PADRAO | "INATIVAS" | "TODAS"

export function correspondeFiltroAtividade(ativa: boolean, filtro: FiltroAtividade): boolean {
  if (filtro === "TODAS") return true
  return filtro === "ATIVAS" ? ativa : !ativa
}

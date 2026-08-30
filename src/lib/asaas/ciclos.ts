const COMPETENCIA_PATTERN = /^(\d{4})-(0[1-9]|1[0-2])$/

export function somarMesesCompetencia(competencia: string, meses: number): string {
  const match = COMPETENCIA_PATTERN.exec(competencia)
  if (!match) throw new Error("Competência inválida.")

  const ano = Number(match[1])
  const mes = Number(match[2])
  const data = new Date(Date.UTC(ano, mes - 1 + meses, 1, 12))
  return `${data.getUTCFullYear()}-${String(data.getUTCMonth() + 1).padStart(2, "0")}`
}

export function competenciasDoSemestre(competenciaInicial: string): string[] {
  return Array.from({ length: 6 }, (_, indice) => somarMesesCompetencia(competenciaInicial, indice))
}

/**
 * O Asaas aceita a instrução entre 2 e 10 dias úteis antes do vencimento.
 * A rotina diária usa uma janela conservadora em dias corridos e deixa o
 * provedor validar feriados bancários, que não podem ser inferidos localmente.
 */
export function estaNaJanelaDeCriacaoPixAutomatico(vencimento: Date, hoje = new Date()): boolean {
  const dia = Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth(), hoje.getUTCDate())
  const vencimentoDia = Date.UTC(
    vencimento.getUTCFullYear(),
    vencimento.getUTCMonth(),
    vencimento.getUTCDate(),
  )
  const dias = Math.ceil((vencimentoDia - dia) / 86_400_000)
  return dias >= 2 && dias <= 14
}

const COMPETENCIA_PATTERN = /^(\d{4})-(0[1-9]|1[0-2])$/

export type TotalCiclosPixAutomatico = 3 | 6

export function totalCiclosPixAutomatico(tipo: string): TotalCiclosPixAutomatico {
  if (tipo === "AUTOMATICO_TRIMESTRAL") return 3
  if (tipo === "AUTOMATICO_SEMESTRAL") return 6
  throw new Error("Modalidade de Pix Automático inválida.")
}

export function tipoPixAutomaticoDoContrato(totalCiclos: number) {
  if (totalCiclos === 3) return "AUTOMATICO_TRIMESTRAL" as const
  if (totalCiclos === 6) return "AUTOMATICO_SEMESTRAL" as const
  throw new Error("O Pix Automático permite somente 3 ou 6 mensalidades.")
}

export function somarMesesCompetencia(competencia: string, meses: number): string {
  const match = COMPETENCIA_PATTERN.exec(competencia)
  if (!match) throw new Error("Competência inválida.")

  const ano = Number(match[1])
  const mes = Number(match[2])
  const data = new Date(Date.UTC(ano, mes - 1 + meses, 1, 12))
  return `${data.getUTCFullYear()}-${String(data.getUTCMonth() + 1).padStart(2, "0")}`
}

export function competenciasDoSemestre(competenciaInicial: string): string[] {
  return competenciasDoCicloPixAutomatico(competenciaInicial, 6)
}

export function competenciasDoCicloPixAutomatico(
  competenciaInicial: string,
  totalCiclos: number,
): string[] {
  tipoPixAutomaticoDoContrato(totalCiclos)
  return Array.from({ length: totalCiclos }, (_, indice) =>
    somarMesesCompetencia(competenciaInicial, indice),
  )
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

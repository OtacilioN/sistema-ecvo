const MINUTO_MS = 60_000
export const TOLERANCIA_PADRAO_CHECKIN_MINUTOS = 30

export type AulaCandidataCheckinLivre = {
  id: string
  inicio: Date
  fim: Date
  cancelada: boolean
  temAgendamento: boolean
  temCheckin: boolean
  vagasDisponiveis: number | null
}

export function podeRealizarCheckinNaJanela(params: {
  inicioAula: Date
  fimAula: Date
  agora?: Date
  toleranciaMinutos?: number
}): boolean {
  const tolerancia = params.toleranciaMinutos ?? TOLERANCIA_PADRAO_CHECKIN_MINUTOS
  const agora = (params.agora ?? new Date()).getTime()
  const inicio = params.inicioAula.getTime()
  const fim = params.fimAula.getTime()
  return agora >= inicio - tolerancia * MINUTO_MS && agora <= fim + tolerancia * MINUTO_MS
}

function temVaga(aula: AulaCandidataCheckinLivre) {
  return (
    aula.temAgendamento ||
    aula.temCheckin ||
    aula.vagasDisponiveis === null ||
    aula.vagasDisponiveis > 0
  )
}

function ordenarCandidatas(a: AulaCandidataCheckinLivre, b: AulaCandidataCheckinLivre) {
  const porInicio = a.inicio.getTime() - b.inicio.getTime()
  if (porInicio !== 0) return porInicio
  if (a.temAgendamento !== b.temAgendamento) return a.temAgendamento ? -1 : 1
  if (a.temCheckin !== b.temCheckin) return a.temCheckin ? -1 : 1

  const vagasA = a.vagasDisponiveis ?? Number.MAX_SAFE_INTEGER
  const vagasB = b.vagasDisponiveis ?? Number.MAX_SAFE_INTEGER
  return vagasB - vagasA || a.id.localeCompare(b.id)
}

/**
 * Encaixa o check-in livre numa aula oficial do dia da academia.
 *
 * A prioridade é: agendamento confirmado; aula em andamento; próxima aula futura;
 * por fim, a última aula encerrada. Horários futuros lotados são pulados quando existe
 * outro futuro disponível. O fallback encerrado só é usado depois do último horário,
 * e uma duplicidade nunca é desviada para outra aula.
 */
export function selecionarAulaReferenciaCheckinLivre(
  aulas: AulaCandidataCheckinLivre[],
  agora: Date,
): AulaCandidataCheckinLivre | null {
  const ordenadas = aulas.filter((aula) => !aula.cancelada).toSorted(ordenarCandidatas)
  if (ordenadas.length === 0) return null

  const agendadas = ordenadas.filter((aula) => aula.temAgendamento)
  const candidatas = agendadas.length > 0 ? agendadas : ordenadas
  const agoraMs = agora.getTime()
  const emAndamento = candidatas.filter(
    (aula) => aula.inicio.getTime() <= agoraMs && aula.fim.getTime() >= agoraMs,
  )
  const futuras = candidatas.filter((aula) => aula.inicio.getTime() > agoraMs)
  const encerradas = candidatas.filter((aula) => aula.fim.getTime() < agoraMs)

  if (agendadas.length > 0) {
    return emAndamento[0] ?? futuras[0] ?? encerradas.at(-1) ?? null
  }

  return (
    emAndamento.find(temVaga) ??
    futuras.find(temVaga) ??
    emAndamento[0] ??
    futuras[0] ??
    encerradas.toReversed().find(temVaga) ??
    encerradas.at(-1) ??
    null
  )
}

export function checkinForaDaJanelaOficial(params: {
  inicioAula: Date
  fimAula: Date
  realizadoEm: Date
}) {
  return !podeRealizarCheckinNaJanela({
    inicioAula: params.inicioAula,
    fimAula: params.fimAula,
    agora: params.realizadoEm,
  })
}

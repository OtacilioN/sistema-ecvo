import { addDays, format } from "date-fns"
import { ptBR } from "date-fns/locale"
import { formatInTimeZone, fromZonedTime, toZonedTime } from "date-fns-tz"

// Timezone padrão da academia (Brasil). Janelas de agendamento, recorrência semanal
// e geração de aulas são sensíveis a fuso (RF-014).
export const TIMEZONE = "America/Sao_Paulo"

export const DIAS_SEMANA = [
  "Domingo",
  "Segunda",
  "Terça",
  "Quarta",
  "Quinta",
  "Sexta",
  "Sábado",
] as const

export function rotuloDiaSemana(dia: number): string {
  return DIAS_SEMANA[dia] ?? "—"
}

export function formatarData(data: Date): string {
  return formatInTimeZone(data, TIMEZONE, "dd/MM/yyyy", { locale: ptBR })
}

export function formatarCompetencia(competencia: string): string {
  const correspondencia = /^(\d{4})-(\d{2})$/.exec(competencia)
  if (!correspondencia) return competencia

  const ano = Number(correspondencia[1])
  const mes = Number(correspondencia[2])
  if (mes < 1 || mes > 12) return competencia

  const data = new Date(Date.UTC(ano, mes - 1, 15, 12))
  return formatInTimeZone(data, TIMEZONE, "MMMM 'de' yyyy", { locale: ptBR })
}

export function formatarDataInput(data: Date): string {
  return formatInTimeZone(data, TIMEZONE, "yyyy-MM-dd")
}

/**
 * Extrai uma data civil persistida sem deixar o fuso alterar o dia.
 *
 * Cadastros anteriores a junho de 2026 foram gravados por `new Date("YYYY-MM-DD")`,
 * portanto ficaram à meia-noite UTC. Para esses valores legados, os componentes UTC
 * representam a data originalmente informada. Os valores atuais são gravados ao meio-dia
 * da academia e devem ser interpretados em `TIMEZONE`.
 */
export function partesDataCivil(data: Date): { ano: number; mes: number; dia: number } {
  const ehLegadaEmMeiaNoiteUtc =
    data.getUTCHours() === 0 &&
    data.getUTCMinutes() === 0 &&
    data.getUTCSeconds() === 0 &&
    data.getUTCMilliseconds() === 0

  if (ehLegadaEmMeiaNoiteUtc) {
    return {
      ano: data.getUTCFullYear(),
      mes: data.getUTCMonth() + 1,
      dia: data.getUTCDate(),
    }
  }

  const dataNoFuso = paraFusoAcademia(data)
  return {
    ano: dataNoFuso.getFullYear(),
    mes: dataNoFuso.getMonth() + 1,
    dia: dataNoFuso.getDate(),
  }
}

export function formatarDataCivilInput(data: Date): string {
  const { ano, mes, dia } = partesDataCivil(data)
  return `${ano.toString().padStart(4, "0")}-${mes.toString().padStart(2, "0")}-${dia
    .toString()
    .padStart(2, "0")}`
}

export function formatarDataCivil(data: Date): string {
  const { ano, mes, dia } = partesDataCivil(data)
  return `${dia.toString().padStart(2, "0")}/${mes.toString().padStart(2, "0")}/${ano
    .toString()
    .padStart(4, "0")}`
}

export function formatarDiaMesDataCivil(data: Date): string {
  const { mes, dia } = partesDataCivil(data)
  return `${dia.toString().padStart(2, "0")}/${mes.toString().padStart(2, "0")}`
}

export function chaveMesDiaDataCivil(data: Date): string {
  const { mes, dia } = partesDataCivil(data)
  return `${mes.toString().padStart(2, "0")}-${dia.toString().padStart(2, "0")}`
}

export function dataCivilParaDate(valor: string): Date {
  const data = valor.trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(data)) {
    return fromZonedTime(`${data}T12:00:00`, TIMEZONE)
  }
  return new Date(data)
}

export function formatarDataHora(data: Date): string {
  return formatInTimeZone(data, TIMEZONE, "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })
}

export function formatarHora(data: Date): string {
  return formatInTimeZone(data, TIMEZONE, "HH:mm", { locale: ptBR })
}

export function formatarDataExtenso(data: Date): string {
  return formatInTimeZone(data, TIMEZONE, "EEEE, dd 'de' MMMM", { locale: ptBR })
}

/** Converte um Date para o horário local da academia (para cálculos de dia/hora). */
export function paraFusoAcademia(data: Date): Date {
  return toZonedTime(data, TIMEZONE)
}

export function inicioDoDiaAcademia(data: Date): Date {
  const dia = formatInTimeZone(data, TIMEZONE, "yyyy-MM-dd")
  return fromZonedTime(`${dia}T00:00:00`, TIMEZONE)
}

export function fimExclusivoDoDiaAcademia(data: Date): Date {
  const amanha = addDays(paraFusoAcademia(data), 1)
  return fromZonedTime(`${format(amanha, "yyyy-MM-dd")}T00:00:00`, TIMEZONE)
}

/** Início da semana civil da academia (segunda-feira às 00:00). */
export function inicioDaSemanaAcademia(data: Date): Date {
  const dataLocal = paraFusoAcademia(data)
  const diasDesdeSegunda = (dataLocal.getDay() + 6) % 7
  const segunda = addDays(dataLocal, -diasDesdeSegunda)
  return fromZonedTime(`${format(segunda, "yyyy-MM-dd")}T00:00:00`, TIMEZONE)
}

/** Fim exclusivo da semana civil da academia (segunda-feira seguinte às 00:00). */
export function fimExclusivoDaSemanaAcademia(data: Date): Date {
  const proximaSegunda = addDays(paraFusoAcademia(inicioDaSemanaAcademia(data)), 7)
  return fromZonedTime(`${format(proximaSegunda, "yyyy-MM-dd")}T00:00:00`, TIMEZONE)
}

/** Formata uma duração em minutos como "1h30" / "45min" / "2h". */
export function formatarMinutos(minutos: number): string {
  const m = Math.max(0, Math.round(minutos))
  const horas = Math.floor(m / 60)
  const resto = m % 60
  if (horas === 0) return `${resto}min`
  if (resto === 0) return `${horas}h`
  return `${horas}h${resto.toString().padStart(2, "0")}`
}

/** Horas decimais (para totais "120h"). */
export function minutosParaHoras(minutos: number): number {
  return Math.round((minutos / 60) * 10) / 10
}

export function chaveCompetencia(data = new Date()): string {
  return format(paraFusoAcademia(data), "yyyy-MM")
}

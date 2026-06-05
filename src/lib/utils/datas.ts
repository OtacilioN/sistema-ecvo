import { format } from "date-fns"
import { ptBR } from "date-fns/locale"
import { formatInTimeZone, toZonedTime } from "date-fns-tz"

// Timezone padrão da academia (Brasil). Janelas de comparecimento, recorrência semanal
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

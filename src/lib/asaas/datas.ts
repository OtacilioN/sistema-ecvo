import { fromZonedTime } from "date-fns-tz"
import { dataCivilParaDate, TIMEZONE } from "@/lib/utils/datas"

export function interpretarDataAsaas(valor?: string | null): Date | null {
  const informado = valor?.trim()
  if (!informado) return null
  if (/^\d{4}-\d{2}-\d{2}$/.test(informado)) return dataCivilParaDate(informado)

  const normalizado = informado.includes("T") ? informado : informado.replace(" ", "T")
  const temFuso = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(normalizado)
  const data = temFuso ? new Date(normalizado) : fromZonedTime(normalizado, TIMEZONE)
  return Number.isNaN(data.getTime()) ? null : data
}

import type { StatusMensalidade } from "@prisma/client"
import { formatInTimeZone, fromZonedTime } from "date-fns-tz"
import { TIMEZONE } from "@/lib/utils/datas"

export const DIAS_CARENCIA_ADIMPLENCIA = 0

type Valor = number | string | { toString(): string }

export type MensalidadeAdimplencia = {
  status: StatusMensalidade
  vencimento: Date
  valor: Valor
  valorBase?: Valor | null
  valorComDesconto?: Valor | null
}

// Trabalha com dias civis da academia, inclusive em viradas de mês/ano e horário de verão.
function diaCivilUTC(data: Date): number {
  const [ano, mes, dia] = formatInTimeZone(data, TIMEZONE, "yyyy-MM-dd").split("-").map(Number)
  return Date.UTC(ano, mes - 1, dia)
}

export function resumoAdimplencia(mensalidade: MensalidadeAdimplencia, agora = new Date()) {
  const diaVencimento = diaCivilUTC(mensalidade.vencimento)
  const diaPerda = new Date(diaVencimento + (DIAS_CARENCIA_ADIMPLENCIA + 1) * 86_400_000)
  const perdeDescontoEm = fromZonedTime(`${diaPerda.toISOString().slice(0, 10)}T00:00:00`, TIMEZONE)
  const ultimoDiaComDesconto = new Date(perdeDescontoEm.getTime() - 1)
  const diasAtraso = Math.max(0, Math.round((diaCivilUTC(agora) - diaVencimento) / 86_400_000))
  const valorBase = Number(mensalidade.valorBase ?? mensalidade.valor)
  const valorComDesconto = Number(mensalidade.valorComDesconto ?? mensalidade.valor)
  const temDesconto =
    mensalidade.valorBase != null &&
    mensalidade.valorComDesconto != null &&
    valorBase > valorComDesconto
  const aberta = mensalidade.status === "EM_ABERTO" || mensalidade.status === "VENCIDA"
  const descontoAtivo = temDesconto && agora.getTime() < perdeDescontoEm.getTime()

  return {
    valorAtual:
      aberta && temDesconto
        ? descontoAtivo
          ? valorComDesconto
          : valorBase
        : Number(mensalidade.valor),
    valorBase,
    valorComDesconto,
    temDesconto,
    descontoAtivo,
    diasAtraso,
    perdeDescontoEm,
    ultimoDiaComDesconto,
  }
}

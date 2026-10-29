import { formatarDataInput } from "@/lib/utils/datas"

/** A competência permanece intacta mesmo quando a cobrança vence no mês seguinte. */
export function vencimentoDaCompetencia(
  competencia: string,
  diaVencimento: number,
  vencimentoMesSeguinte = false,
): Date {
  const [ano, mes] = competencia.split("-").map(Number)
  return new Date(Date.UTC(ano, mes - 1 + Number(vencimentoMesSeguinte), diaVencimento, 12))
}

export function vencimentoDoPagamentoInicial(recebidaEm: Date) {
  const dia = Number(formatarDataInput(recebidaEm).slice(-2))
  return { diaVencimento: dia > 28 ? 1 : dia, vencimentoMesSeguinte: dia > 28 }
}

export function rotuloVencimentoMensalidade(dia: number, vencimentoMesSeguinte = false) {
  return vencimentoMesSeguinte ? "Dia 01 do mês seguinte à referência" : `Dia ${dia}`
}

import "server-only"
import { fromZonedTime } from "date-fns-tz"
import { db } from "@/lib/db"
import type { DadosEvolucaoReceita, MesEvolucaoReceita } from "@/lib/financeiro/evolucao-receita"
import { chaveCompetencia, formatarDataInput, TIMEZONE } from "@/lib/utils/datas"

function mesRelativo(competencia: string, deslocamento: number): MesEvolucaoReceita {
  const [ano, mes] = competencia.split("-").map(Number)
  const data = new Date(Date.UTC(ano, mes - 1 + deslocamento, 1))
  const anoMes = `${data.getUTCFullYear()}-${String(data.getUTCMonth() + 1).padStart(2, "0")}`
  const diasNoMes = new Date(
    Date.UTC(data.getUTCFullYear(), data.getUTCMonth() + 1, 0),
  ).getUTCDate()
  return { competencia: anoMes, diasNoMes, recebidoPorDia: Array(diasNoMes).fill(0) }
}

/** Mesma base dos indicadores do painel: mensalidades pagas e reativações recebidas. */
export async function obterEvolucaoReceita(agora = new Date()): Promise<DadosEvolucaoReceita> {
  const competenciaAtual = chaveCompetencia(agora)
  const meses = Array.from({ length: 7 }, (_, indice) => mesRelativo(competenciaAtual, indice - 6))
  const inicio = fromZonedTime(`${meses[0].competencia}-01T00:00:00`, TIMEZONE)
  const [mensalidades, reativacoes, primeiraMensalidade, primeiraReativacao] = await Promise.all([
    db.mensalidade.findMany({
      where: { status: "PAGA", pagoEm: { gte: inicio, lte: agora } },
      select: { valor: true, pagoEm: true },
    }),
    db.cobrancaReativacaoAsaas.findMany({
      where: { status: "RECEBIDA", recebidaEmAsaas: { gte: inicio, lte: agora } },
      select: { valor: true, recebidaEmAsaas: true },
    }),
    db.mensalidade.findFirst({
      where: { status: "PAGA", pagoEm: { not: null, lte: agora } },
      orderBy: { pagoEm: "asc" },
      select: { pagoEm: true },
    }),
    db.cobrancaReativacaoAsaas.findFirst({
      where: { status: "RECEBIDA", recebidaEmAsaas: { not: null, lte: agora } },
      orderBy: { recebidaEmAsaas: "asc" },
      select: { recebidaEmAsaas: true },
    }),
  ])
  const mesesPorCompetencia = new Map(meses.map((mes) => [mes.competencia, mes]))
  function adicionar(valor: unknown, data: Date | null) {
    if (!data || data > agora || data < inicio) return
    const dataCivil = formatarDataInput(data)
    const mes = mesesPorCompetencia.get(dataCivil.slice(0, 7))
    if (!mes) return
    const indice = Number(dataCivil.slice(8, 10)) - 1
    mes.recebidoPorDia[indice] =
      (Math.round(mes.recebidoPorDia[indice] * 100) + Math.round(Number(valor) * 100)) / 100
  }
  for (const mensalidade of mensalidades) adicionar(mensalidade.valor, mensalidade.pagoEm)
  for (const reativacao of reativacoes) adicionar(reativacao.valor, reativacao.recebidaEmAsaas)

  const primeirasDatas = [primeiraMensalidade?.pagoEm, primeiraReativacao?.recebidaEmAsaas]
    .filter((data): data is Date => Boolean(data))
    .sort((a, b) => a.getTime() - b.getTime())
  return {
    competenciaAtual,
    diaAtual: Number(formatarDataInput(agora).slice(8, 10)),
    primeiraCompetenciaComRecebimento: primeirasDatas[0]
      ? chaveCompetencia(primeirasDatas[0])
      : null,
    meses,
  }
}

import "server-only"
import { Prisma } from "@prisma/client"
import { fromZonedTime } from "date-fns-tz"
import { STATUS_ALUNO_OPERACIONAIS } from "@/lib/alunos/status"
import { db } from "@/lib/db"
import { resumoAdimplencia } from "@/lib/financeiro/adimplencia"
import type { DadosEvolucaoReceita, MesEvolucaoReceita } from "@/lib/financeiro/evolucao-receita"
import {
  chaveCompetencia,
  formatarDataInput,
  inicioDoDiaAcademia,
  obterIntervaloMes,
  TIMEZONE,
} from "@/lib/utils/datas"

function mesRelativo(competencia: string, deslocamento: number): MesEvolucaoReceita {
  const [ano, mes] = competencia.split("-").map(Number)
  const data = new Date(Date.UTC(ano, mes - 1 + deslocamento, 1))
  const anoMes = `${data.getUTCFullYear()}-${String(data.getUTCMonth() + 1).padStart(2, "0")}`
  const diasNoMes = new Date(
    Date.UTC(data.getUTCFullYear(), data.getUTCMonth() + 1, 0),
  ).getUTCDate()
  return { competencia: anoMes, diasNoMes, recebidoPorDia: Array(diasNoMes).fill(0) }
}

/** Recebimentos confirmados do painel e cenário de mensalidades pagas no vencimento. */
export async function obterEvolucaoReceita(agora = new Date()): Promise<DadosEvolucaoReceita> {
  const competenciaAtual = chaveCompetencia(agora)
  const meses = Array.from({ length: 7 }, (_, indice) => mesRelativo(competenciaAtual, indice - 6))
  const inicio = fromZonedTime(`${meses[0].competencia}-01T00:00:00`, TIMEZONE)
  const inicioHoje = inicioDoDiaAcademia(agora)
  const { inicioProximoMes } = obterIntervaloMes(agora)
  // Uma baixa durante a consulta não pode somar a mesma mensalidade ao recebido
  // e à projeção. Todas as leituras usam a mesma fotografia do banco.
  const [
    mensalidades,
    reativacoes,
    primeiraMensalidade,
    primeiraReativacao,
    mensalidadesPrevistas,
  ] = await db.$transaction(
    [
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
      db.mensalidade.findMany({
        where: {
          status: "EM_ABERTO",
          pagoEm: null,
          vencimento: { gte: inicioHoje, lt: inicioProximoMes },
          aluno: { status: { in: [...STATUS_ALUNO_OPERACIONAIS] } },
        },
        select: {
          status: true,
          vencimento: true,
          valor: true,
          valorBase: true,
          valorComDesconto: true,
        },
      }),
    ],
    { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
  )
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

  const previsaoPorDia: number[] = Array(meses[meses.length - 1].diasNoMes).fill(0)
  let quantidadeMensalidadesPrevistas = 0
  for (const mensalidade of mensalidadesPrevistas) {
    if (
      mensalidade.status !== "EM_ABERTO" ||
      mensalidade.vencimento < inicioHoje ||
      mensalidade.vencimento >= inicioProximoMes
    )
      continue
    const indice = Number(formatarDataInput(mensalidade.vencimento).slice(8, 10)) - 1
    const valorPontual = resumoAdimplencia(mensalidade, mensalidade.vencimento).valorAtual
    previsaoPorDia[indice] =
      (Math.round(previsaoPorDia[indice] * 100) + Math.round(valorPontual * 100)) / 100
    quantidadeMensalidadesPrevistas += 1
  }

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
    previsaoPorDia,
    quantidadeMensalidadesPrevistas,
  }
}

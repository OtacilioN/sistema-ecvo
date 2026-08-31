import "server-only"
import type { Prisma } from "@prisma/client"
import { STATUS_ALUNO_OPERACIONAIS } from "@/lib/alunos/status"
import { db } from "@/lib/db"
import { formatarDataInput } from "@/lib/utils/datas"

type Cliente = Prisma.TransactionClient | typeof db

export type PresencaOfensiva = {
  alunoId: string
  modalidadeId: string
  dia: string
}

export type EstadoOfensiva = {
  alunoId: string
  modalidadeId: string
  diasAtuais: number
  maximoDias: number
  inicioAtual: string | null
  ultimoTreino: string | null
}

export type LinhaRankingOfensiva = {
  alunoId: string
  nome: string
  posicao: number
  diasAtuais: number
  maximoDias: number
  modalidadeId: string | null
  modalidadeNome: string | null
}

type AlunoRanking = {
  id: string
  nome: string
  modalidades: Array<{ id: string; nome: string }>
}

const UM_DIA_MS = 86_400_000

// Marco civil do ranking atual. Check-ins anteriores permanecem no histórico de presença/horas,
// mas não formam dias ativos, ofensivas ou recordes neste novo ciclo.
export const INICIO_RANKING_OFENSIVAS = "2026-08-31"

function ordinalDia(dia: string): number {
  const [ano, mes, data] = dia.split("-").map(Number)
  return Date.UTC(ano, mes - 1, data) / UM_DIA_MS
}

function diasInclusivos(inicio: string, fim: string): number {
  return ordinalDia(fim) - ordinalDia(inicio) + 1
}

function chaveEstado(alunoId: string, modalidadeId: string): string {
  return `${alunoId}\u0000${modalidadeId}`
}

function dataCivilPersistida(dia: string | null): Date | null {
  return dia ? new Date(`${dia}T00:00:00.000Z`) : null
}

/**
 * Calcula ofensivas a partir da fonte canônica: dias civis com Checkin VALIDO.
 * Um dia sem qualquer presença na modalidade é neutro. O dia de hoje ainda não
 * quebra a sequência de quem pode treinar em um horário posterior.
 */
export function calcularOfensivas(
  presencasInformadas: PresencaOfensiva[],
  hoje: string,
): EstadoOfensiva[] {
  const presencasUnicas = new Map<string, PresencaOfensiva>()
  for (const presenca of presencasInformadas) {
    if (presenca.dia < INICIO_RANKING_OFENSIVAS || presenca.dia > hoje) continue
    presencasUnicas.set(
      `${chaveEstado(presenca.alunoId, presenca.modalidadeId)}\u0000${presenca.dia}`,
      presenca,
    )
  }

  const diasAtivosPorModalidade = new Map<string, Set<string>>()
  const diasPorAlunoModalidade = new Map<string, Set<string>>()
  const pares = new Map<string, { alunoId: string; modalidadeId: string }>()

  for (const presenca of presencasUnicas.values()) {
    const diasAtivos = diasAtivosPorModalidade.get(presenca.modalidadeId) ?? new Set<string>()
    diasAtivos.add(presenca.dia)
    diasAtivosPorModalidade.set(presenca.modalidadeId, diasAtivos)

    const chave = chaveEstado(presenca.alunoId, presenca.modalidadeId)
    const diasAluno = diasPorAlunoModalidade.get(chave) ?? new Set<string>()
    diasAluno.add(presenca.dia)
    diasPorAlunoModalidade.set(chave, diasAluno)
    pares.set(chave, { alunoId: presenca.alunoId, modalidadeId: presenca.modalidadeId })
  }

  const resultados: EstadoOfensiva[] = []
  for (const [chave, par] of pares) {
    const diasAtivos = Array.from(diasAtivosPorModalidade.get(par.modalidadeId) ?? []).sort()
    const diasAluno = diasPorAlunoModalidade.get(chave) ?? new Set<string>()
    let inicioAtual: string | null = null
    let ultimoTreino: string | null = null
    let diasAtuais = 0
    let maximoDias = 0

    for (const dia of diasAtivos) {
      if (diasAluno.has(dia)) {
        inicioAtual ??= dia
        ultimoTreino = dia
        diasAtuais = diasInclusivos(inicioAtual, dia)
        maximoDias = Math.max(maximoDias, diasAtuais)
      } else if (dia < hoje) {
        inicioAtual = null
        diasAtuais = 0
      }
    }

    resultados.push({
      ...par,
      diasAtuais,
      maximoDias,
      inicioAtual,
      ultimoTreino,
    })
  }

  return resultados
}

function presencasDosCheckins(
  checkins: Array<{
    alunoId: string
    aula: { inicio: Date }
    movimentos: Array<{ modalidadeId: string }>
  }>,
): PresencaOfensiva[] {
  return checkins.flatMap((checkin) => {
    const movimento = checkin.movimentos[0]
    return movimento
      ? [
          {
            alunoId: checkin.alunoId,
            modalidadeId: movimento.modalidadeId,
            dia: formatarDataInput(checkin.aula.inicio),
          },
        ]
      : []
  })
}

async function buscarPresencas(
  cliente: Cliente,
  params: { modalidadeId?: string; apenasAlunosOperacionais?: boolean } = {},
) {
  const checkins = await cliente.checkin.findMany({
    where: {
      status: "VALIDO",
      ...(params.apenasAlunosOperacionais
        ? {
            aluno: {
              status: { in: [...STATUS_ALUNO_OPERACIONAIS] },
              usuario: { ativo: true },
            },
          }
        : {}),
      movimentos: {
        some: {
          tipo: "CREDITO",
          ...(params.modalidadeId ? { modalidadeId: params.modalidadeId } : {}),
        },
      },
    },
    select: {
      alunoId: true,
      aula: { select: { inicio: true } },
      movimentos: {
        where: {
          tipo: "CREDITO",
          ...(params.modalidadeId ? { modalidadeId: params.modalidadeId } : {}),
        },
        orderBy: { criadoEm: "asc" },
        take: 1,
        select: { modalidadeId: true },
      },
    },
  })

  return presencasDosCheckins(checkins)
}

/** Recalcula e materializa uma modalidade inteira, inclusive após correções retroativas. */
export async function sincronizarOfensivasDaModalidade(
  cliente: Cliente,
  params: { modalidadeId: string; agora?: Date },
) {
  const hoje = formatarDataInput(params.agora ?? new Date())
  const presencas = await buscarPresencas(cliente, { modalidadeId: params.modalidadeId })
  const estados = calcularOfensivas(presencas, hoje)
  const alunoIdsCalculados = estados.map((estado) => estado.alunoId)

  await cliente.ofensivaTreino.updateMany({
    where: {
      modalidadeId: params.modalidadeId,
      ...(alunoIdsCalculados.length > 0 ? { alunoId: { notIn: alunoIdsCalculados } } : {}),
    },
    data: {
      diasAtuais: 0,
      maximoDias: 0,
      inicioAtualEm: null,
      ultimoTreinoEm: null,
    },
  })

  for (const estado of estados) {
    await cliente.ofensivaTreino.upsert({
      where: {
        alunoId_modalidadeId: {
          alunoId: estado.alunoId,
          modalidadeId: estado.modalidadeId,
        },
      },
      create: {
        alunoId: estado.alunoId,
        modalidadeId: estado.modalidadeId,
        diasAtuais: estado.diasAtuais,
        maximoDias: estado.maximoDias,
        inicioAtualEm: dataCivilPersistida(estado.inicioAtual),
        ultimoTreinoEm: dataCivilPersistida(estado.ultimoTreino),
      },
      update: {
        diasAtuais: estado.diasAtuais,
        maximoDias: estado.maximoDias,
        inicioAtualEm: dataCivilPersistida(estado.inicioAtual),
        ultimoTreinoEm: dataCivilPersistida(estado.ultimoTreino),
      },
    })
  }

  return { modalidadeId: params.modalidadeId, ofensivasAtualizadas: estados.length }
}

/** Fechamento diário idempotente e backfill do histórico existente. */
export async function sincronizarTodasOfensivas(params: { agora?: Date } = {}) {
  const [modalidadesComCredito, modalidadesMaterializadas] = await Promise.all([
    db.movimentoHoras.findMany({
      where: { tipo: "CREDITO", checkin: { status: "VALIDO" } },
      distinct: ["modalidadeId"],
      select: { modalidadeId: true },
    }),
    db.ofensivaTreino.findMany({
      distinct: ["modalidadeId"],
      select: { modalidadeId: true },
    }),
  ])
  const modalidadeIds = Array.from(
    new Set([
      ...modalidadesComCredito.map((item) => item.modalidadeId),
      ...modalidadesMaterializadas.map((item) => item.modalidadeId),
    ]),
  )

  const resultados = []
  for (const modalidadeId of modalidadeIds) {
    const resultado = await db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "Modalidade" WHERE "id" = ${modalidadeId} FOR UPDATE`
      return sincronizarOfensivasDaModalidade(tx, { modalidadeId, agora: params.agora })
    })
    resultados.push(resultado)
  }

  return {
    modalidadesAtualizadas: resultados.length,
    ofensivasAtualizadas: resultados.reduce(
      (total, resultado) => total + resultado.ofensivasAtualizadas,
      0,
    ),
  }
}

function nomePublico(nomeCompleto: string): string {
  const partes = nomeCompleto.trim().split(/\s+/).filter(Boolean)
  if (partes.length <= 1) return partes[0] ?? "Aluno"
  return `${partes[0]} ${partes.at(-1)?.charAt(0).toUpperCase()}.`
}

function compararLinhas(a: LinhaRankingOfensiva, b: LinhaRankingOfensiva): number {
  return (
    b.maximoDias - a.maximoDias ||
    b.diasAtuais - a.diasAtuais ||
    a.nome.localeCompare(b.nome, "pt-BR") ||
    a.alunoId.localeCompare(b.alunoId)
  )
}

function atribuirPosicoes(linhas: LinhaRankingOfensiva[]): LinhaRankingOfensiva[] {
  let posicao = 0
  let anterior: LinhaRankingOfensiva | undefined
  return linhas.sort(compararLinhas).map((linha, indice) => {
    if (!anterior || anterior.maximoDias !== linha.maximoDias) {
      posicao = indice + 1
    }
    anterior = linha
    return { ...linha, posicao }
  })
}

export function montarRankingOfensivas(params: {
  alunos: AlunoRanking[]
  estados: EstadoOfensiva[]
  modalidadeId?: string
}): LinhaRankingOfensiva[] {
  const estadoPorPar = new Map(
    params.estados.map((estado) => [chaveEstado(estado.alunoId, estado.modalidadeId), estado]),
  )
  const linhas: LinhaRankingOfensiva[] = []

  for (const aluno of params.alunos) {
    const modalidades = params.modalidadeId
      ? aluno.modalidades.filter((modalidade) => modalidade.id === params.modalidadeId)
      : aluno.modalidades
    if (params.modalidadeId && modalidades.length === 0) continue

    const candidatas = modalidades
      .map((modalidade) => ({
        modalidade,
        estado: estadoPorPar.get(chaveEstado(aluno.id, modalidade.id)),
      }))
      .sort(
        (a, b) =>
          (b.estado?.maximoDias ?? 0) - (a.estado?.maximoDias ?? 0) ||
          (b.estado?.diasAtuais ?? 0) - (a.estado?.diasAtuais ?? 0) ||
          a.modalidade.nome.localeCompare(b.modalidade.nome, "pt-BR"),
      )
    const melhor = candidatas[0]

    linhas.push({
      alunoId: aluno.id,
      nome: nomePublico(aluno.nome),
      posicao: 0,
      diasAtuais: melhor?.estado?.diasAtuais ?? 0,
      maximoDias: melhor?.estado?.maximoDias ?? 0,
      modalidadeId: melhor?.modalidade.id ?? null,
      modalidadeNome: melhor?.modalidade.nome ?? null,
    })
  }

  return atribuirPosicoes(linhas)
}

export async function listarRankingOfensivas(params: {
  alunoAtualId: string
  modalidadeId?: string
  agora?: Date
}) {
  const [alunosBanco, modalidades, presencas] = await Promise.all([
    db.aluno.findMany({
      where: {
        status: { in: [...STATUS_ALUNO_OPERACIONAIS] },
        usuario: { ativo: true },
      },
      select: {
        id: true,
        usuario: { select: { nome: true } },
        modalidades: {
          where: { ativa: true },
          orderBy: { nome: "asc" },
          select: { id: true, nome: true },
        },
      },
    }),
    db.modalidade.findMany({
      where: { ativa: true },
      orderBy: { nome: "asc" },
      select: { id: true, nome: true },
    }),
    buscarPresencas(db, { apenasAlunosOperacionais: true }),
  ])
  const alunos = alunosBanco.map((aluno) => ({
    id: aluno.id,
    nome: aluno.usuario.nome,
    modalidades: aluno.modalidades,
  }))
  const hoje = formatarDataInput(params.agora ?? new Date())
  const estados = calcularOfensivas(presencas, hoje)
  const filtroValido = modalidades.some((modalidade) => modalidade.id === params.modalidadeId)
    ? params.modalidadeId
    : undefined
  const ranking = montarRankingOfensivas({ alunos, estados, modalidadeId: filtroValido })
  const rankingGeral = montarRankingOfensivas({ alunos, estados })
  const alunoAtual = alunos.find((aluno) => aluno.id === params.alunoAtualId)
  const estadosAluno = alunoAtual
    ? alunoAtual.modalidades.map((modalidade) => {
        const estado = estados.find(
          (item) => item.alunoId === alunoAtual.id && item.modalidadeId === modalidade.id,
        )
        return {
          modalidadeId: modalidade.id,
          modalidadeNome: modalidade.nome,
          diasAtuais: estado?.diasAtuais ?? 0,
          maximoDias: estado?.maximoDias ?? 0,
        }
      })
    : []

  return {
    modalidades,
    modalidadeId: filtroValido,
    ranking,
    linhaAlunoAtual: ranking.find((linha) => linha.alunoId === params.alunoAtualId) ?? null,
    linhaAlunoGeral: rankingGeral.find((linha) => linha.alunoId === params.alunoAtualId) ?? null,
    estadosAluno,
  }
}

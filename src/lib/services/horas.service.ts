import "server-only"
import type { Prisma } from "@prisma/client"
import { db } from "@/lib/db"
import { registrarLog } from "@/lib/services/auditoria.service"

// Serviço de HORAS — o livro-razão (ledger) append-only de MovimentoHoras (RF-030..039).
// Regra de ouro: NUNCA se apaga ou edita um movimento. O total é sempre SUM(minutos).
// Um CREDITO (>0) nasce de um check-in válido; um ESTORNO (<0) o reverte; AJUSTE_MANUAL (±)
// é lançado pelo gestor. Toda função de mutação aceita um TransactionClient para participar
// da mesma transação da operação que a originou (ex.: estorno + LogAuditoria na invalidação).

// ───────────────────────── Lógica pura (testável sem banco) ─────────────────────────

export type MovimentoMin = { minutos: number; modalidadeId: string }

/** Minutos a estornar de um crédito: o simétrico negativo (RF-035). */
export function minutosDeEstorno(creditoMinutos: number): number {
  return -Math.abs(creditoMinutos)
}

/** Total geral de minutos a partir do ledger (RF-032). */
export function totalMinutos(movimentos: MovimentoMin[]): number {
  return movimentos.reduce((soma, m) => soma + m.minutos, 0)
}

/** Total de minutos por modalidade (RF-033). */
export function totaisPorModalidade(movimentos: MovimentoMin[]): Map<string, number> {
  const mapa = new Map<string, number>()
  for (const m of movimentos) {
    mapa.set(m.modalidadeId, (mapa.get(m.modalidadeId) ?? 0) + m.minutos)
  }
  return mapa
}

/** Marco das 10 mil horas (RF-036): meta em minutos. */
export const META_DEZ_MIL_HORAS_MIN = 10_000 * 60

/** Marcos intermediários de horas (RF-037), em horas. */
export const MARCOS_HORAS = [10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10_000] as const

/** Progresso rumo às 10 mil horas (RF-036): fração de 0 a 1. */
export function progressoDezMil(minutos: number): number {
  if (minutos <= 0) return 0
  return Math.min(1, minutos / META_DEZ_MIL_HORAS_MIN)
}

/** Próximo marco (em horas) ainda não atingido, ou null se já passou de 10 mil (RF-037). */
export function proximoMarco(minutos: number): number | null {
  const horas = minutos / 60
  return MARCOS_HORAS.find((marco) => marco > horas) ?? null
}

export function podeAjustarHoras(params: {
  minutos: number
  motivo: string
  alunoModalidadeIds: string[]
  modalidadeId: string
}): { ok: true } | { ok: false; motivo: string } {
  if (!Number.isInteger(params.minutos) || params.minutos === 0) {
    return { ok: false, motivo: "Informe minutos inteiros diferentes de zero." }
  }
  if (params.motivo.trim().length < 5) {
    return { ok: false, motivo: "Informe o motivo do ajuste." }
  }
  if (!params.alunoModalidadeIds.includes(params.modalidadeId)) {
    return { ok: false, motivo: "Aluno não vinculado à modalidade informada." }
  }
  return { ok: true }
}

// ───────────────────────── Operações no banco ─────────────────────────

type Cliente = Prisma.TransactionClient | typeof db

/**
 * Credita horas de um check-in válido (RF-023/034): minutos = duração da aula.
 * Idempotência de duplicidade é garantida no nível do Checkin (@@unique alunoId+aulaId).
 */
export function creditarPorCheckin(
  cliente: Cliente,
  params: { alunoId: string; modalidadeId: string; checkinId: string; minutos: number },
) {
  return cliente.movimentoHoras.create({
    data: {
      alunoId: params.alunoId,
      modalidadeId: params.modalidadeId,
      checkinId: params.checkinId,
      tipo: "CREDITO",
      minutos: Math.abs(params.minutos),
    },
  })
}

/**
 * Estorna TODOS os créditos vivos de um check-in (RF-035), lançando movimentos negativos.
 * Não apaga nada — apenas adiciona ESTORNOs que zeram os créditos. Deve rodar na MESMA
 * transação que invalida o check-in e grava o LogAuditoria.
 */
export async function estornarCheckin(
  cliente: Cliente,
  params: { checkinId: string; autorId?: string; motivo?: string },
) {
  const creditos = await cliente.movimentoHoras.findMany({
    where: { checkinId: params.checkinId, tipo: "CREDITO" },
  })
  if (creditos.length === 0) return []

  return Promise.all(
    creditos.map((credito) =>
      cliente.movimentoHoras.create({
        data: {
          alunoId: credito.alunoId,
          modalidadeId: credito.modalidadeId,
          checkinId: params.checkinId,
          tipo: "ESTORNO",
          minutos: minutosDeEstorno(credito.minutos),
          estornaMovimentoId: credito.id,
          autorId: params.autorId,
          motivo: params.motivo,
        },
      }),
    ),
  )
}

/** Ajuste manual de horas pelo gestor (RF-038): modalidade, quantidade (±), motivo, autor. */
export function ajustarManual(
  cliente: Cliente,
  params: {
    alunoId: string
    modalidadeId: string
    minutos: number
    motivo: string
    autorId: string
  },
) {
  return cliente.movimentoHoras.create({
    data: {
      alunoId: params.alunoId,
      modalidadeId: params.modalidadeId,
      tipo: "AJUSTE_MANUAL",
      minutos: Math.trunc(params.minutos),
      motivo: params.motivo,
      autorId: params.autorId,
    },
  })
}

export async function registrarAjusteManualHoras(params: {
  alunoId: string
  modalidadeId: string
  minutos: number
  motivo: string
  autorId: string
}) {
  const [aluno, modalidade] = await Promise.all([
    db.aluno.findUnique({
      where: { id: params.alunoId },
      select: {
        id: true,
        usuario: { select: { nome: true } },
        modalidades: { select: { id: true } },
      },
    }),
    db.modalidade.findUnique({
      where: { id: params.modalidadeId },
      select: { id: true, nome: true, ativa: true },
    }),
  ])

  if (!aluno) return { ok: false as const, motivo: "Aluno não encontrado." }
  if (!modalidade?.ativa)
    return { ok: false as const, motivo: "Modalidade não encontrada ou inativa." }

  const regra = podeAjustarHoras({
    minutos: params.minutos,
    motivo: params.motivo,
    alunoModalidadeIds: aluno.modalidades.map((item) => item.id),
    modalidadeId: params.modalidadeId,
  })
  if (!regra.ok) return { ok: false as const, motivo: regra.motivo }

  const movimento = await db.$transaction(async (tx) => {
    const criado = await ajustarManual(tx, params)

    await registrarLog(
      {
        autorId: params.autorId,
        acao: "AJUSTE_HORAS",
        entidade: "MovimentoHoras",
        entidadeId: criado.id,
        valorNovo: {
          alunoId: params.alunoId,
          aluno: aluno.usuario.nome,
          modalidadeId: params.modalidadeId,
          modalidade: modalidade.nome,
          minutos: criado.minutos,
          tipo: criado.tipo,
        },
        justificativa: params.motivo,
      },
      tx,
    )

    return criado
  })

  return { ok: true as const, movimento }
}

/** Resumo de horas de um aluno: total geral e por modalidade (RF-032/033). */
export async function resumoHoras(alunoId: string) {
  const [aluno, movimentos] = await Promise.all([
    db.aluno.findUnique({
      where: { id: alunoId },
      select: { modalidades: { select: { id: true, nome: true }, orderBy: { nome: "asc" } } },
    }),
    db.movimentoHoras.findMany({
      where: { alunoId },
      select: { minutos: true, modalidadeId: true, modalidade: { select: { nome: true } } },
    }),
  ])

  const totalGeralMin = totalMinutos(movimentos)
  const porModalidade = totaisPorModalidade(movimentos)
  const nomePorId = new Map([
    ...(aluno?.modalidades.map((m) => [m.id, m.nome] as const) ?? []),
    ...movimentos.map((m) => [m.modalidadeId, m.modalidade.nome] as const),
  ])
  const modalidadeIds = new Set([
    ...(aluno?.modalidades.map((m) => m.id) ?? []),
    ...movimentos.map((m) => m.modalidadeId),
  ])

  return {
    totalGeralMin,
    progresso: progressoDezMil(totalGeralMin),
    proximoMarcoHoras: proximoMarco(totalGeralMin),
    porModalidade: [...modalidadeIds]
      .map((modalidadeId) => ({
        modalidadeId,
        nome: nomePorId.get(modalidadeId) ?? "—",
        minutos: porModalidade.get(modalidadeId) ?? 0,
        proximoMarcoHoras: proximoMarco(porModalidade.get(modalidadeId) ?? 0),
      }))
      .sort((a, b) => b.minutos - a.minutos),
  }
}

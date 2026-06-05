import "server-only"
import { fromZonedTime } from "date-fns-tz"
import { db } from "@/lib/db"
import { registrarLog } from "@/lib/services/auditoria.service"
import { criarNotificacao } from "@/lib/services/notificacao.service"
import { TIMEZONE } from "@/lib/utils/datas"

// Serviço de TURMAS e AULAS (RF-010/011/012).
// Turma = grade recorrente (diaSemana + horário) OU evento único (ehEvento).
// Aula = ocorrência datada concreta de uma turma. A geração respeita o fuso da academia.

// ───────────────────────── Lógica pura (testável sem banco) ─────────────────────────

/** Converte "19:00" em { horas, minutos }. Lança em formato inválido. */
export function parseHoraMin(hhmm: string): { horas: number; minutos: number } {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim())
  if (!m) throw new Error(`Hora inválida: ${hhmm}`)
  const horas = Number(m[1])
  const minutos = Number(m[2])
  if (horas > 23 || minutos > 59) throw new Error(`Hora inválida: ${hhmm}`)
  return { horas, minutos }
}

/** Duração em minutos entre dois horários "HH:mm" (suporta virada de meia-noite). */
export function duracaoEntreHoras(horaInicio: string, horaFim: string): number {
  const ini = parseHoraMin(horaInicio)
  const fim = parseHoraMin(horaFim)
  let minutos = fim.horas * 60 + fim.minutos - (ini.horas * 60 + ini.minutos)
  if (minutos <= 0) minutos += 24 * 60
  return minutos
}

export type Ocorrencia = { inicio: Date; fim: Date; duracaoMin: number }

/**
 * Gera as ocorrências (aulas) de uma turma recorrente entre [de, ate], no dia da semana
 * informado e no horário de parede do fuso da academia. Função pura/determinística.
 */
export function gerarOcorrencias(params: {
  diaSemana: number // 0=domingo .. 6=sábado
  horaInicio: string
  horaFim: string
  de: Date
  ate: Date
}): Ocorrencia[] {
  const { horas: hi, minutos: mi } = parseHoraMin(params.horaInicio)
  const duracaoMin = duracaoEntreHoras(params.horaInicio, params.horaFim)

  const ocorrencias: Ocorrencia[] = []
  // Itera dia a dia em UTC (apenas para varrer o calendário); o instante real usa o fuso.
  const cursor = new Date(
    Date.UTC(params.de.getUTCFullYear(), params.de.getUTCMonth(), params.de.getUTCDate()),
  )
  const limite = params.ate.getTime()

  while (cursor.getTime() <= limite) {
    if (cursor.getUTCDay() === params.diaSemana) {
      const y = cursor.getUTCFullYear()
      const mo = String(cursor.getUTCMonth() + 1).padStart(2, "0")
      const d = String(cursor.getUTCDate()).padStart(2, "0")
      const hh = String(hi).padStart(2, "0")
      const mm = String(mi).padStart(2, "0")
      // Interpreta "YYYY-MM-DD HH:mm" como horário de parede de São Paulo → instante UTC.
      const inicio = fromZonedTime(`${y}-${mo}-${d}T${hh}:${mm}:00`, TIMEZONE)
      const fim = new Date(inicio.getTime() + duracaoMin * 60_000)
      if (inicio.getTime() >= params.de.getTime() && inicio.getTime() <= limite) {
        ocorrencias.push({ inicio, fim, duracaoMin })
      }
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  }
  return ocorrencias
}

export function validarDuracaoAula(params: { inicio: Date; fim: Date }):
  | {
      ok: true
      duracaoMin: number
    }
  | { ok: false; motivo: string } {
  const duracaoMin = Math.round((params.fim.getTime() - params.inicio.getTime()) / 60_000)
  if (!Number.isFinite(duracaoMin) || duracaoMin <= 0) {
    return { ok: false, motivo: "O fim deve ser posterior ao início." }
  }
  if (duracaoMin > 24 * 60) {
    return { ok: false, motivo: "A aula não pode exceder 24 horas." }
  }
  return { ok: true, duracaoMin }
}

function idsUnicos(ids: Array<string | null | undefined>): string[] {
  return [...new Set(ids.filter((id): id is string => Boolean(id)))]
}

async function professorHabilitadoNaModalidade(
  professorId: string | null | undefined,
  modalidadeId: string,
): Promise<boolean> {
  if (!professorId) return true
  const professor = await db.professor.findUnique({
    where: { id: professorId },
    select: { ativo: true, modalidades: { select: { id: true } } },
  })
  return Boolean(professor?.ativo && professor.modalidades.some((m) => m.id === modalidadeId))
}

function serializarDadosTurma(turma: {
  modalidadeId: string
  professorId: string | null
  nome: string | null
  capacidade: number
  local: string | null
  nivel: string | null
  ativa: boolean
}) {
  return {
    modalidadeId: turma.modalidadeId,
    professorId: turma.professorId,
    nome: turma.nome,
    capacidade: turma.capacidade,
    local: turma.local,
    nivel: turma.nivel,
    ativa: turma.ativa,
  }
}

// ───────────────────────── Operações no banco ─────────────────────────

/** Cria uma turma recorrente e já gera as aulas das próximas `semanas` (RF-010/011). */
export async function criarTurmaRecorrente(params: {
  modalidadeId: string
  professorId?: string | null
  autorId: string
  nome?: string | null
  diaSemana: number
  horaInicio: string
  horaFim: string
  capacidade?: number
  local?: string | null
  nivel?: string | null
  semanas?: number
}) {
  const habilitado = await professorHabilitadoNaModalidade(params.professorId, params.modalidadeId)
  if (!habilitado) {
    return { ok: false as const, motivo: "Professor não habilitado nesta modalidade." }
  }

  const duracaoMin = duracaoEntreHoras(params.horaInicio, params.horaFim)
  const turma = await db.$transaction(async (tx) => {
    const criada = await tx.turma.create({
      data: {
        modalidadeId: params.modalidadeId,
        professorId: params.professorId ?? null,
        nome: params.nome ?? null,
        diaSemana: params.diaSemana,
        horaInicio: params.horaInicio,
        horaFim: params.horaFim,
        duracaoMin,
        capacidade: params.capacidade ?? 0,
        local: params.local ?? null,
        nivel: params.nivel ?? null,
      },
      include: {
        modalidade: { select: { nome: true } },
        professor: { select: { usuario: { select: { nome: true } } } },
      },
    })

    await registrarLog(
      {
        autorId: params.autorId,
        acao: "TURMA_CRIADA",
        entidade: "Turma",
        entidadeId: criada.id,
        valorNovo: {
          nome: criada.nome,
          modalidadeId: criada.modalidadeId,
          modalidade: criada.modalidade.nome,
          professorId: criada.professorId,
          professor: criada.professor?.usuario.nome ?? null,
          diaSemana: criada.diaSemana,
          horaInicio: criada.horaInicio,
          horaFim: criada.horaFim,
          duracaoMin: criada.duracaoMin,
          capacidade: criada.capacidade,
          local: criada.local,
          nivel: criada.nivel,
        },
      },
      tx,
    )

    return criada
  })
  const criadas = await gerarAulasFuturas(turma.id, params.semanas ?? 8)
  return { ok: true as const, turma, aulasCriadas: criadas }
}

export async function atualizarDadosTurmaRecorrente(params: {
  turmaId: string
  professorId?: string | null
  autorId: string
  nome?: string | null
  capacidade: number
  local?: string | null
  nivel?: string | null
  ativa: boolean
}) {
  const atual = await db.turma.findUnique({
    where: { id: params.turmaId },
    select: {
      id: true,
      modalidadeId: true,
      professorId: true,
      nome: true,
      capacidade: true,
      local: true,
      nivel: true,
      ativa: true,
      ehEvento: true,
    },
  })
  if (!atual || atual.ehEvento) return { ok: false as const, motivo: "Turma não encontrada." }

  const habilitado = await professorHabilitadoNaModalidade(params.professorId, atual.modalidadeId)
  if (!habilitado) {
    return { ok: false as const, motivo: "Professor não habilitado nesta modalidade." }
  }

  const turma = await db.$transaction(async (tx) => {
    const atualizada = await tx.turma.update({
      where: { id: atual.id },
      data: {
        professorId: params.professorId ?? null,
        nome: params.nome ?? null,
        capacidade: params.capacidade,
        local: params.local ?? null,
        nivel: params.nivel ?? null,
        ativa: params.ativa,
      },
      select: {
        id: true,
        modalidadeId: true,
        professorId: true,
        nome: true,
        capacidade: true,
        local: true,
        nivel: true,
        ativa: true,
      },
    })

    await registrarLog(
      {
        autorId: params.autorId,
        acao: "TURMA_ATUALIZADA",
        entidade: "Turma",
        entidadeId: atualizada.id,
        valorAntigo: serializarDadosTurma(atual),
        valorNovo: serializarDadosTurma(atualizada),
      },
      tx,
    )

    return atualizada
  })

  return { ok: true as const, turma }
}

/** Cria um evento único / aula avulsa (RF-012). */
export async function criarEvento(params: {
  modalidadeId: string
  professorId?: string | null
  autorId: string
  nome: string
  inicio: Date
  fim: Date
  capacidade?: number
  local?: string | null
}) {
  const duracao = validarDuracaoAula({ inicio: params.inicio, fim: params.fim })
  if (!duracao.ok) return { ok: false as const, motivo: duracao.motivo }

  const habilitado = await professorHabilitadoNaModalidade(params.professorId, params.modalidadeId)
  if (!habilitado) {
    return { ok: false as const, motivo: "Professor não habilitado nesta modalidade." }
  }

  const resultado = await db.$transaction(async (tx) => {
    const turma = await tx.turma.create({
      data: {
        modalidadeId: params.modalidadeId,
        professorId: params.professorId ?? null,
        nome: params.nome,
        duracaoMin: duracao.duracaoMin,
        capacidade: params.capacidade ?? 0,
        local: params.local ?? null,
        ehEvento: true,
      },
      include: {
        modalidade: { select: { nome: true } },
        professor: { select: { usuario: { select: { nome: true } } } },
      },
    })
    const aula = await tx.aula.create({
      data: {
        turmaId: turma.id,
        professorId: params.professorId ?? null,
        inicio: params.inicio,
        fim: params.fim,
        duracaoMin: duracao.duracaoMin,
      },
    })

    await registrarLog(
      {
        autorId: params.autorId,
        acao: "AULA_CRIADA",
        entidade: "Aula",
        entidadeId: aula.id,
        valorNovo: {
          turmaId: turma.id,
          nome: turma.nome,
          modalidadeId: turma.modalidadeId,
          modalidade: turma.modalidade.nome,
          professorId: turma.professorId,
          professor: turma.professor?.usuario.nome ?? null,
          inicio: aula.inicio.toISOString(),
          fim: aula.fim.toISOString(),
          duracaoMin: aula.duracaoMin,
          capacidade: turma.capacidade,
          local: turma.local,
        },
        justificativa: "Aula avulsa criada",
      },
      tx,
    )

    return { turma, aula }
  })

  return { ok: true as const, ...resultado }
}

/**
 * Gera (idempotentemente) as aulas das próximas `semanas` de uma turma recorrente.
 * Usa upsert pela chave @@unique([turmaId, inicio]) para nunca duplicar.
 */
export async function gerarAulasFuturas(turmaId: string, semanas = 8): Promise<number> {
  const turma = await db.turma.findUnique({
    where: { id: turmaId },
    include: { modalidade: { select: { ativa: true } } },
  })
  if (
    !turma?.ativa ||
    !turma.modalidade.ativa ||
    turma.ehEvento ||
    turma.diaSemana === null ||
    !turma.horaInicio ||
    !turma.horaFim
  ) {
    return 0
  }
  const de = new Date()
  const ate = new Date(de.getTime() + semanas * 7 * 24 * 60 * 60 * 1000)
  const ocorrencias = gerarOcorrencias({
    diaSemana: turma.diaSemana,
    horaInicio: turma.horaInicio,
    horaFim: turma.horaFim,
    de,
    ate,
  })

  let criadas = 0
  for (const oc of ocorrencias) {
    const r = await db.aula.upsert({
      where: { turmaId_inicio: { turmaId, inicio: oc.inicio } },
      update: {},
      create: {
        turmaId,
        professorId: turma.professorId,
        inicio: oc.inicio,
        fim: oc.fim,
        duracaoMin: oc.duracaoMin,
      },
    })
    if (r.criadoEm.getTime() > de.getTime() - 5000) criadas++
  }
  return criadas
}

/** Mantém as próximas aulas geradas para todas as turmas recorrentes ativas. */
export async function gerarAulasFuturasDeTurmasAtivas(params?: { semanas?: number }) {
  const semanas = params?.semanas ?? 8
  const turmas = await db.turma.findMany({
    where: {
      ativa: true,
      ehEvento: false,
      diaSemana: { not: null },
      horaInicio: { not: null },
      horaFim: { not: null },
      modalidade: { ativa: true },
    },
    select: { id: true },
    orderBy: [{ diaSemana: "asc" }, { horaInicio: "asc" }],
  })

  let aulasCriadas = 0
  for (const turma of turmas) {
    aulasCriadas += await gerarAulasFuturas(turma.id, semanas)
  }

  return {
    semanas,
    turmasProcessadas: turmas.length,
    aulasCriadas,
  }
}

/** Professor substituto de uma aula (RF-007): troca quem ministra, mantendo o da turma. */
export async function definirProfessorDaAula(params: {
  aulaId: string
  professorId: string | null
  autorId: string
  justificativa?: string | null
}) {
  const aula = await db.aula.findUnique({
    where: { id: params.aulaId },
    include: {
      turma: { include: { modalidade: { select: { nome: true } } } },
      professor: { select: { usuario: { select: { nome: true } } } },
    },
  })
  if (!aula) return { ok: false as const, motivo: "Aula não encontrada." }

  const habilitado = await professorHabilitadoNaModalidade(
    params.professorId,
    aula.turma.modalidadeId,
  )
  if (!habilitado) {
    return { ok: false as const, motivo: "Professor não habilitado nesta modalidade." }
  }

  const professorNovo = params.professorId
    ? await db.professor.findUnique({
        where: { id: params.professorId },
        select: { usuario: { select: { nome: true } } },
      })
    : null

  const atualizada = await db.$transaction(async (tx) => {
    const nova = await tx.aula.update({
      where: { id: params.aulaId },
      data: { professorId: params.professorId },
    })

    await registrarLog(
      {
        autorId: params.autorId,
        acao: "AULA_ATUALIZADA",
        entidade: "Aula",
        entidadeId: nova.id,
        valorAntigo: {
          professorId: aula.professorId,
          professor: aula.professor?.usuario.nome ?? null,
        },
        valorNovo: {
          professorId: params.professorId,
          professor: professorNovo?.usuario.nome ?? null,
          modalidadeId: aula.turma.modalidadeId,
          modalidade: aula.turma.modalidade.nome,
        },
        justificativa: params.justificativa ?? "Professor substituto definido",
      },
      tx,
    )

    return nova
  })

  return { ok: true as const, aula: atualizada }
}

/** Cancela uma aula (RF-012/cancelamento). */
export async function cancelarAula(params: {
  aulaId: string
  autorId: string
  justificativa: string
  cancelada?: boolean
}) {
  const aula = await db.aula.findUnique({
    where: { id: params.aulaId },
    include: {
      turma: { include: { modalidade: { select: { nome: true } } } },
      comparecimentos: {
        where: { status: { in: ["CONFIRMADO", "CONVERTIDO_CHECKIN"] } },
        include: { aluno: { select: { usuarioId: true } } },
      },
      checkins: {
        include: { aluno: { select: { usuarioId: true } } },
      },
    },
  })
  if (!aula) return { ok: false as const, motivo: "Aula não encontrada." }

  const cancelada = params.cancelada ?? true
  const atualizada = await db.$transaction(async (tx) => {
    const nova = await tx.aula.update({
      where: { id: params.aulaId },
      data: { cancelada },
    })

    await registrarLog(
      {
        autorId: params.autorId,
        acao: cancelada ? "AULA_CANCELADA" : "AULA_ATUALIZADA",
        entidade: "Aula",
        entidadeId: nova.id,
        valorAntigo: {
          cancelada: aula.cancelada,
        },
        valorNovo: {
          cancelada: nova.cancelada,
          turmaId: aula.turmaId,
          modalidadeId: aula.turma.modalidadeId,
          modalidade: aula.turma.modalidade.nome,
          inicio: aula.inicio.toISOString(),
          fim: aula.fim.toISOString(),
        },
        justificativa: params.justificativa,
      },
      tx,
    )

    if (cancelada) {
      const usuarios = idsUnicos([
        ...aula.comparecimentos.map((c) => c.aluno.usuarioId),
        ...aula.checkins.map((c) => c.aluno.usuarioId),
      ])
      await Promise.all(
        usuarios.map((usuarioId) =>
          criarNotificacao(tx, {
            usuarioId,
            tipo: "CANCELAMENTO_AULA",
            titulo: "Aula cancelada",
            mensagem: `${aula.turma.nome ?? aula.turma.modalidade.nome}: ${params.justificativa}`,
          }),
        ),
      )
    }

    return nova
  })

  return { ok: true as const, aula: atualizada }
}

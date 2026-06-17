import "server-only"
import type {
  BloqueioInadimplencia,
  Prisma,
  StatusAluno,
  StatusComparecimento,
  TipoAluno,
} from "@prisma/client"
import { db } from "@/lib/db"
import { registrarLog } from "@/lib/services/auditoria.service"
import { resolverRegrasTreino } from "@/lib/services/configuracao.service"
import { criarNotificacao } from "@/lib/services/notificacao.service"
import { inicioDoDiaAcademia } from "@/lib/utils/datas"

// Serviço legado de Comparecimento — representa o AGENDAMENTO da aula (RN-001/RF-013..018).
// Agendar aula NÃO gera presença nem horas; é apenas reserva/sinalização.
// A presença só nasce de um check-in válido (ver checkin.service.ts).

const HORA_MS = 60 * 60 * 1000

// ───────────────────────── Lógica pura (testável sem banco) ─────────────────────────

/**
 * Janela de agendamento (RF-014): só é possível marcar a partir de `janelaHoras`
 * antes do início e enquanto a aula não começou.
 */
export function podeMarcarComparecimento(p: {
  agora: Date
  inicioAula: Date
  janelaHoras: number
}): boolean {
  const abertura = p.inicioAula.getTime() - p.janelaHoras * HORA_MS
  const agora = p.agora.getTime()
  return agora >= abertura && agora < p.inicioAula.getTime()
}

/**
 * Prazo de cancelamento (RF-015): só é possível cancelar até `prazoHoras` antes do início.
 */
export function podeCancelarComparecimento(p: {
  agora: Date
  inicioAula: Date
  prazoHoras: number
}): boolean {
  const limite = p.inicioAula.getTime() - p.prazoHoras * HORA_MS
  return p.agora.getTime() <= limite
}

/** Vaga disponível (RF-016): capacidade 0 = sem limite. */
export function temVaga(p: { capacidade: number; confirmados: number }): boolean {
  return p.capacidade === 0 || p.confirmados < p.capacidade
}

export function statusAoMarcarComparecimento(p: {
  capacidade: number
  confirmados: number
  listaEsperaAtiva: boolean
}): StatusComparecimento | null {
  if (temVaga({ capacidade: p.capacidade, confirmados: p.confirmados })) return "CONFIRMADO"
  return p.listaEsperaAtiva ? "LISTA_ESPERA" : null
}

export function bloqueiaComparecimentoPorFinanceiro(p: {
  statusAluno: StatusAluno
  tipoAluno: TipoAluno
  mensalidadeInternaNaModalidade: boolean
  mensalidadeEmDia: boolean
  bloqueioInadimplencia: BloqueioInadimplencia
}): boolean {
  if (p.bloqueioInadimplencia !== "BLOQUEAR_COMPARECIMENTO") return false
  return (
    p.statusAluno === "INADIMPLENTE" || (p.mensalidadeInternaNaModalidade && !p.mensalidadeEmDia)
  )
}

export function podeMarcarNoShow(params: { fimAula: Date; agora?: Date }): boolean {
  return (params.agora ?? new Date()).getTime() >= params.fimAula.getTime()
}

export type ResultadoComparecimento =
  | { ok: true; comparecimentoId: string; status: StatusComparecimento }
  | { ok: false; motivo: string }

export type ResultadoNoShow = { ok: true; total: number } | { ok: false; motivo: string }

// ───────────────────────── Operações no banco ─────────────────────────

async function configuracao() {
  return (
    (await db.configuracaoAcademia.findUnique({ where: { id: "default" } })) ?? {
      janelaComparecimentoHoras: 24,
      prazoCancelamentoHoras: 2,
      exigirComparecimentoParaCheckin: false,
      politicaCheckinSemComparecimento: "PERMITIR",
      bloqueioInadimplencia: "APENAS_ALERTAR" as BloqueioInadimplencia,
      listaEsperaAtiva: false,
    }
  )
}

async function mensalidadeEmDia(alunoId: string): Promise<boolean> {
  const hoje = inicioDoDiaAcademia(new Date())
  const pendente = await db.mensalidade.findFirst({
    where: {
      alunoId,
      OR: [{ status: "VENCIDA" }, { status: "EM_ABERTO", vencimento: { lt: hoje } }],
    },
    select: { id: true },
  })
  return pendente === null
}

/** Marca o agendamento de um aluno numa aula, respeitando janela, vaga e duplicidade (RF-013..016). */
export async function marcarComparecimento(params: {
  alunoId: string
  aulaId: string
  agora?: Date
}): Promise<ResultadoComparecimento> {
  const agora = params.agora ?? new Date()
  const config = await configuracao()

  const [aluno, aula] = await Promise.all([
    db.aluno.findUnique({
      where: { id: params.alunoId },
      select: {
        status: true,
        tipo: true,
        usuarioId: true,
        modalidadesPlano: { select: { modalidadeId: true } },
      },
    }),
    db.aula.findUnique({
      where: { id: params.aulaId },
      include: {
        turma: {
          select: {
            capacidade: true,
            nome: true,
            modalidadeId: true,
            modalidade: {
              select: {
                nome: true,
                janelaComparecimentoHoras: true,
                prazoCancelamentoHoras: true,
                exigirComparecimentoParaCheckin: true,
                politicaCheckinSemComparecimento: true,
                listaEsperaAtiva: true,
              },
            },
          },
        },
      },
    }),
  ])
  if (!aluno) return { ok: false, motivo: "Aluno não encontrado." }
  if (!aula || aula.cancelada) return { ok: false, motivo: "Aula indisponível." }
  const regras = resolverRegrasTreino(config, aula.turma.modalidade)
  const mensalidadeInternaNaModalidade = aluno.modalidadesPlano.some(
    (modalidade) => modalidade.modalidadeId === aula.turma.modalidadeId,
  )

  const podeFinanceiro = !bloqueiaComparecimentoPorFinanceiro({
    statusAluno: aluno.status,
    tipoAluno: aluno.tipo,
    mensalidadeInternaNaModalidade: Boolean(mensalidadeInternaNaModalidade),
    mensalidadeEmDia: mensalidadeInternaNaModalidade
      ? await mensalidadeEmDia(params.alunoId)
      : true,
    bloqueioInadimplencia: config.bloqueioInadimplencia,
  })
  if (!podeFinanceiro) return { ok: false, motivo: "Mensalidade vencida." }

  if (
    !podeMarcarComparecimento({
      agora,
      inicioAula: aula.inicio,
      janelaHoras: regras.janelaComparecimentoHoras,
    })
  ) {
    return { ok: false, motivo: "Fora da janela de agendamento." }
  }

  // Reativa um agendamento previamente cancelado, se existir (mantém histórico via @@unique).
  const existente = await db.comparecimento.findUnique({
    where: { alunoId_aulaId: { alunoId: params.alunoId, aulaId: params.aulaId } },
  })
  if (existente?.status === "CONFIRMADO" || existente?.status === "LISTA_ESPERA") {
    return { ok: true, comparecimentoId: existente.id, status: existente.status }
  }

  const confirmados = await db.comparecimento.count({
    where: { aulaId: params.aulaId, status: "CONFIRMADO" },
  })
  const novoStatus = statusAoMarcarComparecimento({
    capacidade: aula.turma.capacidade,
    confirmados,
    listaEsperaAtiva: regras.listaEsperaAtiva,
  })
  if (!novoStatus) {
    return { ok: false, motivo: "Turma lotada." }
  }

  const comparecimento = await db.$transaction(async (tx) => {
    const salvo = existente
      ? await tx.comparecimento.update({
          where: { id: existente.id },
          data: { status: novoStatus, canceladoEm: null },
        })
      : await tx.comparecimento.create({
          data: { alunoId: params.alunoId, aulaId: params.aulaId, status: novoStatus },
        })

    await criarNotificacao(tx, {
      usuarioId: aluno.usuarioId,
      tipo: "COMPARECIMENTO",
      titulo: novoStatus === "CONFIRMADO" ? "Agendamento confirmado" : "Lista de espera",
      mensagem:
        novoStatus === "CONFIRMADO"
          ? `${aula.turma.nome ?? aula.turma.modalidade.nome}: agendamento registrado.`
          : `${aula.turma.nome ?? aula.turma.modalidade.nome}: você entrou na lista de espera.`,
    })

    return salvo
  })

  return { ok: true, comparecimentoId: comparecimento.id, status: comparecimento.status }
}

/** Cancela um agendamento dentro do prazo configurado (RF-015/017). */
export async function cancelarComparecimento(params: {
  alunoId: string
  aulaId: string
  autorId: string
  porGestor?: boolean
  agora?: Date
}): Promise<ResultadoComparecimento> {
  const agora = params.agora ?? new Date()
  const config = await configuracao()

  const comparecimento = await db.comparecimento.findUnique({
    where: { alunoId_aulaId: { alunoId: params.alunoId, aulaId: params.aulaId } },
    include: {
      aula: {
        select: {
          inicio: true,
          turma: {
            select: {
              modalidade: {
                select: {
                  janelaComparecimentoHoras: true,
                  prazoCancelamentoHoras: true,
                  exigirComparecimentoParaCheckin: true,
                  politicaCheckinSemComparecimento: true,
                  listaEsperaAtiva: true,
                },
              },
            },
          },
        },
      },
    },
  })
  if (comparecimento?.status !== "CONFIRMADO" && comparecimento?.status !== "LISTA_ESPERA") {
    return { ok: false, motivo: "Sem agendamento ativo." }
  }

  // O gestor pode cancelar a qualquer momento (RF-017); o aluno respeita o prazo (RF-015).
  if (
    !params.porGestor &&
    !podeCancelarComparecimento({
      agora,
      inicioAula: comparecimento.aula.inicio,
      prazoHoras: resolverRegrasTreino(config, comparecimento.aula.turma.modalidade)
        .prazoCancelamentoHoras,
    })
  ) {
    return { ok: false, motivo: "Fora do prazo de cancelamento." }
  }

  const statusAnterior = comparecimento.status
  const statusCancelado = params.porGestor ? "CANCELADO_GESTOR" : "CANCELADO_ALUNO"

  await db.$transaction(async (tx) => {
    await tx.comparecimento.update({
      where: { id: comparecimento.id },
      data: {
        status: statusCancelado,
        canceladoEm: agora,
      },
    })

    await registrarLog(
      {
        autorId: params.autorId,
        acao: "COMPARECIMENTO_CANCELADO",
        entidade: "Comparecimento",
        entidadeId: comparecimento.id,
        valorAntigo: {
          status: statusAnterior,
          alunoId: comparecimento.alunoId,
          aulaId: comparecimento.aulaId,
        },
        valorNovo: {
          status: statusCancelado,
          alunoId: comparecimento.alunoId,
          aulaId: comparecimento.aulaId,
        },
      },
      tx,
    )

    if (statusAnterior === "CONFIRMADO") {
      await promoverPrimeiroDaListaEspera(tx, {
        aulaId: comparecimento.aulaId,
        autorId: params.autorId,
      })
    }
  })
  return { ok: true, comparecimentoId: comparecimento.id, status: statusCancelado }
}

/** Marca como NO_SHOW os agendamentos confirmados sem check-in válido de uma aula encerrada (RF-018). */
export async function marcarNoShows(params: {
  aulaId: string
  autorId: string
  agora?: Date
}): Promise<ResultadoNoShow> {
  const aula = await db.aula.findUnique({
    where: { id: params.aulaId },
    include: {
      turma: { select: { nome: true, modalidade: { select: { nome: true } } } },
      checkins: { where: { status: "VALIDO" }, select: { alunoId: true } },
      comparecimentos: {
        where: { status: "CONFIRMADO" },
        include: {
          aluno: { select: { usuarioId: true, usuario: { select: { nome: true } } } },
        },
      },
    },
  })
  if (!aula) return { ok: false, motivo: "Aula não encontrada." }
  if (!podeMarcarNoShow({ fimAula: aula.fim, agora: params.agora })) {
    return { ok: false, motivo: "A aula ainda não encerrou." }
  }

  const comCheckin = new Set(aula.checkins.map((c) => c.alunoId))
  const confirmados = aula.comparecimentos
  const noShows = confirmados.filter((c) => !comCheckin.has(c.alunoId))
  if (noShows.length === 0) return { ok: true, total: 0 }

  await db.$transaction(async (tx) => {
    for (const comparecimento of noShows) {
      await tx.comparecimento.update({
        where: { id: comparecimento.id },
        data: { status: "NO_SHOW" },
      })

      await registrarLog(
        {
          autorId: params.autorId,
          acao: "COMPARECIMENTO_NO_SHOW",
          entidade: "Comparecimento",
          entidadeId: comparecimento.id,
          valorAntigo: {
            status: "CONFIRMADO",
            alunoId: comparecimento.alunoId,
            aulaId: aula.id,
          },
          valorNovo: {
            status: "NO_SHOW",
            alunoId: comparecimento.alunoId,
            aluno: comparecimento.aluno.usuario.nome,
            aulaId: aula.id,
            modalidade: aula.turma.modalidade.nome,
          },
          justificativa: "Agendamento sem check-in válido após encerramento da aula",
        },
        tx,
      )

      await criarNotificacao(tx, {
        usuarioId: comparecimento.aluno.usuarioId,
        tipo: "COMPARECIMENTO",
        titulo: "No-show registrado",
        mensagem: `${aula.turma.nome ?? aula.turma.modalidade.nome}: agendamento sem check-in válido.`,
      })
    }
  })

  return { ok: true, total: noShows.length }
}

async function promoverPrimeiroDaListaEspera(
  tx: Prisma.TransactionClient,
  params: { aulaId: string; autorId: string },
) {
  const proximo = await tx.comparecimento.findFirst({
    where: { aulaId: params.aulaId, status: "LISTA_ESPERA" },
    orderBy: { criadoEm: "asc" },
    include: {
      aluno: { select: { usuarioId: true, usuario: { select: { nome: true } } } },
      aula: {
        select: {
          turma: { select: { nome: true, modalidade: { select: { nome: true } } } },
        },
      },
    },
  })
  if (!proximo) return

  await tx.comparecimento.update({
    where: { id: proximo.id },
    data: { status: "CONFIRMADO", canceladoEm: null },
  })

  await registrarLog(
    {
      autorId: params.autorId,
      acao: "COMPARECIMENTO_PROMOVIDO_LISTA_ESPERA",
      entidade: "Comparecimento",
      entidadeId: proximo.id,
      valorAntigo: {
        status: "LISTA_ESPERA",
        alunoId: proximo.alunoId,
        aulaId: proximo.aulaId,
      },
      valorNovo: {
        status: "CONFIRMADO",
        alunoId: proximo.alunoId,
        aluno: proximo.aluno.usuario.nome,
        aulaId: proximo.aulaId,
      },
      justificativa: "Vaga liberada por cancelamento de agendamento confirmado",
    },
    tx,
  )

  await criarNotificacao(tx, {
    usuarioId: proximo.aluno.usuarioId,
    tipo: "COMPARECIMENTO",
    titulo: "Vaga liberada",
    mensagem: `${proximo.aula.turma.nome ?? proximo.aula.turma.modalidade.nome}: seu agendamento foi confirmado.`,
  })
}

import "server-only"
import type {
  BloqueioInadimplencia,
  OrigemCheckin,
  PoliticaCheckinSemComparecimento,
  StatusAluno,
  TipoAluno,
} from "@prisma/client"
import { alunoSemMatriculaAtiva } from "@/lib/alunos/status"
import { db } from "@/lib/db"
import { registrarLog } from "@/lib/services/auditoria.service"
import { tokenCheckinValido } from "@/lib/services/checkin-token.service"
import { resolverRegrasTreino } from "@/lib/services/configuracao.service"
import { creditarPorCheckin, estornarCheckin } from "@/lib/services/horas.service"
import { criarNotificacao } from "@/lib/services/notificacao.service"
import {
  MENSAGEM_TERMO_RESPONSABILIDADE_PENDENTE,
  termoResponsabilidadeAtualAceito,
} from "@/lib/services/termo-responsabilidade.service"
import { formatarDataHora, inicioDoDiaAcademia } from "@/lib/utils/datas"

// Serviço de CHECK-IN — o coração do loop de treino (RF-019..031).
// REGRAS INVIOLÁVEIS:
//  • Check-in VÁLIDO ⇒ presença + horas = duração da aula (RN-002/RF-023/030/034).
//  • A mesma aula nunca conta duas vezes para o mesmo aluno (@@unique alunoId+aulaId, RF-039).
//  • Invalidar/excluir NÃO apaga horas: lança ESTORNO (minutos negativos) na MESMA transação
//    que marca o check-in e grava o LogAuditoria (RN-005/RF-027/035).

const MINUTO_MS = 60_000

// ───────────────────────── Lógica pura (testável sem banco) ─────────────────────────

export type ContextoCheckin = {
  statusAluno: StatusAluno
  tipoAluno: TipoAluno
  aulaCancelada: boolean
  jaTemCheckinValido: boolean
  temComparecimento: boolean
  capacidadeAula: number
  ocupacaoAula: number
  lancadoPorTerceiro: boolean // gestor/professor lançando — vale como aprovação
  // Configuração da academia:
  exigirComparecimento: boolean
  politicaSemComparecimento: PoliticaCheckinSemComparecimento
  bloqueioInadimplencia: BloqueioInadimplencia
  mensalidadeInternaNaModalidade: boolean
  mensalidadeEmDia: boolean
  termoResponsabilidadeAceito: boolean
}

export type AvaliacaoCheckin =
  | { ok: true; pendenteRevisao?: boolean }
  | { ok: false; motivo: string }

/**
 * Decide se um check-in é permitido (RF-020/022). Função pura — sem efeitos colaterais.
 */
export function avaliarCheckin(ctx: ContextoCheckin): AvaliacaoCheckin {
  if (ctx.jaTemCheckinValido) return { ok: false, motivo: "Check-in já realizado nesta aula." }
  if (ctx.aulaCancelada) return { ok: false, motivo: "Aula cancelada." }

  if (alunoSemMatriculaAtiva(ctx.statusAluno)) {
    return { ok: false, motivo: "Aluno sem matrícula ativa." }
  }

  if (!ctx.termoResponsabilidadeAceito) {
    return { ok: false, motivo: MENSAGEM_TERMO_RESPONSABILIDADE_PENDENTE }
  }

  // Inadimplência (RF-020/051): só bloqueia quando a aula pertence a um plano mensal interno.
  const inadimplente =
    ctx.statusAluno === "INADIMPLENTE" ||
    (ctx.mensalidadeInternaNaModalidade && !ctx.mensalidadeEmDia)
  if (inadimplente && ctx.bloqueioInadimplencia === "BLOQUEAR_CHECKIN") {
    return { ok: false, motivo: "Mensalidade vencida." }
  }

  if (!ctx.temComparecimento && ctx.capacidadeAula > 0 && ctx.ocupacaoAula >= ctx.capacidadeAula) {
    return { ok: false, motivo: "Aula sem vagas disponíveis." }
  }

  // Agendamento prévio (RF-022): a aprovação por terceiro libera os casos restritos.
  if (!ctx.temComparecimento && !ctx.lancadoPorTerceiro) {
    const exige = ctx.exigirComparecimento || ctx.politicaSemComparecimento === "BLOQUEAR"
    if (exige) return { ok: false, motivo: "É necessário agendar a aula antes." }
    if (ctx.politicaSemComparecimento === "APENAS_COM_APROVACAO") {
      return { ok: true, pendenteRevisao: true }
    }
  }

  return { ok: true }
}

/** Status de presença derivado do check-in (RF-029). */
export type StatusPresenca = "PRESENTE" | "PENDENTE_REVISAO" | "INVALIDADO" | "EXCLUIDO" | "AUSENTE"

export function statusPresenca(
  checkin: { status: "VALIDO" | "PENDENTE_REVISAO" | "INVALIDADO" | "EXCLUIDO" } | null,
): StatusPresenca {
  if (!checkin) return "AUSENTE"
  if (checkin.status === "VALIDO") return "PRESENTE"
  if (checkin.status === "PENDENTE_REVISAO") return "PENDENTE_REVISAO"
  return checkin.status === "INVALIDADO" ? "INVALIDADO" : "EXCLUIDO"
}

export function checkinRetroativo(params: { fimAula: Date; agora?: Date }): boolean {
  return (params.agora ?? new Date()).getTime() > params.fimAula.getTime()
}

export function podeRealizarCheckinNaJanela(params: {
  inicioAula: Date
  fimAula: Date
  agora?: Date
  toleranciaMinutos?: number
}): boolean {
  const tolerancia = params.toleranciaMinutos ?? 30
  const agora = (params.agora ?? new Date()).getTime()
  const inicio = params.inicioAula.getTime()
  const fim = params.fimAula.getTime()
  return agora >= inicio - tolerancia * MINUTO_MS && agora <= fim
}

// ───────────────────────── Operações no banco ─────────────────────────

export type ResultadoCheckin =
  | { ok: true; checkinId: string; status?: "VALIDO" | "PENDENTE_REVISAO" }
  | {
      ok: false
      motivo: string
      codigo?: "FORA_DA_JANELA" | "INADIMPLENTE" | "TOKEN_INVALIDO" | "TERMO_NAO_ACEITO"
    }

async function configuracao() {
  return (
    (await db.configuracaoAcademia.findUnique({ where: { id: "default" } })) ?? {
      janelaComparecimentoHoras: 24,
      prazoCancelamentoHoras: 2,
      exigirComparecimentoParaCheckin: false,
      politicaCheckinSemComparecimento: "PERMITIR" as PoliticaCheckinSemComparecimento,
      bloqueioInadimplencia: "APENAS_ALERTAR" as BloqueioInadimplencia,
      listaEsperaAtiva: false,
    }
  )
}

/** Há mensalidade vencida para o aluno? Mensalidade em aberto antes do vencimento não bloqueia. */
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

async function registrarTentativaInadimplente(params: {
  alunoId: string
  aulaId: string
  autorId: string
  motivo: string
  agora: Date
}) {
  await db.$transaction(async (tx) => {
    const [aluno, aula, gestores] = await Promise.all([
      tx.aluno.findUnique({
        where: { id: params.alunoId },
        select: { usuario: { select: { nome: true } } },
      }),
      tx.aula.findUnique({
        where: { id: params.aulaId },
        select: {
          inicio: true,
          professor: { select: { usuarioId: true } },
          turma: {
            select: {
              nome: true,
              modalidade: { select: { nome: true } },
              professor: { select: { usuarioId: true } },
            },
          },
        },
      }),
      tx.usuario.findMany({
        where: { papel: "GESTOR", ativo: true },
        select: { id: true },
      }),
    ])

    const tentativa = await tx.tentativaCheckinInadimplente.create({
      data: {
        alunoId: params.alunoId,
        aulaId: params.aulaId,
        motivo: params.motivo,
        criadoEm: params.agora,
      },
    })

    await registrarLog(
      {
        autorId: params.autorId,
        acao: "CHECKIN_BLOQUEADO_INADIMPLENCIA",
        entidade: "TentativaCheckinInadimplente",
        entidadeId: tentativa.id,
        valorNovo: {
          alunoId: params.alunoId,
          aulaId: params.aulaId,
          aluno: aluno?.usuario.nome ?? null,
          motivo: params.motivo,
        },
      },
      tx,
    )

    if (!aluno || !aula) return

    const destinatarios = new Set(gestores.map((gestor) => gestor.id))
    if (aula.professor?.usuarioId) destinatarios.add(aula.professor.usuarioId)
    if (aula.turma.professor?.usuarioId) destinatarios.add(aula.turma.professor.usuarioId)

    const nomeAula = aula.turma.nome ?? aula.turma.modalidade.nome
    const mensagem = `${aluno.usuario.nome} tentou fazer check-in em ${nomeAula} (${formatarDataHora(
      aula.inicio,
    )}) e foi bloqueado por inadimplência.`

    for (const usuarioId of destinatarios) {
      await criarNotificacao(tx, {
        usuarioId,
        tipo: "FINANCEIRO",
        titulo: "Check-in bloqueado por inadimplência",
        mensagem,
      })
    }
  })
}

export async function realizarCheckinQr(params: {
  alunoId: string
  aulaId: string
  autorId: string
  token: string
  agora?: Date
}): Promise<ResultadoCheckin> {
  if (!(await tokenCheckinValido(params.token))) {
    return {
      ok: false,
      codigo: "TOKEN_INVALIDO",
      motivo: "QR Code expirado. Leia o QR Code atual na entrada da academia.",
    }
  }

  return realizarCheckin({
    alunoId: params.alunoId,
    aulaId: params.aulaId,
    autorId: params.autorId,
    origem: "QR_CODE",
    exigirJanelaCheckin: true,
    bloquearInadimplenciaSempre: true,
    agora: params.agora,
  })
}

/**
 * Realiza o check-in (RF-019..023). Em transação: cria o Checkin VÁLIDO, converte o
 * agendamento (se houver), credita as horas (= duração da aula) e grava o LogAuditoria.
 */
export async function realizarCheckin(params: {
  alunoId: string
  aulaId: string
  autorId: string // usuário que dispara a ação (o próprio aluno, gestor ou professor)
  origem?: OrigemCheckin
  retroativo?: boolean
  lancadoPorId?: string // preenchido quando gestor/professor lança por outro
  justificativa?: string
  exigirJanelaCheckin?: boolean
  bloquearInadimplenciaSempre?: boolean
  agora?: Date
}): Promise<ResultadoCheckin> {
  const agora = params.agora ?? new Date()
  const config = await configuracao()

  const [aluno, aula, jaCheckin, comparecimento] = await Promise.all([
    db.aluno.findUnique({
      where: { id: params.alunoId },
      select: {
        status: true,
        tipo: true,
        modalidades: { select: { id: true } },
        modalidadesPlano: { select: { modalidadeId: true } },
      },
    }),
    db.aula.findUnique({
      where: { id: params.aulaId },
      select: {
        id: true,
        inicio: true,
        fim: true,
        cancelada: true,
        duracaoMin: true,
        turma: {
          select: {
            capacidade: true,
            modalidadeId: true,
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
        comparecimentos: {
          where: { status: { in: ["CONFIRMADO", "CONVERTIDO_CHECKIN"] } },
          select: { alunoId: true },
        },
        checkins: { where: { status: "VALIDO" }, select: { alunoId: true } },
      },
    }),
    db.checkin.findUnique({
      where: { alunoId_aulaId: { alunoId: params.alunoId, aulaId: params.aulaId } },
      select: { id: true, status: true },
    }),
    db.comparecimento.findUnique({
      where: { alunoId_aulaId: { alunoId: params.alunoId, aulaId: params.aulaId } },
      select: { id: true, status: true },
    }),
  ])

  if (!aluno) return { ok: false, motivo: "Aluno não encontrado." }
  if (!aula) return { ok: false, motivo: "Aula não encontrada." }
  if (
    params.exigirJanelaCheckin &&
    !podeRealizarCheckinNaJanela({ inicioAula: aula.inicio, fimAula: aula.fim, agora })
  ) {
    return {
      ok: false,
      codigo: "FORA_DA_JANELA",
      motivo: "Check-in liberado apenas de 30 minutos antes até o fim da aula.",
    }
  }
  if (!aluno.modalidades.some((modalidade) => modalidade.id === aula.turma.modalidadeId)) {
    return { ok: false, motivo: "Aluno não está matriculado na modalidade desta aula." }
  }
  if (jaCheckin?.status === "VALIDO") {
    return { ok: false, motivo: "Check-in já realizado nesta aula." }
  }

  const regras = resolverRegrasTreino(config, aula.turma.modalidade)
  const lancadoPorTerceiro = Boolean(params.lancadoPorId)
  const termoAceito = await termoResponsabilidadeAtualAceito(params.alunoId)
  const mensalidadeInternaNaModalidade = aluno.modalidadesPlano.some(
    (modalidade) => modalidade.modalidadeId === aula.turma.modalidadeId,
  )
  const emDia = mensalidadeInternaNaModalidade ? await mensalidadeEmDia(params.alunoId) : true
  const inadimplente =
    aluno.status === "INADIMPLENTE" || (Boolean(mensalidadeInternaNaModalidade) && !emDia)
  const ocupacaoAula = new Set([
    ...aula.comparecimentos.map((item) => item.alunoId),
    ...aula.checkins.map((item) => item.alunoId),
  ]).size
  const avaliacao = avaliarCheckin({
    statusAluno: aluno.status,
    tipoAluno: aluno.tipo,
    aulaCancelada: aula.cancelada,
    jaTemCheckinValido: false, // já garantido acima (early-return se VALIDO)
    temComparecimento:
      comparecimento?.status === "CONFIRMADO" || comparecimento?.status === "CONVERTIDO_CHECKIN",
    capacidadeAula: aula.turma.capacidade,
    ocupacaoAula,
    lancadoPorTerceiro,
    exigirComparecimento: regras.exigirComparecimentoParaCheckin,
    politicaSemComparecimento: regras.politicaCheckinSemComparecimento,
    bloqueioInadimplencia: params.bloquearInadimplenciaSempre
      ? "BLOQUEAR_CHECKIN"
      : config.bloqueioInadimplencia,
    mensalidadeInternaNaModalidade: Boolean(mensalidadeInternaNaModalidade),
    mensalidadeEmDia: emDia,
    termoResponsabilidadeAceito: termoAceito,
  })
  if (!avaliacao.ok) {
    if (!termoAceito) {
      return {
        ok: false,
        codigo: "TERMO_NAO_ACEITO",
        motivo: MENSAGEM_TERMO_RESPONSABILIDADE_PENDENTE,
      }
    }

    if (params.bloquearInadimplenciaSempre && inadimplente) {
      await registrarTentativaInadimplente({
        alunoId: params.alunoId,
        aulaId: params.aulaId,
        autorId: params.autorId,
        motivo: "Mensalidade vencida.",
        agora,
      })
      return {
        ok: false,
        codigo: "INADIMPLENTE",
        motivo: "Regularize sua matrícula ou pagamento antes de iniciar a aula.",
      }
    }

    return avaliacao
  }

  const statusNovo = avaliacao.pendenteRevisao ? "PENDENTE_REVISAO" : "VALIDO"
  const checkinId = await db.$transaction(async (tx) => {
    // Reaproveita o registro se já existir invalidado/excluído (mantém histórico via @@unique).
    const checkin = jaCheckin
      ? await tx.checkin.update({
          where: { id: jaCheckin.id },
          data: {
            status: statusNovo,
            origem: params.origem ?? "BOTAO",
            retroativo: params.retroativo ?? false,
            lancadoPorId: params.lancadoPorId ?? null,
            invalidadoPorId: null,
            invalidadoEm: null,
            justificativa: params.justificativa ?? null,
          },
        })
      : await tx.checkin.create({
          data: {
            alunoId: params.alunoId,
            aulaId: params.aulaId,
            status: statusNovo,
            origem: params.origem ?? "BOTAO",
            retroativo: params.retroativo ?? false,
            lancadoPorId: params.lancadoPorId ?? null,
            justificativa: params.justificativa ?? null,
          },
        })

    if (
      !avaliacao.pendenteRevisao &&
      comparecimento &&
      comparecimento.status !== "CONVERTIDO_CHECKIN"
    ) {
      await tx.comparecimento.update({
        where: { id: comparecimento.id },
        data: { status: "CONVERTIDO_CHECKIN" },
      })
    }

    if (!avaliacao.pendenteRevisao) {
      // RN-002: horas = duração da aula, na modalidade da turma.
      await creditarPorCheckin(tx, {
        alunoId: params.alunoId,
        modalidadeId: aula.turma.modalidadeId,
        checkinId: checkin.id,
        minutos: aula.duracaoMin,
      })
    }

    await registrarLog(
      {
        autorId: params.autorId,
        acao: params.retroativo ? "REGISTRO_RETROATIVO" : "CHECKIN_CRIADO",
        entidade: "Checkin",
        entidadeId: checkin.id,
        valorNovo: {
          alunoId: params.alunoId,
          aulaId: params.aulaId,
          status: statusNovo,
          minutos: avaliacao.pendenteRevisao ? 0 : aula.duracaoMin,
        },
        justificativa: params.justificativa ?? null,
      },
      tx,
    )

    return checkin.id
  })

  return { ok: true, checkinId, status: statusNovo }
}

/**
 * Invalida ou exclui um check-in (RF-027/028/035). Em transação: marca o status, estorna
 * TODAS as horas creditadas (movimentos negativos) e grava o LogAuditoria. Nunca apaga horas.
 */
export async function invalidarCheckin(params: {
  checkinId: string
  autorId: string
  justificativa: string
  excluir?: boolean // true ⇒ EXCLUIDO; false ⇒ INVALIDADO
}): Promise<ResultadoCheckin> {
  const checkin = await db.checkin.findUnique({
    where: { id: params.checkinId },
    select: { id: true, status: true, alunoId: true, aluno: { select: { usuarioId: true } } },
  })
  if (!checkin) return { ok: false, motivo: "Check-in não encontrado." }
  if (checkin.status !== "VALIDO") return { ok: false, motivo: "Check-in já não está válido." }

  await db.$transaction(async (tx) => {
    await tx.checkin.update({
      where: { id: checkin.id },
      data: {
        status: params.excluir ? "EXCLUIDO" : "INVALIDADO",
        invalidadoPorId: params.autorId,
        invalidadoEm: new Date(),
        justificativa: params.justificativa,
      },
    })

    await estornarCheckin(tx, {
      checkinId: checkin.id,
      autorId: params.autorId,
      motivo: params.justificativa,
    })

    await registrarLog(
      {
        autorId: params.autorId,
        acao: params.excluir ? "CHECKIN_EXCLUIDO" : "CHECKIN_INVALIDADO",
        entidade: "Checkin",
        entidadeId: checkin.id,
        valorAntigo: { status: "VALIDO" },
        valorNovo: { status: params.excluir ? "EXCLUIDO" : "INVALIDADO" },
        justificativa: params.justificativa,
      },
      tx,
    )

    await criarNotificacao(tx, {
      usuarioId: checkin.aluno.usuarioId,
      tipo: "CHECKIN_INVALIDADO",
      titulo: params.excluir ? "Check-in excluído" : "Check-in invalidado",
      mensagem: params.justificativa,
    })
  })

  return { ok: true, checkinId: checkin.id }
}

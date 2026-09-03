import "server-only"
import type {
  BloqueioInadimplencia,
  OrigemCheckin,
  PoliticaCheckinSemComparecimento,
  StatusAluno,
  TipoAluno,
} from "@prisma/client"
import { alunoSemMatriculaAtiva } from "@/lib/alunos/status"
import {
  type AulaCandidataCheckinLivre,
  podeRealizarCheckinNaJanela,
  selecionarAulaReferenciaCheckinLivre,
} from "@/lib/checkin-horario"
import {
  mensagemConfirmacaoCheckinPlataforma,
  plataformaCheckinDoTipo,
} from "@/lib/checkin-plataforma"
import { db } from "@/lib/db"
import { coordenadasGeograficasValidas, estaProximoDaAcademia } from "@/lib/geolocalizacao"
import { registrarLog } from "@/lib/services/auditoria.service"
import { tokenCheckinValido } from "@/lib/services/checkin-token.service"
import { resolverRegrasTreino } from "@/lib/services/configuracao.service"
import { creditarPorCheckin, estornarCheckin } from "@/lib/services/horas.service"
import { criarNotificacao } from "@/lib/services/notificacao.service"
import { sincronizarOfensivasDaModalidade } from "@/lib/services/ofensiva.service"
import {
  MENSAGEM_TERMO_RESPONSABILIDADE_PENDENTE,
  termoResponsabilidadeAtualAceito,
} from "@/lib/services/termo-responsabilidade.service"
import { fimExclusivoDoDiaAcademia, formatarDataHora, inicioDoDiaAcademia } from "@/lib/utils/datas"

// Serviço de CHECK-IN — o coração do loop de treino (RF-019..031).
// REGRAS INVIOLÁVEIS:
//  • Check-in VÁLIDO ⇒ presença + horas = duração da aula (RN-002/RF-023/030/034).
//  • A mesma aula nunca conta duas vezes para o mesmo aluno (@@unique alunoId+aulaId, RF-039).
//  • Invalidar/excluir NÃO apaga horas: lança ESTORNO (minutos negativos) na MESMA transação
//    que marca o check-in e grava o LogAuditoria (RN-005/RF-027/035).

// ───────────────────────── Lógica pura (testável sem banco) ─────────────────────────

export { podeRealizarCheckinNaJanela } from "@/lib/checkin-horario"

export type ContextoCheckin = {
  statusAluno: StatusAluno
  tipoAluno: TipoAluno
  possuiPlanoPagamento: boolean
  modalidadeCobertaPeloPlano: boolean
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
  confirmouCheckinPlataforma: boolean
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

  if (
    ctx.tipoAluno === "MENSALISTA" &&
    (!ctx.possuiPlanoPagamento || !ctx.modalidadeCobertaPeloPlano)
  ) {
    return {
      ok: false,
      motivo: "Matrícula pendente de aprovação e vínculo de plano.",
    }
  }

  const plataformaCheckin = plataformaCheckinDoTipo(ctx.tipoAluno)
  if (plataformaCheckin && !ctx.lancadoPorTerceiro && !ctx.confirmouCheckinPlataforma) {
    return {
      ok: false,
      motivo: mensagemConfirmacaoCheckinPlataforma(plataformaCheckin),
    }
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

export function checkinImpedeNovoRegistro(
  status: "VALIDO" | "PENDENTE_REVISAO" | "INVALIDADO" | "EXCLUIDO" | null | undefined,
  lancadoPorTerceiro: boolean,
): boolean {
  return status === "VALIDO" || (status === "PENDENTE_REVISAO" && !lancadoPorTerceiro)
}

export function conteudoNotificacaoCheckinRealizado(params: {
  alunoNome: string
  nomeAula: string
  inicioAula: Date
  pendenteRevisao: boolean
}): { titulo: string; mensagem: string } {
  const contexto = `${params.alunoNome} fez check-in na aula ${params.nomeAula}, em ${formatarDataHora(
    params.inicioAula,
  )}.`
  return params.pendenteRevisao
    ? {
        titulo: "Check-in para revisar",
        mensagem: `${contexto} Revise o registro no sistema.`,
      }
    : { titulo: "Novo check-in", mensagem: contexto }
}

type ProfessorParaNotificacao = {
  usuarioId: string
  ativo: boolean
  usuario: { ativo: boolean }
}

export function usuarioProfessorResponsavelCheckin(params: {
  professorAula: ProfessorParaNotificacao | null
  professorTurma: ProfessorParaNotificacao | null
}): string | null {
  for (const professor of [params.professorAula, params.professorTurma]) {
    if (professor?.ativo && professor.usuario.ativo) return professor.usuarioId
  }
  return null
}

// ───────────────────────── Operações no banco ─────────────────────────

export type ResultadoCheckin =
  | {
      ok: true
      checkinId: string
      aulaId?: string
      status?: "VALIDO" | "PENDENTE_REVISAO"
    }
  | {
      ok: false
      motivo: string
      codigo?:
        | "FORA_DA_JANELA"
        | "INADIMPLENTE"
        | "TOKEN_INVALIDO"
        | "FORA_DA_AREA"
        | "LOCALIZACAO_INVALIDA"
        | "TERMO_NAO_ACEITO"
        | "SEM_AULA_REFERENCIA"
    }

class ErroConcorrenciaCheckin extends Error {}

type AulaParaReferencia = {
  id: string
  inicio: Date
  fim: Date
  cancelada: boolean
  turma: { capacidade: number }
  comparecimentos: Array<{ alunoId: string; status: string }>
  checkins: Array<{ alunoId: string; status: string }>
}

export function montarCandidataCheckinLivre(
  aula: AulaParaReferencia,
  alunoId: string,
): AulaCandidataCheckinLivre {
  const temAgendamento = aula.comparecimentos.some(
    (item) =>
      item.alunoId === alunoId &&
      (item.status === "CONFIRMADO" || item.status === "CONVERTIDO_CHECKIN"),
  )
  const temCheckin = aula.checkins.some(
    (item) =>
      item.alunoId === alunoId && (item.status === "VALIDO" || item.status === "PENDENTE_REVISAO"),
  )
  const ocupantes = new Set([
    ...aula.comparecimentos
      .filter((item) => item.status === "CONFIRMADO" || item.status === "CONVERTIDO_CHECKIN")
      .map((item) => item.alunoId),
    ...aula.checkins.filter((item) => item.status === "VALIDO").map((item) => item.alunoId),
  ])

  return {
    id: aula.id,
    inicio: aula.inicio,
    fim: aula.fim,
    cancelada: aula.cancelada,
    temAgendamento,
    temCheckin,
    vagasDisponiveis:
      aula.turma.capacidade === 0 ? null : Math.max(0, aula.turma.capacidade - ocupantes.size),
  }
}

async function resolverAulaReferenciaCheckinAluno(params: {
  alunoId: string
  aulaId: string
  agora: Date
}): Promise<
  | { ok: true; aulaId: string; associadoAutomaticamente: boolean }
  | { ok: false; motivo: string; codigo?: "SEM_AULA_REFERENCIA" }
> {
  const aulaSolicitada = await db.aula.findUnique({
    where: { id: params.aulaId },
    select: {
      id: true,
      turma: {
        select: {
          modalidadeId: true,
          modalidade: { select: { checkinSemRestricaoHorario: true } },
        },
      },
    },
  })
  if (!aulaSolicitada) return { ok: false, motivo: "Aula não encontrada." }
  if (!aulaSolicitada.turma.modalidade.checkinSemRestricaoHorario) {
    return { ok: true, aulaId: aulaSolicitada.id, associadoAutomaticamente: false }
  }

  const inicioDia = inicioDoDiaAcademia(params.agora)
  const fimDia = fimExclusivoDoDiaAcademia(params.agora)
  const aulas = await db.aula.findMany({
    where: {
      cancelada: false,
      OR: [
        { inicio: { gte: inicioDia, lt: fimDia } },
        { inicio: { lt: inicioDia }, fim: { gte: params.agora } },
      ],
      turma: {
        ativa: true,
        ehEvento: false,
        modalidadeId: aulaSolicitada.turma.modalidadeId,
        modalidade: { ativa: true },
      },
    },
    orderBy: [{ inicio: "asc" }, { id: "asc" }],
    select: {
      id: true,
      inicio: true,
      fim: true,
      cancelada: true,
      turma: { select: { capacidade: true } },
      comparecimentos: { select: { alunoId: true, status: true } },
      checkins: { select: { alunoId: true, status: true } },
    },
  })
  const referencia = selecionarAulaReferenciaCheckinLivre(
    aulas.map((aula) => montarCandidataCheckinLivre(aula, params.alunoId)),
    params.agora,
  )
  if (!referencia) {
    return {
      ok: false,
      codigo: "SEM_AULA_REFERENCIA",
      motivo: "Não há aula oficial desta modalidade hoje para vincular o check-in.",
    }
  }

  return { ok: true, aulaId: referencia.id, associadoAutomaticamente: true }
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
    const mensagem = `${aluno.usuario.nome} tentou fazer check-in na aula ${nomeAula}, em ${formatarDataHora(aula.inicio)}, mas a mensalidade está em atraso.`

    for (const usuarioId of destinatarios) {
      await criarNotificacao(tx, {
        usuarioId,
        tipo: "FINANCEIRO",
        titulo: "Check-in bloqueado",
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
  confirmouCheckinPlataforma: boolean
  agora?: Date
}): Promise<ResultadoCheckin> {
  if (!(await tokenCheckinValido(params.token))) {
    return {
      ok: false,
      codigo: "TOKEN_INVALIDO",
      motivo: "QR Code expirado. Leia o QR Code atual na entrada da academia.",
    }
  }

  return realizarCheckinComAulaReferencia({
    alunoId: params.alunoId,
    aulaId: params.aulaId,
    autorId: params.autorId,
    origem: "QR_CODE",
    confirmouCheckinPlataforma: params.confirmouCheckinPlataforma,
    agora: params.agora ?? new Date(),
  })
}

/**
 * Confirma o check-in pela localização atual do dispositivo. As coordenadas não são persistidas;
 * elas apenas autorizam esta tentativa quando estão a até 300 m da academia.
 */
export async function realizarCheckinGeolocalizacao(params: {
  alunoId: string
  aulaId: string
  autorId: string
  latitude: number
  longitude: number
  confirmouCheckinPlataforma: boolean
  agora?: Date
}): Promise<ResultadoCheckin> {
  if (!coordenadasGeograficasValidas(params.latitude, params.longitude)) {
    return {
      ok: false,
      codigo: "LOCALIZACAO_INVALIDA",
      motivo: "Não foi possível validar a localização informada.",
    }
  }

  if (!estaProximoDaAcademia(params.latitude, params.longitude)) {
    return {
      ok: false,
      codigo: "FORA_DA_AREA",
      motivo:
        "Você precisa estar a até 300 metros da academia para fazer check-in pela localização.",
    }
  }

  return realizarCheckinComAulaReferencia({
    alunoId: params.alunoId,
    aulaId: params.aulaId,
    autorId: params.autorId,
    origem: "GEOLOCALIZACAO",
    confirmouCheckinPlataforma: params.confirmouCheckinPlataforma,
    agora: params.agora ?? new Date(),
  })
}

async function realizarCheckinComAulaReferencia(params: {
  alunoId: string
  aulaId: string
  autorId: string
  origem: OrigemCheckin
  confirmouCheckinPlataforma: boolean
  agora: Date
}): Promise<ResultadoCheckin> {
  const alunoAvulso = await db.aluno.findUnique({
    where: { id: params.alunoId },
    select: {
      tipo: true,
      solicitacaoMatricula: { select: { tipoPagamento: true } },
    },
  })
  if (
    alunoAvulso?.tipo === "AVULSO" &&
    alunoAvulso.solicitacaoMatricula?.tipoPagamento === "AULA_AVULSA"
  ) {
    const acesso = await db.acessoAulaAvulsa.findFirst({
      where: { alunoId: params.alunoId, aulaId: params.aulaId, status: "ATIVO" },
      select: { id: true },
    })
    if (!acesso) {
      return { ok: false, motivo: "Esta aula não está incluída no seu acesso avulso." }
    }
    return realizarCheckin({
      alunoId: params.alunoId,
      aulaId: params.aulaId,
      autorId: params.autorId,
      origem: params.origem,
      exigirJanelaCheckin: true,
      bloquearInadimplenciaSempre: true,
      confirmouCheckinPlataforma: false,
      associadoAutomaticamente: false,
      agora: params.agora,
    })
  }
  const referencia = await resolverAulaReferenciaCheckinAluno(params)
  if (!referencia.ok) return referencia

  const resultado = await realizarCheckin({
    alunoId: params.alunoId,
    aulaId: referencia.aulaId,
    autorId: params.autorId,
    origem: params.origem,
    exigirJanelaCheckin: true,
    bloquearInadimplenciaSempre: true,
    confirmouCheckinPlataforma: params.confirmouCheckinPlataforma,
    associadoAutomaticamente: referencia.associadoAutomaticamente,
    agora: params.agora,
  })
  if (
    resultado.ok ||
    !referencia.associadoAutomaticamente ||
    resultado.motivo !== "Aula sem vagas disponíveis."
  ) {
    return resultado
  }

  // A referência pode ter lotado entre a seleção e o lock transacional. Reconsulta uma vez
  // para aproveitar o próximo horário futuro disponível, sem confirmar além da capacidade.
  const novaReferencia = await resolverAulaReferenciaCheckinAluno(params)
  if (!novaReferencia.ok || novaReferencia.aulaId === referencia.aulaId) return resultado

  return realizarCheckin({
    alunoId: params.alunoId,
    aulaId: novaReferencia.aulaId,
    autorId: params.autorId,
    origem: params.origem,
    exigirJanelaCheckin: true,
    bloquearInadimplenciaSempre: true,
    confirmouCheckinPlataforma: params.confirmouCheckinPlataforma,
    associadoAutomaticamente: true,
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
  confirmouCheckinPlataforma?: boolean
  associadoAutomaticamente?: boolean
  agora?: Date
}): Promise<ResultadoCheckin> {
  const agora = params.agora ?? new Date()
  const config = await configuracao()

  const [aluno, aula, jaCheckin, comparecimento, acessoAvulso] = await Promise.all([
    db.aluno.findUnique({
      where: { id: params.alunoId },
      select: {
        status: true,
        tipo: true,
        planoId: true,
        solicitacaoMatricula: { select: { tipoPagamento: true } },
        usuario: { select: { nome: true } },
        modalidades: { select: { id: true } },
        modalidadesPlano: { select: { modalidadeId: true, plataformaExterna: true } },
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
            nome: true,
            professor: {
              select: { usuarioId: true, ativo: true, usuario: { select: { ativo: true } } },
            },
            modalidadeId: true,
            modalidade: {
              select: {
                nome: true,
                janelaComparecimentoHoras: true,
                prazoCancelamentoHoras: true,
                exigirComparecimentoParaCheckin: true,
                politicaCheckinSemComparecimento: true,
                listaEsperaAtiva: true,
                checkinSemRestricaoHorario: true,
              },
            },
          },
        },
        professor: {
          select: { usuarioId: true, ativo: true, usuario: { select: { ativo: true } } },
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
    db.acessoAulaAvulsa.findFirst({
      where: { alunoId: params.alunoId, aulaId: params.aulaId, status: "ATIVO" },
      select: { id: true },
    }),
  ])

  if (!aluno) return { ok: false, motivo: "Aluno não encontrado." }
  if (!aula) return { ok: false, motivo: "Aula não encontrada." }
  const acessoAvulsoControlado =
    aluno.tipo === "AVULSO" && aluno.solicitacaoMatricula?.tipoPagamento === "AULA_AVULSA"
  if (acessoAvulsoControlado && !acessoAvulso) {
    return { ok: false, motivo: "Esta aula não está incluída no seu acesso avulso." }
  }
  if (
    params.exigirJanelaCheckin &&
    !aula.turma.modalidade.checkinSemRestricaoHorario &&
    !podeRealizarCheckinNaJanela({ inicioAula: aula.inicio, fimAula: aula.fim, agora })
  ) {
    return {
      ok: false,
      codigo: "FORA_DA_JANELA",
      motivo: "Check-in liberado apenas de 30 minutos antes até 30 minutos após o fim da aula.",
    }
  }
  if (!aluno.modalidades.some((modalidade) => modalidade.id === aula.turma.modalidadeId)) {
    return { ok: false, motivo: "Aluno não está matriculado na modalidade desta aula." }
  }
  const lancadoPorTerceiro = Boolean(params.lancadoPorId)
  if (checkinImpedeNovoRegistro(jaCheckin?.status, lancadoPorTerceiro)) {
    return {
      ok: false,
      motivo:
        jaCheckin?.status === "PENDENTE_REVISAO"
          ? "Check-in desta aula já está pendente de revisão."
          : "Check-in já realizado nesta aula.",
    }
  }

  const regras = resolverRegrasTreino(config, aula.turma.modalidade)
  const termoAceito = await termoResponsabilidadeAtualAceito(params.alunoId)
  const modalidadeCobertaPeloPlano = aluno.modalidadesPlano.some(
    (modalidade) =>
      modalidade.modalidadeId === aula.turma.modalidadeId && !modalidade.plataformaExterna,
  )
  const mensalidadeInternaNaModalidade = modalidadeCobertaPeloPlano
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
    possuiPlanoPagamento: Boolean(aluno.planoId),
    modalidadeCobertaPeloPlano,
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
    confirmouCheckinPlataforma: params.confirmouCheckinPlataforma ?? false,
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
  let checkinId: string
  try {
    checkinId = await db.$transaction(async (tx) => {
      // Serializa a modalidade para manter a ofensiva consistente entre turmas/horários concorrentes.
      await tx.$queryRaw`SELECT "id" FROM "Modalidade" WHERE "id" = ${aula.turma.modalidadeId} FOR UPDATE`
      // Serializa check-ins da mesma aula para revalidar duplicidade e capacidade sem corrida.
      await tx.$queryRaw`SELECT "id" FROM "Aula" WHERE "id" = ${aula.id} FOR UPDATE`
      if (acessoAvulsoControlado && acessoAvulso) {
        await tx.$queryRaw`SELECT "id" FROM "AcessoAulaAvulsa" WHERE "id" = ${acessoAvulso.id} FOR UPDATE`
      }
      const [
        aulaAtual,
        checkinAtual,
        comparecimentoAtual,
        comparecimentosAtivos,
        checkinsValidos,
        acessoAvulsoAtual,
      ] = await Promise.all([
        tx.aula.findUnique({
          where: { id: aula.id },
          select: {
            inicio: true,
            cancelada: true,
            duracaoMin: true,
            turma: { select: { capacidade: true, modalidadeId: true } },
          },
        }),
        tx.checkin.findUnique({
          where: { alunoId_aulaId: { alunoId: params.alunoId, aulaId: aula.id } },
          select: { id: true, status: true },
        }),
        tx.comparecimento.findUnique({
          where: { alunoId_aulaId: { alunoId: params.alunoId, aulaId: aula.id } },
          select: { id: true, status: true },
        }),
        tx.comparecimento.findMany({
          where: {
            aulaId: aula.id,
            status: { in: ["CONFIRMADO", "CONVERTIDO_CHECKIN"] },
          },
          select: { alunoId: true },
        }),
        tx.checkin.findMany({
          where: { aulaId: aula.id, status: "VALIDO" },
          select: { alunoId: true },
        }),
        acessoAvulsoControlado && acessoAvulso
          ? tx.acessoAulaAvulsa.findUnique({
              where: { id: acessoAvulso.id },
              select: { status: true, aulaId: true },
            })
          : Promise.resolve(null),
      ])

      if (!aulaAtual || aulaAtual.cancelada) {
        throw new ErroConcorrenciaCheckin("Aula cancelada ou indisponível.")
      }
      if (
        acessoAvulsoControlado &&
        (acessoAvulsoAtual?.status !== "ATIVO" || acessoAvulsoAtual?.aulaId !== aula.id)
      ) {
        throw new ErroConcorrenciaCheckin("O acesso avulso não está disponível para esta aula.")
      }

      if (checkinImpedeNovoRegistro(checkinAtual?.status, lancadoPorTerceiro)) {
        throw new ErroConcorrenciaCheckin(
          checkinAtual?.status === "PENDENTE_REVISAO"
            ? "Check-in desta aula já está pendente de revisão."
            : "Check-in já realizado nesta aula.",
        )
      }

      const temReserva =
        comparecimentoAtual?.status === "CONFIRMADO" ||
        comparecimentoAtual?.status === "CONVERTIDO_CHECKIN"
      const ocupacaoAtual = new Set([
        ...comparecimentosAtivos.map((item) => item.alunoId),
        ...checkinsValidos.map((item) => item.alunoId),
      ]).size
      if (
        !temReserva &&
        aulaAtual.turma.capacidade > 0 &&
        ocupacaoAtual >= aulaAtual.turma.capacidade
      ) {
        throw new ErroConcorrenciaCheckin("Aula sem vagas disponíveis.")
      }

      // Reaproveita o registro se já existir invalidado/excluído (mantém histórico via @@unique).
      const checkin = checkinAtual
        ? await tx.checkin.update({
            where: { id: checkinAtual.id },
            data: {
              status: statusNovo,
              origem: params.origem ?? "BOTAO",
              retroativo: params.retroativo ?? false,
              lancadoPorId: params.lancadoPorId ?? null,
              invalidadoPorId: null,
              invalidadoEm: null,
              justificativa: params.justificativa ?? null,
              realizadoEm: agora,
              associadoAutomaticamente: params.associadoAutomaticamente ?? false,
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
              realizadoEm: agora,
              associadoAutomaticamente: params.associadoAutomaticamente ?? false,
            },
          })

      if (
        !avaliacao.pendenteRevisao &&
        comparecimentoAtual &&
        comparecimentoAtual.status !== "CONVERTIDO_CHECKIN"
      ) {
        await tx.comparecimento.update({
          where: { id: comparecimentoAtual.id },
          data: { status: "CONVERTIDO_CHECKIN" },
        })
      }

      if (!avaliacao.pendenteRevisao) {
        // RN-002: horas = duração da aula, na modalidade da turma.
        await creditarPorCheckin(tx, {
          alunoId: params.alunoId,
          modalidadeId: aulaAtual.turma.modalidadeId,
          checkinId: checkin.id,
          minutos: aulaAtual.duracaoMin,
        })
        if (acessoAvulsoControlado && acessoAvulso) {
          await tx.acessoAulaAvulsa.update({
            where: { id: acessoAvulso.id },
            data: { status: "USADO", checkinId: checkin.id },
          })
        }
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
            minutos: avaliacao.pendenteRevisao ? 0 : aulaAtual.duracaoMin,
            realizadoEm: agora.toISOString(),
            aulaInicio: aulaAtual.inicio.toISOString(),
            origem: params.origem ?? "BOTAO",
            associadoAutomaticamente: params.associadoAutomaticamente ?? false,
          },
          justificativa: params.justificativa ?? null,
        },
        tx,
      )

      if (!params.lancadoPorId) {
        const professorUsuarioId = usuarioProfessorResponsavelCheckin({
          professorAula: aula.professor,
          professorTurma: aula.turma.professor,
        })
        if (professorUsuarioId) {
          await criarNotificacao(tx, {
            usuarioId: professorUsuarioId,
            tipo: "CHECKIN_REALIZADO",
            ...conteudoNotificacaoCheckinRealizado({
              alunoNome: aluno.usuario.nome,
              nomeAula: aula.turma.nome ?? aula.turma.modalidade.nome,
              inicioAula: aulaAtual.inicio,
              pendenteRevisao: avaliacao.pendenteRevisao ?? false,
            }),
          })
        }
      }

      if (!avaliacao.pendenteRevisao) {
        await sincronizarOfensivasDaModalidade(tx, {
          modalidadeId: aulaAtual.turma.modalidadeId,
          agora,
        })
      }

      return checkin.id
    })
  } catch (erro) {
    if (erro instanceof ErroConcorrenciaCheckin) {
      return { ok: false, motivo: erro.message }
    }
    throw erro
  }

  return { ok: true, checkinId, aulaId: aula.id, status: statusNovo }
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
    select: {
      id: true,
      status: true,
      alunoId: true,
      aluno: { select: { usuarioId: true } },
      aula: {
        select: {
          inicio: true,
          turma: {
            select: {
              nome: true,
              modalidadeId: true,
              modalidade: { select: { nome: true } },
            },
          },
        },
      },
      movimentos: {
        where: { tipo: "CREDITO" },
        orderBy: { criadoEm: "asc" },
        take: 1,
        select: { modalidadeId: true },
      },
    },
  })
  if (!checkin) return { ok: false, motivo: "Check-in não encontrado." }
  if (checkin.status !== "VALIDO") return { ok: false, motivo: "Check-in já não está válido." }

  const foiInvalidado = await db.$transaction(async (tx) => {
    const modalidadeId = checkin.movimentos[0]?.modalidadeId ?? checkin.aula.turma.modalidadeId
    await tx.$queryRaw`SELECT "id" FROM "Modalidade" WHERE "id" = ${modalidadeId} FOR UPDATE`
    await tx.$queryRaw`SELECT "id" FROM "Checkin" WHERE "id" = ${checkin.id} FOR UPDATE`
    const checkinAtual = await tx.checkin.findUnique({
      where: { id: checkin.id },
      select: { status: true },
    })
    if (checkinAtual?.status !== "VALIDO") return false

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
      titulo: params.excluir ? "Seu check-in foi removido" : "Seu check-in foi invalidado",
      mensagem: `${checkin.aula.turma.nome ?? checkin.aula.turma.modalidade.nome}, em ${formatarDataHora(checkin.aula.inicio)}. Motivo: ${params.justificativa}`,
    })

    await sincronizarOfensivasDaModalidade(tx, { modalidadeId })

    return true
  })

  if (!foiInvalidado) return { ok: false, motivo: "Check-in já não está válido." }

  return { ok: true, checkinId: checkin.id }
}

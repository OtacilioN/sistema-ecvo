import "server-only"
import type { Prisma, TipoNotificacao } from "@prisma/client"
import { formatInTimeZone } from "date-fns-tz"
import { db } from "@/lib/db"
import { enviarPushParaNotificacao } from "@/lib/services/push.service"
import { formatarDataHora, TIMEZONE } from "@/lib/utils/datas"

type Cliente = Prisma.TransactionClient | typeof db

type CampoConfiguracaoNotificacao =
  | "notificarComparecimento"
  | "notificarLembreteTreino"
  | "notificarCancelamentoAula"
  | "notificarFinanceiro"
  | "notificarGraduacao"
  | "notificarCheckinInvalidado"
  | "notificarAniversario"

const CAMPO_CONFIG: Record<TipoNotificacao, CampoConfiguracaoNotificacao> = {
  COMPARECIMENTO: "notificarComparecimento",
  LEMBRETE_TREINO: "notificarLembreteTreino",
  CANCELAMENTO_AULA: "notificarCancelamentoAula",
  FINANCEIRO: "notificarFinanceiro",
  GRADUACAO: "notificarGraduacao",
  CHECKIN_INVALIDADO: "notificarCheckinInvalidado",
  ANIVERSARIO: "notificarAniversario",
}

export function campoConfiguracaoNotificacao(tipo: TipoNotificacao): CampoConfiguracaoNotificacao {
  return CAMPO_CONFIG[tipo]
}

export async function notificacaoAtiva(cliente: Cliente, tipo: TipoNotificacao): Promise<boolean> {
  const campo = campoConfiguracaoNotificacao(tipo)
  const config = await cliente.configuracaoAcademia.findUnique({
    where: { id: "default" },
    select: { [campo]: true },
  })
  return config?.[campo] ?? true
}

export async function criarNotificacao(
  cliente: Cliente,
  params: {
    usuarioId: string
    tipo: TipoNotificacao
    titulo: string
    mensagem: string
  },
) {
  if (!(await notificacaoAtiva(cliente, params.tipo))) return null

  const notificacao = await cliente.notificacao.create({
    data: {
      usuarioId: params.usuarioId,
      tipo: params.tipo,
      titulo: params.titulo,
      mensagem: params.mensagem,
    },
  })

  try {
    await enviarPushParaNotificacao(notificacao)
  } catch {
    // Push é um canal secundário; a notificação interna continua sendo a fonte de verdade.
  }

  return notificacao
}

export async function gerarLembretesTreino(
  cliente: Cliente,
  params?: { agora?: Date; janelaMinutos?: number },
) {
  if (!(await notificacaoAtiva(cliente, "LEMBRETE_TREINO"))) return { ok: true as const, total: 0 }

  const agora = params?.agora ?? new Date()
  const limite = new Date(agora.getTime() + (params?.janelaMinutos ?? 120) * 60_000)
  const comparecimentos = await cliente.comparecimento.findMany({
    where: {
      status: "CONFIRMADO",
      aula: {
        cancelada: false,
        inicio: { gte: agora, lte: limite },
      },
    },
    take: 200,
    include: {
      aluno: { select: { usuarioId: true } },
      aula: {
        include: {
          turma: { select: { nome: true, modalidade: { select: { nome: true } } } },
          checkins: { where: { status: "VALIDO" }, select: { alunoId: true } },
        },
      },
    },
  })

  let total = 0
  for (const comparecimento of comparecimentos) {
    const jaFezCheckin = comparecimento.aula.checkins.some(
      (checkin) => checkin.alunoId === comparecimento.alunoId,
    )
    if (jaFezCheckin) continue

    const titulo = "Lembrete de treino"
    const mensagem = `${
      comparecimento.aula.turma.nome ?? comparecimento.aula.turma.modalidade.nome
    }: aula em ${formatarDataHora(comparecimento.aula.inicio)}.`
    const existente = await cliente.notificacao.findFirst({
      where: {
        usuarioId: comparecimento.aluno.usuarioId,
        tipo: "LEMBRETE_TREINO",
        titulo,
        mensagem,
      },
      select: { id: true },
    })
    if (existente) continue

    await cliente.notificacao.create({
      data: {
        usuarioId: comparecimento.aluno.usuarioId,
        tipo: "LEMBRETE_TREINO",
        titulo,
        mensagem,
      },
    })
    total++
  }

  return { ok: true as const, total }
}

export function mensagemLembreteAniversario(params: { alunoNome: string; dataNascimento: Date }): {
  titulo: string
  mensagem: string
} {
  return {
    titulo: "Aniversário amanhã",
    mensagem: `${params.alunoNome} faz aniversário amanhã (${formatInTimeZone(
      params.dataNascimento,
      TIMEZONE,
      "dd/MM",
    )}).`,
  }
}

export async function gerarLembretesAniversario(cliente: Cliente = db, params?: { agora?: Date }) {
  if (!(await notificacaoAtiva(cliente, "ANIVERSARIO"))) return { ok: true as const, total: 0 }

  const agora = params?.agora ?? new Date()
  const alvo = new Date(agora.getTime() + 24 * 60 * 60 * 1000)
  const chaveAlvo = formatInTimeZone(alvo, TIMEZONE, "MM-dd")

  const [gestores, alunos] = await Promise.all([
    cliente.usuario.findMany({
      where: { papel: "GESTOR", ativo: true },
      select: { id: true },
    }),
    cliente.aluno.findMany({
      where: {
        status: "ATIVO",
        dataNascimento: { not: null },
        usuario: { ativo: true },
      },
      include: {
        usuario: { select: { nome: true } },
        modalidades: {
          select: {
            professores: {
              where: { ativo: true, usuario: { ativo: true } },
              select: { usuarioId: true },
            },
          },
        },
      },
    }),
  ])

  let total = 0
  for (const aluno of alunos) {
    if (!aluno.dataNascimento) continue
    if (formatInTimeZone(aluno.dataNascimento, TIMEZONE, "MM-dd") !== chaveAlvo) continue

    const destinatarios = new Set(gestores.map((gestor) => gestor.id))
    for (const modalidade of aluno.modalidades) {
      for (const professor of modalidade.professores) {
        destinatarios.add(professor.usuarioId)
      }
    }

    const conteudo = mensagemLembreteAniversario({
      alunoNome: aluno.usuario.nome,
      dataNascimento: aluno.dataNascimento,
    })

    for (const usuarioId of destinatarios) {
      if (await criarNotificacaoUnica(cliente, usuarioId, "ANIVERSARIO", conteudo)) total++
    }
  }

  return { ok: true as const, total }
}

async function criarNotificacaoUnica(
  cliente: Cliente,
  usuarioId: string,
  tipo: TipoNotificacao,
  conteudo: { titulo: string; mensagem: string },
): Promise<boolean> {
  const existente = await cliente.notificacao.findFirst({
    where: {
      usuarioId,
      tipo,
      titulo: conteudo.titulo,
      mensagem: conteudo.mensagem,
    },
    select: { id: true },
  })
  if (existente) return false

  await cliente.notificacao.create({
    data: {
      usuarioId,
      tipo,
      ...conteudo,
    },
  })
  return true
}

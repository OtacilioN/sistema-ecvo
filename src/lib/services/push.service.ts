import "server-only"
import type { Papel, TipoNotificacao } from "@prisma/client"
import webPush from "web-push"
import { db } from "@/lib/db"
import type { InscricaoPushInput } from "@/lib/validations/push"

type NotificacaoPush = {
  id: string
  usuarioId: string
  tipo: TipoNotificacao
  titulo: string
  mensagem: string
}

type ResultadoPush = {
  configurado: boolean
  tentativas: number
  enviados: number
  removidos: number
  falhas: Array<{
    inscricaoId: string
    endpointHost: string | null
    userAgent: string | null
    statusCode: number | null
    mensagem: string
  }>
}

let vapidConfigurado = false
let assinaturaConfigurada: string | null = null

export function chavePublicaPush(): string | null {
  return process.env.WEB_PUSH_PUBLIC_KEY || null
}

export function pushConfigurado(): boolean {
  return Boolean(
    process.env.WEB_PUSH_PUBLIC_KEY &&
      process.env.WEB_PUSH_PRIVATE_KEY &&
      process.env.WEB_PUSH_SUBJECT,
  )
}

function configurarVapid() {
  const publicKey = process.env.WEB_PUSH_PUBLIC_KEY
  const privateKey = process.env.WEB_PUSH_PRIVATE_KEY
  const subject = process.env.WEB_PUSH_SUBJECT
  const assinatura = `${subject ?? ""}:${publicKey ?? ""}:${privateKey ?? ""}`

  if (!publicKey || !privateKey || !subject) return false
  if (vapidConfigurado && assinaturaConfigurada === assinatura) return true

  webPush.setVapidDetails(subject, publicKey, privateKey)
  vapidConfigurado = true
  assinaturaConfigurada = assinatura
  return true
}

function expiraEm(expirationTime?: number | null): Date | null {
  return typeof expirationTime === "number" ? new Date(expirationTime) : null
}

function urlNotificacoesPorPapel(papel: Papel): string {
  if (papel === "ALUNO") return "/aluno/notificacoes"
  if (papel === "PROFESSOR") return "/professor/notificacoes"
  return "/gestao/notificacoes"
}

function codigoErroPush(erro: unknown): number | null {
  if (!erro || typeof erro !== "object" || !("statusCode" in erro)) return null
  const statusCode = (erro as { statusCode?: unknown }).statusCode
  return typeof statusCode === "number" ? statusCode : null
}

function mensagemErroPush(erro: unknown): string {
  if (erro instanceof Error) return erro.message
  return String(erro)
}

function hostEndpoint(endpoint: string): string | null {
  try {
    return new URL(endpoint).hostname
  } catch {
    return null
  }
}

function opcoesEnvioPush(notificacaoId: string, endpoint: string) {
  const opcoes: webPush.RequestOptions = {
    TTL: 60 * 60 * 24,
    urgency: "normal",
  }

  if (hostEndpoint(endpoint) !== "web.push.apple.com") {
    opcoes.topic = notificacaoId.slice(0, 32)
  }

  return opcoes
}

export async function salvarInscricaoPush(params: {
  usuarioId: string
  inscricao: InscricaoPushInput
  userAgent?: string | null
}) {
  const { inscricao } = params

  return db.inscricaoPush.upsert({
    where: { endpoint: inscricao.endpoint },
    update: {
      usuarioId: params.usuarioId,
      p256dh: inscricao.keys.p256dh,
      auth: inscricao.keys.auth,
      expiraEm: expiraEm(inscricao.expirationTime),
      userAgent: params.userAgent ?? null,
      revogadaEm: null,
      ultimoUsoEm: new Date(),
    },
    create: {
      usuarioId: params.usuarioId,
      endpoint: inscricao.endpoint,
      p256dh: inscricao.keys.p256dh,
      auth: inscricao.keys.auth,
      expiraEm: expiraEm(inscricao.expirationTime),
      userAgent: params.userAgent ?? null,
      ultimoUsoEm: new Date(),
    },
  })
}

export async function removerInscricaoPush(params: { usuarioId: string; endpoint: string }) {
  await db.inscricaoPush.deleteMany({
    where: { usuarioId: params.usuarioId, endpoint: params.endpoint },
  })
}

export async function usuarioTemInscricaoPush(usuarioId: string): Promise<boolean> {
  const total = await db.inscricaoPush.count({
    where: { usuarioId, revogadaEm: null },
  })
  return total > 0
}

export async function enviarPushParaNotificacao(
  notificacao: NotificacaoPush,
): Promise<ResultadoPush> {
  if (!configurarVapid()) {
    return { configurado: false, tentativas: 0, enviados: 0, removidos: 0, falhas: [] }
  }

  const inscricoes = await db.inscricaoPush.findMany({
    where: { usuarioId: notificacao.usuarioId, revogadaEm: null },
    include: { usuario: { select: { papel: true } } },
  })

  let enviados = 0
  let removidos = 0
  const falhas: ResultadoPush["falhas"] = []
  const url = urlNotificacoesPorPapel(inscricoes[0]?.usuario.papel ?? "ALUNO")
  const payload = JSON.stringify({
    notificacaoId: notificacao.id,
    tipo: notificacao.tipo,
    titulo: notificacao.titulo,
    mensagem: notificacao.mensagem,
    url,
  })

  for (const inscricao of inscricoes) {
    try {
      await webPush.sendNotification(
        {
          endpoint: inscricao.endpoint,
          keys: {
            p256dh: inscricao.p256dh,
            auth: inscricao.auth,
          },
        },
        payload,
        opcoesEnvioPush(notificacao.id, inscricao.endpoint),
      )
      enviados++
      await db.inscricaoPush.update({
        where: { id: inscricao.id },
        data: { ultimoUsoEm: new Date() },
      })
    } catch (erro) {
      const statusCode = codigoErroPush(erro)
      if (statusCode === 404 || statusCode === 410) {
        await db.inscricaoPush.delete({ where: { id: inscricao.id } })
        removidos++
      } else {
        falhas.push({
          inscricaoId: inscricao.id,
          endpointHost: hostEndpoint(inscricao.endpoint),
          userAgent: inscricao.userAgent,
          statusCode,
          mensagem: mensagemErroPush(erro),
        })
      }
    }
  }

  return { configurado: true, tentativas: inscricoes.length, enviados, removidos, falhas }
}

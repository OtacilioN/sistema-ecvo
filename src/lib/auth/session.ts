import "server-only"
import { createHash } from "node:crypto"
import type { Papel } from "@prisma/client"
import { jwtVerify, SignJWT } from "jose"
import { cookies } from "next/headers"

// JWT em cookie httpOnly; a autorização também valida a sessão do dispositivo no banco.
// Carrega apenas o mínimo necessário (id, papel, nome) — nunca dados sensíveis (RNF-005).

const NOME_COOKIE = "ecvo_sessao"
const DIA_MS = 24 * 60 * 60 * 1000
const DURACAO_ALUNO_MS = 365 * DIA_MS

export type SessaoPayload = {
  sub: string // id do Usuario
  papel: Papel
  nome: string
  versao?: number
  sessaoId?: string
  legada?: boolean
  exp?: number
}

function expiracaoSessao(papel: Papel): Date {
  return new Date(Date.now() + (papel === "ALUNO" ? DURACAO_ALUNO_MS : 7 * DIA_MS))
}

function opcoesCookie(expires: Date) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    expires,
    path: "/",
  }
}

function chave() {
  const secret = process.env.SESSION_SECRET
  if (!secret) throw new Error("SESSION_SECRET não configurado (.env)")
  return new TextEncoder().encode(secret)
}

export async function encriptar(
  payload: SessaoPayload,
  expiresAt = expiracaoSessao(payload.papel),
): Promise<string> {
  // Reemite só os dados de identidade: exp/iat antigos não devem ser propagados.
  return new SignJWT({
    sub: payload.sub,
    papel: payload.papel,
    nome: payload.nome,
    versao: payload.versao,
    sessaoId: payload.sessaoId,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(Math.floor(expiresAt.getTime() / 1000))
    .sign(chave())
}

export async function descriptografar(token: string | undefined): Promise<SessaoPayload | null> {
  if (!token) return null
  try {
    const { payload } = await jwtVerify(token, chave(), { algorithms: ["HS256"] })
    return payload as unknown as SessaoPayload
  } catch {
    return null
  }
}

export async function criarSessao(payload: SessaoPayload): Promise<void> {
  const expiresAt = expiracaoSessao(payload.papel)
  const { criarSessaoDispositivo } = await import("@/lib/services/sessao-dispositivo.service")
  const expiraEm = new Date(Math.min(expiresAt.getTime(), Date.now() + 30 * DIA_MS))
  const sessaoId = await criarSessaoDispositivo(payload.sub, expiraEm)
  const token = await encriptar({ ...payload, sessaoId }, expiresAt)
  const cookieStore = await cookies()
  cookieStore.set(NOME_COOKIE, token, opcoesCookie(expiresAt))
}

export async function lerSessao(): Promise<SessaoPayload | null> {
  const cookieStore = await cookies()
  const token = cookieStore.get(NOME_COOKIE)?.value
  const sessao = await descriptografar(token)
  if (!sessao?.sub || !sessao.exp || !token) return null
  if (!sessao.sessaoId) {
    return {
      ...sessao,
      sessaoId: `legado:${createHash("sha256").update(token).digest("hex")}`,
      legada: true,
    }
  }
  return sessao
}

export async function destruirSessao(): Promise<void> {
  const sessao = await lerSessao()
  if (sessao?.sessaoId && sessao.exp) {
    const servico = await import("@/lib/services/sessao-dispositivo.service")
    if (sessao.legada) {
      await servico.revogarSessaoLegada(sessao.sessaoId, sessao.sub, new Date(sessao.exp * 1000))
    } else {
      await servico.revogarSessaoDispositivo(sessao.sessaoId, sessao.sub)
    }
  }
  const cookieStore = await cookies()
  cookieStore.delete(NOME_COOKIE)
}

export const COOKIE_SESSAO = NOME_COOKIE

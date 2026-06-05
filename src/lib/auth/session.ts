import "server-only"
import type { Papel } from "@prisma/client"
import { jwtVerify, SignJWT } from "jose"
import { cookies } from "next/headers"

// Sessão "stateless" assinada (JWT em cookie httpOnly), conforme o guia oficial do Next.js 16.
// Carrega apenas o mínimo necessário (id, papel, nome) — nunca dados sensíveis (RNF-005).

const NOME_COOKIE = "ecvo_sessao"
const DURACAO_MS = 7 * 24 * 60 * 60 * 1000 // 7 dias

export type SessaoPayload = {
  sub: string // id do Usuario
  papel: Papel
  nome: string
}

function chave() {
  const secret = process.env.SESSION_SECRET
  if (!secret) throw new Error("SESSION_SECRET não configurado (.env)")
  return new TextEncoder().encode(secret)
}

export async function encriptar(payload: SessaoPayload): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
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
  const expiresAt = new Date(Date.now() + DURACAO_MS)
  const token = await encriptar(payload)
  const cookieStore = await cookies()
  cookieStore.set(NOME_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    expires: expiresAt,
    path: "/",
  })
}

export async function lerSessao(): Promise<SessaoPayload | null> {
  const cookieStore = await cookies()
  const token = cookieStore.get(NOME_COOKIE)?.value
  return descriptografar(token)
}

export async function destruirSessao(): Promise<void> {
  const cookieStore = await cookies()
  cookieStore.delete(NOME_COOKIE)
}

export const COOKIE_SESSAO = NOME_COOKIE

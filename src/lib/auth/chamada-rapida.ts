import "server-only"
import { createHash, timingSafeEqual } from "node:crypto"
import { jwtVerify, SignJWT } from "jose"
import { cookies } from "next/headers"
import {
  coordenadasGeograficasValidas,
  distanciaEmMetros,
  LOCALIZACAO_ACADEMIA,
} from "@/lib/geolocalizacao"

export const ROTA_CHAMADA = "/gestao/checkin"
export const COOKIE_CHAMADA = "ecvo_chamada"
export const COOKIE_LOCALIZACAO_CHAMADA = "ecvo_chamada_localizacao"
export const DURACAO_CHAMADA_SEGUNDOS = 30 * 60
const DURACAO_LOCALIZACAO_SEGUNDOS = 2 * 60
const EMISSOR = "ecvo:chamada-rapida"

export function chaveChamadaValida(valor: unknown): valor is string {
  const configurada = process.env.CHECKIN_CHAMADA_CHAVE
  if (!configurada || configurada.length < 32 || typeof valor !== "string" || valor.length > 256)
    return false
  const hash = (texto: string) => createHash("sha256").update(texto).digest()
  return timingSafeEqual(hash(valor), hash(configurada))
}

export function localizacaoChamadaValida(dados: {
  latitude: number
  longitude: number
  precisao: number
  capturadaEm: number
}): boolean {
  return (
    coordenadasGeograficasValidas(dados.latitude, dados.longitude) &&
    Number.isFinite(dados.precisao) &&
    dados.precisao > 0 &&
    dados.precisao <= 200 &&
    Number.isFinite(dados.capturadaEm) &&
    Math.abs(Date.now() - dados.capturadaEm) <= 60_000 &&
    distanciaEmMetros(dados, LOCALIZACAO_ACADEMIA) <= 200
  )
}

// Chave e finalidade distintas da sessão do usuário. Rotacionar a chave do QR
// invalida também todas as autorizações rápidas já emitidas.
function chaveAssinatura() {
  const sessao = process.env.SESSION_SECRET
  const chamada = process.env.CHECKIN_CHAMADA_CHAVE
  if (!sessao || !chaveChamadaValida(chamada)) throw new Error("Chamada rápida não configurada")
  return createHash("sha256").update(`${EMISSOR}\0${sessao}\0${chamada}`).digest()
}

export async function emitirPermissaoChamada(etapa: "localizacao" | "consulta") {
  const duracao = etapa === "consulta" ? DURACAO_CHAMADA_SEGUNDOS : DURACAO_LOCALIZACAO_SEGUNDOS
  const token = await new SignJWT({ etapa })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer(EMISSOR)
    .setAudience(ROTA_CHAMADA)
    .setIssuedAt()
    .setExpirationTime(`${duracao}s`)
    .sign(chaveAssinatura())
  const store = await cookies()
  store.set(etapa === "consulta" ? COOKIE_CHAMADA : COOKIE_LOCALIZACAO_CHAMADA, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: ROTA_CHAMADA,
    maxAge: duracao,
  })
}

export async function temPermissaoChamada(etapa: "localizacao" | "consulta") {
  const store = await cookies()
  const token = store.get(etapa === "consulta" ? COOKIE_CHAMADA : COOKIE_LOCALIZACAO_CHAMADA)?.value
  if (!token) return false
  try {
    const { payload } = await jwtVerify(token, chaveAssinatura(), {
      algorithms: ["HS256"],
      issuer: EMISSOR,
      audience: ROTA_CHAMADA,
    })
    return payload.etapa === etapa
  } catch {
    return false
  }
}

export async function limparLocalizacaoChamada() {
  ;(await cookies()).set(COOKIE_LOCALIZACAO_CHAMADA, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: ROTA_CHAMADA,
    maxAge: 0,
  })
}

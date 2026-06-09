import "server-only"
import { randomBytes, timingSafeEqual } from "node:crypto"
import { db } from "@/lib/db"
import { registrarLog } from "@/lib/services/auditoria.service"

const TOKEN_GLOBAL_ID = "global"

function gerarToken(): string {
  return randomBytes(32).toString("base64url")
}

export function mascararTokenCheckin(token: string | null | undefined): string | null {
  if (!token) return null
  if (token.length <= 10) return token
  return `${token.slice(0, 5)}...${token.slice(-5)}`
}

export async function obterOuCriarTokenCheckinAcademia() {
  const atual = await db.tokenCheckinAcademia.findUnique({ where: { id: TOKEN_GLOBAL_ID } })
  if (atual) return atual

  return db.tokenCheckinAcademia.create({
    data: {
      id: TOKEN_GLOBAL_ID,
      token: gerarToken(),
    },
  })
}

export async function rotacionarTokenCheckinAcademia(params: { autorId: string }) {
  return db.$transaction(async (tx) => {
    const anterior = await tx.tokenCheckinAcademia.findUnique({ where: { id: TOKEN_GLOBAL_ID } })
    const token = gerarToken()
    const salvo = anterior
      ? await tx.tokenCheckinAcademia.update({
          where: { id: TOKEN_GLOBAL_ID },
          data: {
            token,
            rotacionadoPorId: params.autorId,
          },
        })
      : await tx.tokenCheckinAcademia.create({
          data: {
            id: TOKEN_GLOBAL_ID,
            token,
            rotacionadoPorId: params.autorId,
          },
        })

    await registrarLog(
      {
        autorId: params.autorId,
        acao: "CONFIGURACAO",
        entidade: "TokenCheckinAcademia",
        entidadeId: TOKEN_GLOBAL_ID,
        valorAntigo: { token: mascararTokenCheckin(anterior?.token) },
        valorNovo: { token: mascararTokenCheckin(salvo.token) },
        justificativa: "Rotação do QR Code global de check-in",
      },
      tx,
    )

    return salvo
  })
}

export async function tokenCheckinValido(token: string): Promise<boolean> {
  if (!token) return false
  const atual = await db.tokenCheckinAcademia.findUnique({
    where: { id: TOKEN_GLOBAL_ID },
    select: { token: true },
  })
  if (!atual) return false

  const recebido = Buffer.from(token)
  const esperado = Buffer.from(atual.token)
  return recebido.length === esperado.length && timingSafeEqual(recebido, esperado)
}

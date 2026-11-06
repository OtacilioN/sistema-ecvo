import "server-only"
import { randomUUID } from "node:crypto"
import { db } from "@/lib/db"

const DIA_MS = 24 * 60 * 60 * 1000

/** Cada login recebe um identificador próprio, sem armazenar o JWT. */
export async function criarSessaoDispositivo(usuarioId: string, expiraEm: Date): Promise<string> {
  const id = `sessao:${randomUUID()}`
  await db.sessaoDispositivo.create({ data: { id, usuarioId, expiraEm } })
  return id
}

export async function validarSessaoDispositivo(id: string, usuarioId: string): Promise<boolean> {
  const sessao = await db.sessaoDispositivo.findFirst({
    where: { id, usuarioId, revogadaEm: null, expiraEm: { gt: new Date() } },
    select: { id: true },
  })
  return Boolean(sessao)
}

/** A atualização nunca recria, ressuscita ou prolonga uma sessão já expirada. */
export async function renovarSessaoDispositivo(
  id: string,
  usuarioId: string,
  expiraEm: Date,
): Promise<boolean> {
  const agora = new Date()
  if (expiraEm <= agora) return false
  const resultado = await db.sessaoDispositivo.updateMany({
    where: {
      id,
      usuarioId,
      revogadaEm: null,
      expiraEm: { gt: agora, lte: new Date(agora.getTime() + 29 * DIA_MS), lt: expiraEm },
    },
    data: { expiraEm },
  })
  return resultado.count > 0 || validarSessaoDispositivo(id, usuarioId)
}

export async function revogarSessaoDispositivo(id: string, usuarioId: string): Promise<void> {
  await db.sessaoDispositivo.updateMany({
    where: { id, usuarioId, revogadaEm: null },
    data: { revogadaEm: new Date() },
  })
}

/** O ID legado é o hash do token verificado. Inserção não substitui um tombstone. */
export async function registrarSessaoLegada(
  id: string,
  usuarioId: string,
  expiraEm: Date,
): Promise<boolean> {
  if (!id.startsWith("legado:") || expiraEm <= new Date()) return false
  await db.sessaoDispositivo.createMany({
    data: [{ id, usuarioId, expiraEm }],
    skipDuplicates: true,
  })
  return validarSessaoDispositivo(id, usuarioId)
}

/** Um logout anterior ao primeiro acesso deixa tombstone para impedir registro tardio. */
export async function revogarSessaoLegada(
  id: string,
  usuarioId: string,
  expiraEm: Date,
): Promise<void> {
  if (!id.startsWith("legado:")) throw new Error("Identificador de sessão legada inválido")
  const revogadaEm = new Date()
  await db.sessaoDispositivo.createMany({
    data: [{ id, usuarioId, expiraEm, revogadaEm }],
    skipDuplicates: true,
  })
  await db.sessaoDispositivo.updateMany({
    where: { id, usuarioId, revogadaEm: null },
    data: { revogadaEm },
  })
}

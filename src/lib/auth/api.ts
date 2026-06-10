import "server-only"
import { db } from "@/lib/db"
import { lerSessao } from "./session"

export async function obterUsuarioAtualApi() {
  const sessao = await lerSessao()
  if (!sessao?.sub) return null

  const usuario = await db.usuario.findUnique({
    where: { id: sessao.sub },
    select: { id: true, papel: true, ativo: true },
  })

  if (!usuario?.ativo) return null
  return usuario
}

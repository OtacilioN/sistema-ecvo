import "server-only"
import { db } from "@/lib/db"
import { autorizarSessaoDispositivo } from "./sessao-dispositivo"
import { lerSessao } from "./session"

export async function obterUsuarioAtualApi() {
  const sessao = await lerSessao()
  if (!sessao?.sub) return null

  const usuario = await db.usuario.findUnique({
    where: { id: sessao.sub },
    select: { id: true, papel: true, ativo: true, sessaoVersao: true },
  })

  if (
    !usuario?.ativo ||
    usuario.papel !== sessao.papel ||
    (usuario.sessaoVersao ?? 0) !== (sessao.versao ?? 0)
  )
    return null
  if (!(await autorizarSessaoDispositivo(sessao))) return null
  return usuario
}

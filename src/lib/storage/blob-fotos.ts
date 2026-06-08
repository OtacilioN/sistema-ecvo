import "server-only"

import { del } from "@vercel/blob"
import { fotoPathnameDeUrl } from "@/lib/fotos"

export async function excluirFotoInternaSeExistir(fotoUrl: string | null | undefined) {
  const pathname = fotoPathnameDeUrl(fotoUrl)
  if (!pathname) return

  try {
    await del(pathname)
  } catch (erro) {
    console.warn("Não foi possível excluir a foto antiga do Blob.", erro)
  }
}

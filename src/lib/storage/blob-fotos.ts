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

export async function excluirFotosInternasAntigas(
  fotosAntigas: Array<string | null | undefined>,
  fotoNova: string | null | undefined,
) {
  const pathNova = fotoPathnameDeUrl(fotoNova)
  const paths = new Set(
    fotosAntigas
      .map((foto) => fotoPathnameDeUrl(foto))
      .filter((pathname): pathname is string => Boolean(pathname) && pathname !== pathNova),
  )

  await Promise.all(
    [...paths].map((pathname) => excluirFotoInternaSeExistir(`/api/fotos/${pathname}`)),
  )
}

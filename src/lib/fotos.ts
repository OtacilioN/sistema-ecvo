export const FOTO_ENTIDADES = ["alunos", "professores", "usuarios"] as const
export type FotoEntidade = (typeof FOTO_ENTIDADES)[number]

export const FOTO_CONTENT_TYPES = ["image/jpeg", "image/png", "image/webp"] as const
export const FOTO_MAX_ORIGINAL_BYTES = 8 * 1024 * 1024
export const FOTO_MAX_UPLOAD_BYTES = 2 * 1024 * 1024
export const FOTO_DIMENSAO_MAX = 1024
export const FOTO_QUALIDADE_JPEG = 0.72

const FOTO_API_PREFIX = "/api/fotos/"

export function fotoUrlPorPathname(pathname: string) {
  return `${FOTO_API_PREFIX}${normalizarPathnameFoto(pathname)}`
}

export function fotoPathnameDeUrl(url: string | null | undefined) {
  if (!url?.startsWith(FOTO_API_PREFIX)) return null
  return normalizarPathnameFoto(url.slice(FOTO_API_PREFIX.length))
}

export function fotoUrlInterna(url: string | null | undefined) {
  return Boolean(fotoPathnameDeUrl(url))
}

export function entidadeFotoValida(valor: string): valor is FotoEntidade {
  return FOTO_ENTIDADES.includes(valor as FotoEntidade)
}

export function contentTypeFotoValido(valor: string) {
  return FOTO_CONTENT_TYPES.includes(valor as (typeof FOTO_CONTENT_TYPES)[number])
}

export function extensaoPorContentType(contentType: string) {
  if (contentType === "image/png") return "png"
  if (contentType === "image/webp") return "webp"
  return "jpg"
}

export function normalizarPathnameFoto(pathname: string) {
  return pathname
    .split("/")
    .filter(Boolean)
    .filter((segmento) => segmento !== "." && segmento !== "..")
    .map((segmento) => segmento.replace(/[^a-zA-Z0-9._-]/g, "-"))
    .join("/")
}

export function pathnameFotoValido(pathname: string) {
  const segmentos = normalizarPathnameFoto(pathname).split("/")
  if (segmentos.length < 3) return false
  if (!entidadeFotoValida(segmentos[0] ?? "")) return false
  return /\.(jpe?g|png|webp)$/i.test(segmentos.at(-1) ?? "")
}

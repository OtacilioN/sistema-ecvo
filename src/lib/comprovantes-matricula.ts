export const COMPROVANTE_MATRICULA_CONTENT_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
] as const

export const COMPROVANTE_MATRICULA_MAX_BYTES = 3 * 1024 * 1024

export function validarComprovanteMatricula(
  arquivo: File | null,
): { ok: true } | { ok: false; motivo: string } {
  if (!arquivo || arquivo.size === 0) return { ok: true }
  if (
    !COMPROVANTE_MATRICULA_CONTENT_TYPES.includes(
      arquivo.type as (typeof COMPROVANTE_MATRICULA_CONTENT_TYPES)[number],
    )
  ) {
    return { ok: false, motivo: "Envie o comprovante em JPG, PNG, WebP ou PDF." }
  }
  if (arquivo.size > COMPROVANTE_MATRICULA_MAX_BYTES) {
    return { ok: false, motivo: "O comprovante deve ter no máximo 3 MB." }
  }
  return { ok: true }
}

export function extensaoComprovante(contentType: string): string {
  if (contentType === "application/pdf") return "pdf"
  if (contentType === "image/png") return "png"
  if (contentType === "image/webp") return "webp"
  return "jpg"
}

export async function assinaturaArquivoComprovanteValida(arquivo: File): Promise<boolean> {
  const bytes = new Uint8Array(await arquivo.slice(0, 12).arrayBuffer())
  return assinaturaComprovanteValida(arquivo.type, bytes)
}

export function assinaturaComprovanteValida(contentType: string, bytes: Uint8Array): boolean {
  if (contentType === "application/pdf") {
    return corresponde(bytes, [0x25, 0x50, 0x44, 0x46, 0x2d])
  }
  if (contentType === "image/jpeg") {
    return corresponde(bytes, [0xff, 0xd8, 0xff])
  }
  if (contentType === "image/png") {
    return corresponde(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  }
  if (contentType === "image/webp") {
    return (
      corresponde(bytes, [0x52, 0x49, 0x46, 0x46]) &&
      corresponde(bytes.slice(8), [0x57, 0x45, 0x42, 0x50])
    )
  }
  return false
}

function corresponde(bytes: Uint8Array, assinatura: number[]) {
  return assinatura.every((valor, indice) => bytes[indice] === valor)
}

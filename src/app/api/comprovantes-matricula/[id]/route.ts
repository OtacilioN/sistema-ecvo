import { get } from "@vercel/blob"
import { sessaoOpcional } from "@/lib/auth/dal"
import { db } from "@/lib/db"

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const sessao = await sessaoOpcional()
  if (!sessao?.sub) return new Response("Não autorizado.", { status: 401 })

  const gestor = await db.usuario.findFirst({
    where: { id: sessao.sub, papel: "GESTOR", ativo: true },
    select: { id: true },
  })
  if (!gestor) return new Response("Acesso restrito à gestão.", { status: 403 })

  const { id } = await context.params
  const solicitacao = await db.solicitacaoMatricula.findUnique({
    where: { id },
    select: {
      comprovantePagamentoUrl: true,
      comprovanteNomeOriginal: true,
    },
  })
  if (!solicitacao?.comprovantePagamentoUrl) {
    return new Response("Comprovante não encontrado.", { status: 404 })
  }

  const ifNoneMatch = request.headers.get("if-none-match") ?? undefined
  const arquivo = await get(solicitacao.comprovantePagamentoUrl, {
    access: "private",
    ifNoneMatch,
  })
  if (!arquivo) return new Response("Comprovante não encontrado.", { status: 404 })
  if (arquivo.statusCode === 304) {
    return new Response(null, { status: 304, headers: { etag: arquivo.blob.etag } })
  }

  const nomeOriginal = (solicitacao.comprovanteNomeOriginal ?? "comprovante")
    .replace(/[\r\n"/\\]/g, "-")
    .slice(0, 120)
  const nomeCodificado = encodeURIComponent(nomeOriginal)
  return new Response(arquivo.stream, {
    headers: {
      "cache-control": "private, no-store",
      "content-disposition": `inline; filename="comprovante"; filename*=UTF-8''${nomeCodificado}`,
      "content-length": String(arquivo.blob.size),
      "content-type": arquivo.blob.contentType,
      "content-security-policy": "sandbox; default-src 'none'",
      etag: arquivo.blob.etag,
      "x-content-type-options": "nosniff",
    },
  })
}

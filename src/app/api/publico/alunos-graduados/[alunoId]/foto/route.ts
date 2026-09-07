import { get } from "@vercel/blob"
import { obterPathnameFotoAlunoGraduadoPublico } from "@/lib/services/alunos-graduados-publicos.service"

const CABECALHOS_FOTO_PUBLICA = {
  "access-control-allow-origin": "*",
  "cache-control": "public, max-age=300, s-maxage=300, stale-while-revalidate=600",
  "cross-origin-resource-policy": "cross-origin",
  "x-content-type-options": "nosniff",
}

export async function GET(request: Request, context: { params: Promise<{ alunoId: string }> }) {
  try {
    const { alunoId } = await context.params
    const pathname = await obterPathnameFotoAlunoGraduadoPublico(alunoId)
    if (!pathname) {
      return new Response("Foto não encontrada.", {
        status: 404,
        headers: CABECALHOS_FOTO_PUBLICA,
      })
    }

    const ifNoneMatch = request.headers.get("if-none-match") ?? undefined
    const arquivo = await get(pathname, { access: "private", ifNoneMatch })
    if (!arquivo) {
      return new Response("Foto não encontrada.", {
        status: 404,
        headers: CABECALHOS_FOTO_PUBLICA,
      })
    }

    if (arquivo.statusCode === 304) {
      return new Response(null, {
        status: 304,
        headers: { ...CABECALHOS_FOTO_PUBLICA, etag: arquivo.blob.etag },
      })
    }

    return new Response(arquivo.stream, {
      headers: {
        ...CABECALHOS_FOTO_PUBLICA,
        "content-length": String(arquivo.blob.size),
        "content-type": arquivo.blob.contentType,
        etag: arquivo.blob.etag,
      },
    })
  } catch (erro) {
    console.error("Não foi possível carregar uma foto da API pública de graduados.", erro)
    return new Response("Não foi possível carregar a foto.", {
      status: 500,
      headers: CABECALHOS_FOTO_PUBLICA,
    })
  }
}

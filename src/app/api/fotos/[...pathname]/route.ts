import { get } from "@vercel/blob"
import { sessaoOpcional } from "@/lib/auth/dal"
import { db } from "@/lib/db"
import { fotoUrlPorPathname, pathnameFotoValido } from "@/lib/fotos"

export async function GET(request: Request, context: { params: Promise<{ pathname: string[] }> }) {
  const { pathname: segmentos } = await context.params
  const pathname = segmentos.join("/")
  if (!pathnameFotoValido(pathname)) return new Response("Foto inválida.", { status: 400 })

  const autorizado = await podeAcessarFoto(fotoUrlPorPathname(pathname))
  if (!autorizado) return new Response("Não autorizado.", { status: 401 })

  const ifNoneMatch = request.headers.get("if-none-match") ?? undefined
  const arquivo = await get(pathname, { access: "private", ifNoneMatch })
  if (!arquivo) return new Response("Foto não encontrada.", { status: 404 })

  if (arquivo.statusCode === 304) {
    return new Response(null, {
      status: 304,
      headers: { etag: arquivo.blob.etag },
    })
  }

  return new Response(arquivo.stream, {
    headers: {
      "cache-control": "private, max-age=3600",
      "content-length": String(arquivo.blob.size),
      "content-type": arquivo.blob.contentType,
      etag: arquivo.blob.etag,
    },
  })
}

async function podeAcessarFoto(fotoUrl: string) {
  const sessao = await sessaoOpcional()
  if (!sessao?.sub) return false

  const usuario = await db.usuario.findUnique({
    where: { id: sessao.sub },
    select: {
      id: true,
      papel: true,
      ativo: true,
      fotoUrl: true,
      aluno: { select: { id: true } },
      professor: { select: { id: true } },
    },
  })

  if (!usuario?.ativo) return false
  if (usuario.papel === "GESTOR" || usuario.papel === "SECRETARIA") return true
  if (usuario.fotoUrl === fotoUrl) return true

  if (usuario.papel === "ALUNO" && usuario.aluno) {
    const fotoDoAluno = await db.aluno.count({ where: { id: usuario.aluno.id, fotoUrl } })
    return fotoDoAluno > 0
  }

  if (usuario.papel === "PROFESSOR" && usuario.professor) {
    const fotoDoProfessor = await db.professor.count({
      where: { id: usuario.professor.id, fotoUrl },
    })
    return fotoDoProfessor > 0
  }

  return false
}

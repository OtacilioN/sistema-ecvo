import { type HandleUploadBody, handleUpload } from "@vercel/blob/client"
import { sessaoOpcional } from "@/lib/auth/dal"
import { db } from "@/lib/db"
import { FOTO_CONTENT_TYPES, FOTO_MAX_UPLOAD_BYTES, pathnameFotoValido } from "@/lib/fotos"

export async function POST(request: Request) {
  const usuario = await obterUsuarioAutenticado()
  if (!usuario) return Response.json({ erro: "Não autorizado." }, { status: 401 })

  let body: HandleUploadBody
  try {
    body = (await request.json()) as HandleUploadBody
  } catch {
    return Response.json({ erro: "Requisição inválida." }, { status: 400 })
  }

  try {
    const resposta = await handleUpload({
      request,
      body,
      onBeforeGenerateToken: async (pathname) => {
        if (!pathnameFotoValido(pathname)) {
          throw new Error("Destino de foto inválido.")
        }
        const autorizado = await podeSubirFoto(usuario, pathname)
        if (!autorizado) {
          throw new Error("Você não tem permissão para enviar esta foto.")
        }

        return {
          allowedContentTypes: [...FOTO_CONTENT_TYPES],
          maximumSizeInBytes: FOTO_MAX_UPLOAD_BYTES,
          addRandomSuffix: false,
          allowOverwrite: false,
          tokenPayload: JSON.stringify({ autorId: usuario.id }),
        }
      },
      onUploadCompleted: async () => {},
    })

    return Response.json(resposta)
  } catch (erro) {
    const mensagem = erro instanceof Error ? erro.message : "Não foi possível enviar a foto."
    return Response.json({ erro: mensagem }, { status: 400 })
  }
}

async function obterUsuarioAutenticado() {
  const sessao = await sessaoOpcional()
  if (!sessao?.sub) return null

  const usuario = await db.usuario.findUnique({
    where: { id: sessao.sub },
    select: { id: true, papel: true, ativo: true },
  })

  if (!usuario?.ativo) return null
  return usuario
}

async function podeSubirFoto(usuario: { id: string; papel: string }, pathname: string) {
  const [entidade, registroId] = pathname.split("/")
  if (!entidade || !registroId) return false

  if (entidade === "usuarios") {
    if (registroId === usuario.id) return true
    if (usuario.papel !== "GESTOR") return false

    const existe = await db.usuario.count({ where: { id: registroId } })
    return existe > 0
  }

  return usuario.papel === "GESTOR" && (entidade === "alunos" || entidade === "professores")
}

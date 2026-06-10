import { obterUsuarioAtualApi } from "@/lib/auth/api"
import {
  chavePublicaPush,
  pushConfigurado,
  removerInscricaoPush,
  salvarInscricaoPush,
  usuarioTemInscricaoPush,
} from "@/lib/services/push.service"
import { inscricaoPushSchema, removerInscricaoPushSchema } from "@/lib/validations/push"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

function naoAutorizado() {
  return Response.json({ erro: "Não autorizado." }, { status: 401 })
}

async function corpoJson(request: Request) {
  try {
    return await request.json()
  } catch {
    return null
  }
}

export async function GET() {
  const usuario = await obterUsuarioAtualApi()
  if (!usuario) return naoAutorizado()

  return Response.json({
    configurado: pushConfigurado(),
    publicKey: chavePublicaPush(),
    ativo: await usuarioTemInscricaoPush(usuario.id),
  })
}

export async function POST(request: Request) {
  const usuario = await obterUsuarioAtualApi()
  if (!usuario) return naoAutorizado()

  const parsed = inscricaoPushSchema.safeParse(await corpoJson(request))
  if (!parsed.success) {
    return Response.json(
      { erro: parsed.error.issues[0]?.message ?? "Inscrição inválida." },
      { status: 400 },
    )
  }

  await salvarInscricaoPush({
    usuarioId: usuario.id,
    inscricao: parsed.data,
    userAgent: request.headers.get("user-agent"),
  })

  return Response.json({ ok: true })
}

export async function DELETE(request: Request) {
  const usuario = await obterUsuarioAtualApi()
  if (!usuario) return naoAutorizado()

  const parsed = removerInscricaoPushSchema.safeParse(await corpoJson(request))
  if (!parsed.success) {
    return Response.json(
      { erro: parsed.error.issues[0]?.message ?? "Inscrição inválida." },
      { status: 400 },
    )
  }

  await removerInscricaoPush({ usuarioId: usuario.id, endpoint: parsed.data.endpoint })

  return Response.json({ ok: true })
}

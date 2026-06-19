import { obterUsuarioAtualApi } from "@/lib/auth/api"
import { db } from "@/lib/db"
import { gerarLembretesTreino } from "@/lib/services/notificacao.service"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

const LOCK_LEMBRETES_TREINO = BigInt(202606191130)

type JanelaLembreteTreino = {
  origem: "cron" | "gestor"
  antecedenciaMinutos: number
  janelaMinutos: number
}

async function janelaAutorizada(request: Request): Promise<JanelaLembreteTreino | null> {
  const segredo = process.env.CRON_SECRET
  const authorization = request.headers.get("authorization")

  if (segredo && authorization === `Bearer ${segredo}`) {
    return {
      origem: "cron",
      antecedenciaMinutos: 0,
      janelaMinutos: 360,
    }
  }

  const usuario = await obterUsuarioAtualApi()
  if (usuario?.papel !== "GESTOR") return null

  return {
    origem: "gestor",
    antecedenciaMinutos: 60,
    janelaMinutos: 15,
  }
}

export async function GET(request: Request) {
  const janela = await janelaAutorizada(request)
  if (!janela) {
    return Response.json({ erro: "Não autorizado." }, { status: 401 })
  }

  const resultado = await db.$transaction(async (tx) => {
    const [lock] = await tx.$queryRaw<Array<{ locked: boolean }>>`
      SELECT pg_try_advisory_xact_lock(${LOCK_LEMBRETES_TREINO}) AS locked
    `

    if (!lock?.locked) {
      return {
        ok: true as const,
        origem: janela.origem,
        lockObtido: false,
        total: 0,
      }
    }

    const lembretes = await gerarLembretesTreino(tx, janela)
    return {
      ...lembretes,
      origem: janela.origem,
      lockObtido: true,
    }
  })

  return Response.json(resultado)
}

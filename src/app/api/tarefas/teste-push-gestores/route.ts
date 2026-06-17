import { db } from "@/lib/db"
import { enviarPushParaNotificacao } from "@/lib/services/push.service"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

function naoAutorizado() {
  return Response.json({ erro: "Não autorizado." }, { status: 401 })
}

export async function POST(request: Request) {
  const segredos = [process.env.CRON_SECRET, process.env.TEST_PUSH_SECRET].filter(Boolean)
  const authorization = request.headers.get("authorization")

  if (segredos.length === 0) {
    return Response.json({ erro: "Segredo de execução não configurado." }, { status: 500 })
  }

  if (!segredos.some((segredo) => authorization === `Bearer ${segredo}`)) return naoAutorizado()

  const quando = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Fortaleza",
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date())

  const titulo = "Teste de push"
  const mensagem = `Teste de push enviado em produção em ${quando}. Se chegou no celular, o canal Web Push está funcionando.`

  const gestores = await db.usuario.findMany({
    where: { papel: "GESTOR", ativo: true },
    select: {
      id: true,
      nome: true,
      email: true,
      _count: { select: { inscricoesPush: { where: { revogadaEm: null } } } },
    },
    orderBy: { nome: "asc" },
  })

  const resultados = []

  for (const gestor of gestores) {
    const notificacao = await db.notificacao.create({
      data: {
        usuarioId: gestor.id,
        tipo: "COMPARECIMENTO",
        titulo,
        mensagem,
      },
    })

    const push = await enviarPushParaNotificacao(notificacao)
    resultados.push({
      nome: gestor.nome,
      email: gestor.email,
      notificacaoId: notificacao.id,
      inscricoesAtivasAntes: gestor._count.inscricoesPush,
      push,
    })
  }

  return Response.json({
    ok: true,
    titulo,
    mensagem,
    gestoresAtivos: gestores.length,
    notificacoesInternasCriadas: resultados.length,
    totalInscricoesAtivasAntes: resultados.reduce(
      (total, resultado) => total + resultado.inscricoesAtivasAntes,
      0,
    ),
    totalTentativasPush: resultados.reduce(
      (total, resultado) => total + resultado.push.tentativas,
      0,
    ),
    totalPushesEnviadas: resultados.reduce(
      (total, resultado) => total + resultado.push.enviados,
      0,
    ),
    totalInscricoesRemovidas: resultados.reduce(
      (total, resultado) => total + resultado.push.removidos,
      0,
    ),
    resultados,
  })
}

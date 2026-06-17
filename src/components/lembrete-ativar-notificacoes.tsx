import { LembreteAtivarNotificacoesCliente } from "@/components/lembrete-ativar-notificacoes-cliente"
import { getUsuarioAtual } from "@/lib/auth/dal"
import { db } from "@/lib/db"

export async function LembreteAtivarNotificacoes() {
  const usuario = await getUsuarioAtual()

  const [quantidadeNaoLidas, inscricoesPushAtivas] = await Promise.all([
    db.notificacao.count({
      where: {
        usuarioId: usuario.id,
        lida: false,
      },
    }),
    db.inscricaoPush.count({
      where: {
        usuarioId: usuario.id,
        revogadaEm: null,
      },
    }),
  ])

  if (quantidadeNaoLidas === 0 || inscricoesPushAtivas > 0) return null

  return <LembreteAtivarNotificacoesCliente quantidadeNaoLidas={quantidadeNaoLidas} />
}

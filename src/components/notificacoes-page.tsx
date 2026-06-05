import {
  acaoGerarLembretesTreino,
  acaoMarcarNotificacaoLida,
  acaoMarcarTodasNotificacoesLidas,
} from "@/app/actions/notificacoes"
import { Badge } from "@/components/ui/badge"
import { BotaoEnviar } from "@/components/ui/botao-enviar"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { getUsuarioAtual } from "@/lib/auth/dal"
import { db } from "@/lib/db"
import { formatarDataHora } from "@/lib/utils/datas"

export async function PaginaNotificacoes() {
  const usuario = await getUsuarioAtual()
  const notificacoes = await db.notificacao.findMany({
    where: { usuarioId: usuario.id },
    orderBy: { criadoEm: "desc" },
    take: 50,
  })
  const naoLidas = notificacoes.filter((n) => !n.lida).length

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Notificações</h1>
          <p className="text-muted-foreground">
            Alertas de treino, financeiro, graduação e check-ins.
          </p>
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          {usuario.papel === "GESTOR" && (
            <form action={acaoGerarLembretesTreino}>
              <BotaoEnviar variant="secondary" size="sm">
                Gerar lembretes
              </BotaoEnviar>
            </form>
          )}
          <form action={acaoMarcarTodasNotificacoesLidas}>
            <BotaoEnviar variant="outline" size="sm">
              Marcar todas como lidas
            </BotaoEnviar>
          </form>
        </div>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-3">
            <CardTitle>Caixa de entrada</CardTitle>
            <Badge variant={naoLidas > 0 ? "warning" : "secondary"}>{naoLidas} não lida(s)</Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {notificacoes.map((notificacao) => (
            <div
              key={notificacao.id}
              className="flex items-start justify-between gap-4 border-b border-border pb-3 last:border-0 last:pb-0"
            >
              <div>
                <div className="flex items-center gap-2">
                  <p className="font-medium">{notificacao.titulo}</p>
                  <Badge variant={notificacao.lida ? "secondary" : "success"}>
                    {notificacao.lida ? "Lida" : "Nova"}
                  </Badge>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">{notificacao.mensagem}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {notificacao.tipo} · {formatarDataHora(notificacao.criadoEm)}
                </p>
              </div>
              {!notificacao.lida && (
                <form action={acaoMarcarNotificacaoLida}>
                  <input type="hidden" name="id" value={notificacao.id} />
                  <BotaoEnviar variant="ghost" size="sm">
                    Marcar lida
                  </BotaoEnviar>
                </form>
              )}
            </div>
          ))}
          {notificacoes.length === 0 && (
            <p className="text-sm text-muted-foreground">Nenhuma notificação registrada.</p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

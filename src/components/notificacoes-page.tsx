import type { Prisma } from "@prisma/client"
import Link from "next/link"
import {
  acaoMarcarNotificacaoLida,
  acaoMarcarTodasNotificacoesLidas,
} from "@/app/actions/notificacoes"
import { PushNotificacoesControle } from "@/components/push-notificacoes-controle"
import { Badge } from "@/components/ui/badge"
import { BotaoEnviar } from "@/components/ui/botao-enviar"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { getUsuarioAtual } from "@/lib/auth/dal"
import { db } from "@/lib/db"
import { formatarDataHora } from "@/lib/utils/datas"

export type FiltroNotificacoes = "todas" | "nao-lidas" | "lidas"

const FILTROS: Array<{ valor: FiltroNotificacoes; rotulo: string }> = [
  { valor: "todas", rotulo: "Todas" },
  { valor: "nao-lidas", rotulo: "Não lidas" },
  { valor: "lidas", rotulo: "Lidas" },
]

export function normalizarFiltroNotificacoes(valor: string | string[] | undefined) {
  const filtro = Array.isArray(valor) ? valor[0] : valor
  if (filtro === "nao-lidas" || filtro === "lidas") return filtro
  return "todas"
}

function caminhoNotificacoes(papel: string) {
  if (papel === "ALUNO") return "/aluno/notificacoes"
  if (papel === "PROFESSOR") return "/professor/notificacoes"
  return "/gestao/notificacoes"
}

function hrefFiltro(base: string, filtro: FiltroNotificacoes) {
  return filtro === "todas" ? base : `${base}?filtro=${filtro}`
}

function quantidadeFiltro(
  filtro: FiltroNotificacoes,
  contagens: { total: number; naoLidas: number; lidas: number },
) {
  if (filtro === "nao-lidas") return contagens.naoLidas
  if (filtro === "lidas") return contagens.lidas
  return contagens.total
}

export async function PaginaNotificacoes({ filtro = "todas" }: { filtro?: FiltroNotificacoes }) {
  const usuario = await getUsuarioAtual()
  const filtroWhere: Prisma.NotificacaoWhereInput =
    filtro === "nao-lidas" ? { lida: false } : filtro === "lidas" ? { lida: true } : {}
  const where: Prisma.NotificacaoWhereInput = { usuarioId: usuario.id, ...filtroWhere }
  const baseNotificacoes = caminhoNotificacoes(usuario.papel)
  const [notificacoes, total, naoLidas] = await Promise.all([
    db.notificacao.findMany({
      where,
      orderBy: { criadoEm: "desc" },
      take: 50,
    }),
    db.notificacao.count({ where: { usuarioId: usuario.id } }),
    db.notificacao.count({ where: { usuarioId: usuario.id, lida: false } }),
  ])
  const contagens = { total, naoLidas, lidas: total - naoLidas }

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
          <PushNotificacoesControle />
          <form action={acaoMarcarTodasNotificacoesLidas}>
            <BotaoEnviar variant="outline" size="sm">
              Marcar todas como lidas
            </BotaoEnviar>
          </form>
        </div>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <CardTitle>Caixa de entrada</CardTitle>
            <Badge variant={naoLidas > 0 ? "warning" : "secondary"}>{naoLidas} não lida(s)</Badge>
          </div>
          <div className="flex flex-wrap gap-2 pt-3">
            {FILTROS.map((opcao) => (
              <Button
                key={opcao.valor}
                asChild
                variant={filtro === opcao.valor ? "secondary" : "ghost"}
                size="sm"
              >
                <Link
                  href={hrefFiltro(baseNotificacoes, opcao.valor)}
                  aria-current={filtro === opcao.valor ? "page" : undefined}
                >
                  {opcao.rotulo}
                  <Badge variant="outline">{quantidadeFiltro(opcao.valor, contagens)}</Badge>
                </Link>
              </Button>
            ))}
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

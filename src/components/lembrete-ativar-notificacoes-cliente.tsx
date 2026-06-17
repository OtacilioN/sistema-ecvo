"use client"

import { BellRing } from "lucide-react"
import { useCallback, useState } from "react"
import { PushNotificacoesControle } from "@/components/push-notificacoes-controle"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"

type EstadoPush = "checando" | "indisponivel" | "desativado" | "ativo" | "bloqueado"

type LembreteAtivarNotificacoesClienteProps = {
  quantidadeNaoLidas: number
}

export function LembreteAtivarNotificacoesCliente({
  quantidadeNaoLidas,
}: LembreteAtivarNotificacoesClienteProps) {
  const [visivel, setVisivel] = useState(true)

  const aoMudarEstado = useCallback((estado: EstadoPush) => {
    if (estado === "ativo" || estado === "indisponivel") setVisivel(false)
  }, [])

  if (!visivel) return null

  return (
    <Card className="border-warning/70 bg-warning/10 shadow-none">
      <CardContent className="flex flex-col gap-4 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <div className="mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-md bg-warning text-white">
            <BellRing className="size-5" />
          </div>
          <div className="min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-medium leading-tight">Ative as notificações no aplicativo</p>
              <Badge variant="warning">{quantidadeNaoLidas} nova(s)</Badge>
            </div>
            <p className="text-sm text-muted-foreground">
              Você tem alerta pendente. Ative o push para receber avisos mesmo fora desta tela.
            </p>
          </div>
        </div>
        <PushNotificacoesControle
          className="w-full shrink-0 sm:w-auto"
          mostrarTextoSempre
          aoMudarEstado={aoMudarEstado}
        />
      </CardContent>
    </Card>
  )
}

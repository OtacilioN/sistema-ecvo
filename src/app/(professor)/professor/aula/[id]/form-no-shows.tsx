"use client"

import { UserX } from "lucide-react"
import { useActionState } from "react"
import { acaoMarcarNoShows, type EstadoTreino } from "@/app/actions/treino"
import { BotaoEnviar } from "@/components/ui/botao-enviar"

export function FormNoShows({ aulaId }: { aulaId: string }) {
  const [estado, acao] = useActionState<EstadoTreino, FormData>(acaoMarcarNoShows, undefined)

  return (
    <form action={acao} className="flex flex-wrap items-center gap-3">
      <input type="hidden" name="aulaId" value={aulaId} />
      <BotaoEnviar variant="outline">
        <UserX className="size-4" /> Processar no-shows
      </BotaoEnviar>
      {estado?.erro && <p className="text-sm text-destructive">{estado.erro}</p>}
      {estado?.ok && <p className="text-sm text-success">No-shows atualizados.</p>}
    </form>
  )
}

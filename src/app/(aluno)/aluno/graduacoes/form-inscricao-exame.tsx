"use client"

import { ClipboardList } from "lucide-react"
import { useActionState } from "react"
import { acaoInscreverExame, type EstadoGraduacao } from "@/app/actions/graduacoes"
import { BotaoEnviar } from "@/components/ui/botao-enviar"

export function FormInscricaoExame({ exameId }: { exameId: string }) {
  const [estado, acao] = useActionState<EstadoGraduacao, FormData>(acaoInscreverExame, undefined)

  return (
    <form action={acao} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="exameId" value={exameId} />
      <BotaoEnviar size="sm" variant="outline">
        <ClipboardList className="size-4" /> Inscrever
      </BotaoEnviar>
      {estado?.erro && <p className="text-xs text-destructive">{estado.erro}</p>}
      {estado?.ok && <p className="text-xs text-success">Inscrição confirmada.</p>}
    </form>
  )
}

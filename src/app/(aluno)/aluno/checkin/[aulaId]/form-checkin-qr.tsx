"use client"

import { Check, QrCode } from "lucide-react"
import { useActionState } from "react"
import { acaoCheckinAlunoQr, type EstadoTreino } from "@/app/actions/treino"
import { BotaoEnviar } from "@/components/ui/botao-enviar"

export function FormCheckinQr({
  aulaId,
  jaPresente,
  pendenteRevisao,
}: {
  aulaId: string
  jaPresente: boolean
  pendenteRevisao: boolean
}) {
  const [estado, acao] = useActionState<EstadoTreino, FormData>(acaoCheckinAlunoQr, undefined)

  if (jaPresente || (estado?.ok && !estado.pendenteRevisao)) {
    return (
      <div className="rounded-md border border-success/30 bg-success/10 p-4 text-sm text-success">
        <Check className="mr-2 inline size-4" />
        Check-in confirmado.
      </div>
    )
  }

  if (pendenteRevisao || estado?.pendenteRevisao) {
    return (
      <div className="rounded-md border border-warning/30 bg-warning/10 p-4 text-sm text-warning">
        Check-in pendente de revisão.
      </div>
    )
  }

  return (
    <form action={acao} className="space-y-3">
      <input type="hidden" name="aulaId" value={aulaId} />
      <BotaoEnviar className="w-full">
        <QrCode className="size-4" />
        Confirmar check-in
      </BotaoEnviar>
      {estado?.erro && <p className="text-sm text-destructive">{estado.erro}</p>}
    </form>
  )
}

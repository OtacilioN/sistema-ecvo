"use client"

import { Check, QrCode, X } from "lucide-react"
import { useActionState } from "react"
import {
  acaoCancelarComparecimento,
  acaoMarcarComparecimento,
  type EstadoTreino,
} from "@/app/actions/treino"
import { Badge } from "@/components/ui/badge"
import { BotaoEnviar } from "@/components/ui/botao-enviar"

type Props = {
  aulaId: string
  temComparecimento: boolean
  emListaEspera: boolean
  presente: boolean
  pendenteRevisao: boolean
  janelaAberta: boolean
}

export function AcoesAula({
  aulaId,
  temComparecimento,
  emListaEspera,
  presente,
  pendenteRevisao,
  janelaAberta,
}: Props) {
  const [marcar, acaoMarcar] = useActionState<EstadoTreino, FormData>(
    acaoMarcarComparecimento,
    undefined,
  )
  const [cancelar, acaoCancelar] = useActionState<EstadoTreino, FormData>(
    acaoCancelarComparecimento,
    undefined,
  )
  const erro = marcar?.erro ?? cancelar?.erro

  if (presente) {
    return (
      <Badge variant="success" className="gap-1">
        <Check className="size-3.5" /> Presente
      </Badge>
    )
  }

  if (pendenteRevisao) {
    return <Badge variant="warning">Pendente de revisão</Badge>
  }

  return (
    <div className="flex flex-col items-end gap-1.5">
      <div className="flex flex-wrap justify-end gap-2">
        {temComparecimento ? (
          <>
            <Badge variant="secondary" className="gap-1.5 py-1.5">
              <QrCode className="size-3.5" /> QR na entrada
            </Badge>
            <form action={acaoCancelar}>
              <input type="hidden" name="aulaId" value={aulaId} />
              <BotaoEnviar size="sm" variant="outline">
                <X className="size-4" /> Cancelar
              </BotaoEnviar>
            </form>
          </>
        ) : emListaEspera ? (
          <>
            <Badge variant="warning">Lista de espera</Badge>
            <form action={acaoCancelar}>
              <input type="hidden" name="aulaId" value={aulaId} />
              <BotaoEnviar size="sm" variant="outline">
                <X className="size-4" /> Cancelar
              </BotaoEnviar>
            </form>
          </>
        ) : (
          <>
            <form action={acaoMarcar}>
              <input type="hidden" name="aulaId" value={aulaId} />
              <BotaoEnviar size="sm" variant={janelaAberta ? "default" : "outline"}>
                Agendar aula
              </BotaoEnviar>
            </form>
            <Badge variant="secondary" className="gap-1.5 py-1.5">
              <QrCode className="size-3.5" /> QR na entrada
            </Badge>
          </>
        )}
      </div>
      {erro && <p className="text-right text-xs text-destructive">{erro}</p>}
    </div>
  )
}

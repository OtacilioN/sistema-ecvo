"use client"

import { CalendarCheck, Check, X } from "lucide-react"
import { useActionState } from "react"
import {
  acaoCancelarComparecimento,
  acaoCheckinAluno,
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
  const [checkin, acaoCheckin] = useActionState<EstadoTreino, FormData>(acaoCheckinAluno, undefined)
  const erro = marcar?.erro ?? cancelar?.erro ?? checkin?.erro

  if (presente) {
    return (
      <Badge variant="success" className="gap-1">
        <Check className="size-3.5" /> Presente
      </Badge>
    )
  }

  if (pendenteRevisao || checkin?.pendenteRevisao) {
    return <Badge variant="warning">Pendente de revisão</Badge>
  }

  return (
    <div className="flex flex-col items-end gap-1.5">
      <div className="flex flex-wrap justify-end gap-2">
        {temComparecimento ? (
          <>
            <form action={acaoCheckin}>
              <input type="hidden" name="aulaId" value={aulaId} />
              <BotaoEnviar size="sm">
                <CalendarCheck className="size-4" /> Check-in
              </BotaoEnviar>
            </form>
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
                Marcar comparecimento
              </BotaoEnviar>
            </form>
            <form action={acaoCheckin}>
              <input type="hidden" name="aulaId" value={aulaId} />
              <BotaoEnviar size="sm" variant="secondary">
                <CalendarCheck className="size-4" /> Check-in
              </BotaoEnviar>
            </form>
          </>
        )}
      </div>
      {erro && <p className="text-right text-xs text-destructive">{erro}</p>}
    </div>
  )
}

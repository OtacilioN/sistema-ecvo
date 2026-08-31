"use client"

import { Check, QrCode, ShieldAlert } from "lucide-react"
import { useActionState, useState } from "react"
import { acaoCheckinAlunoQr, type EstadoTreino } from "@/app/actions/treino"
import { Badge } from "@/components/ui/badge"
import { BotaoEnviar } from "@/components/ui/botao-enviar"
import type { PlataformaCheckin } from "@/lib/checkin-plataforma"
import { ConfirmacaoCheckinPlataforma } from "./confirmacao-checkin-plataforma"

export function FormCheckinGlobal({
  aulaId,
  token,
  plataforma,
}: {
  aulaId: string
  token: string
  plataforma: PlataformaCheckin | null
}) {
  const [estado, acao] = useActionState<EstadoTreino, FormData>(acaoCheckinAlunoQr, undefined)
  const [confirmada, setConfirmada] = useState(false)

  return (
    <form action={acao} className="space-y-3">
      <input type="hidden" name="aulaId" value={aulaId} />
      <input type="hidden" name="token" value={token} />
      {plataforma && (
        <ConfirmacaoCheckinPlataforma
          plataforma={plataforma}
          confirmada={confirmada}
          onChange={setConfirmada}
        />
      )}
      <BotaoEnviar className="w-full" disabled={Boolean(plataforma && !confirmada)}>
        <QrCode className="size-4" />
        Confirmar check-in
      </BotaoEnviar>
      {estado?.erro && (
        <div
          className={
            estado.inadimplente
              ? "rounded-md border border-warning/30 bg-warning/10 p-3 text-sm text-warning"
              : "rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
          }
        >
          {estado.inadimplente && <ShieldAlert className="mr-2 inline size-4" />}
          {estado.erro}
        </div>
      )}
      {estado?.ok && (
        <Badge variant="success" className="gap-1">
          <Check className="size-3.5" /> Confirmado
        </Badge>
      )}
    </form>
  )
}

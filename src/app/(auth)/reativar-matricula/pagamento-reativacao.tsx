"use client"

import { Check, Copy, RefreshCw } from "lucide-react"
import Image from "next/image"
import { useRouter } from "next/navigation"
import { useActionState, useEffect, useState } from "react"
import {
  acaoPrepararReativacao,
  acaoVerificarReativacao,
  type EstadoReativacao,
} from "@/app/actions/reativacao"
import { BotaoEnviar } from "@/components/ui/botao-enviar"
import { Button } from "@/components/ui/button"

export function PagamentoReativacao({
  mensalidadeId,
  pixCopiaECola,
  qrCodeDataUrl,
}: {
  mensalidadeId?: string
  pixCopiaECola: string | null
  qrCodeDataUrl: string | null
}) {
  const router = useRouter()
  const [estadoGerar, gerar] = useActionState<EstadoReativacao, FormData>(
    acaoPrepararReativacao,
    undefined,
  )
  const [estadoVerificar, verificar] = useActionState<EstadoReativacao, FormData>(
    acaoVerificarReativacao,
    undefined,
  )
  const [copiado, setCopiado] = useState(false)
  useEffect(() => {
    if (!pixCopiaECola) return
    const intervalo = window.setInterval(() => router.refresh(), 5_000)
    return () => window.clearInterval(intervalo)
  }, [pixCopiaECola, router])

  async function copiar() {
    await navigator.clipboard.writeText(pixCopiaECola ?? "")
    setCopiado(true)
    window.setTimeout(() => setCopiado(false), 2_000)
  }

  return (
    <div className="space-y-4">
      {(estadoGerar?.erro || estadoVerificar?.erro) && (
        <p role="alert" className="text-sm text-destructive">
          {estadoGerar?.erro ?? estadoVerificar?.erro}
        </p>
      )}
      {(estadoGerar?.mensagem || estadoVerificar?.mensagem) && (
        <p role="status" className="text-sm text-muted-foreground">
          {estadoGerar?.mensagem ?? estadoVerificar?.mensagem}
        </p>
      )}
      {pixCopiaECola && qrCodeDataUrl ? (
        <>
          <Image
            src={qrCodeDataUrl}
            alt="QR Code PIX para reativar a matrícula"
            width={220}
            height={220}
            unoptimized
            className="mx-auto rounded-lg border bg-white p-2"
          />
          <p className="break-all rounded-md bg-muted p-3 font-mono text-xs">{pixCopiaECola}</p>
          <Button type="button" variant="outline" onClick={copiar} className="w-full">
            {copiado ? <Check className="size-4" /> : <Copy className="size-4" />}
            {copiado ? "Copiado" : "Copiar código PIX"}
          </Button>
        </>
      ) : (
        <form action={gerar}>
          <BotaoEnviar className="w-full">Tentar gerar PIX novamente</BotaoEnviar>
        </form>
      )}
      {mensalidadeId && (
        <form action={verificar}>
          <input type="hidden" name="mensalidadeId" value={mensalidadeId} />
          <BotaoEnviar variant="outline" className="w-full">
            <RefreshCw className="size-4" /> Já paguei, verificar
          </BotaoEnviar>
        </form>
      )}
    </div>
  )
}

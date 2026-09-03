"use client"

import { Check, Copy, QrCode, RefreshCw } from "lucide-react"
import Image from "next/image"
import { useRouter } from "next/navigation"
import { useActionState, useEffect, useState } from "react"
import {
  acaoFecharMensalidadeAulaAvulsa,
  acaoVerificarComplementoAulaAvulsa,
  type EstadoFinanceiro,
} from "@/app/actions/financeiro"
import { BotaoEnviar } from "@/components/ui/botao-enviar"
import { Button } from "@/components/ui/button"

export function FecharMensalidadeAulaAvulsa({
  disponivel,
  pixCopiaECola,
  qrCodeDataUrl,
  cobrancaPendente,
}: {
  disponivel: boolean
  pixCopiaECola?: string | null
  qrCodeDataUrl?: string | null
  cobrancaPendente: boolean
}) {
  const router = useRouter()
  const [estadoGerar, acaoGerar] = useActionState<EstadoFinanceiro, FormData>(
    acaoFecharMensalidadeAulaAvulsa,
    undefined,
  )
  const [estadoVerificar, acaoVerificar] = useActionState<EstadoFinanceiro, FormData>(
    acaoVerificarComplementoAulaAvulsa,
    undefined,
  )
  const [copiado, setCopiado] = useState(false)

  useEffect(() => {
    if (!cobrancaPendente) return
    const intervalo = window.setInterval(() => router.refresh(), 5_000)
    return () => window.clearInterval(intervalo)
  }, [cobrancaPendente, router])

  async function copiar() {
    if (!pixCopiaECola) return
    await navigator.clipboard.writeText(pixCopiaECola)
    setCopiado(true)
    window.setTimeout(() => setCopiado(false), 2_000)
  }

  const erro = estadoGerar?.erro ?? estadoVerificar?.erro
  if (!pixCopiaECola || !qrCodeDataUrl) {
    return (
      <div className="space-y-3">
        {erro && <p className="text-sm text-destructive">{erro}</p>}
        {disponivel && (
          <form action={acaoGerar}>
            <BotaoEnviar>
              <QrCode className="size-4" /> Gerar PIX de R$ 80,00
            </BotaoEnviar>
          </form>
        )}
      </div>
    )
  }

  return (
    <div className="grid gap-4 sm:grid-cols-[180px_1fr] sm:items-center">
      <div className="mx-auto rounded-xl border border-border bg-white p-2">
        <Image
          src={qrCodeDataUrl}
          alt="QR Code PIX do complemento da mensalidade"
          width={164}
          height={164}
          unoptimized
        />
      </div>
      <div className="min-w-0 space-y-3">
        <div>
          <p className="text-sm font-medium">PIX Copia e Cola</p>
          <p className="mt-1 break-all rounded-md bg-muted p-3 font-mono text-xs">
            {pixCopiaECola}
          </p>
        </div>
        {erro && <p className="text-sm text-destructive">{erro}</p>}
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" onClick={copiar}>
            {copiado ? <Check className="size-4" /> : <Copy className="size-4" />}
            {copiado ? "Copiado" : "Copiar código PIX"}
          </Button>
          <form action={acaoVerificar}>
            <BotaoEnviar variant="outline">
              <RefreshCw className="size-4" /> Já paguei, verificar
            </BotaoEnviar>
          </form>
        </div>
      </div>
    </div>
  )
}

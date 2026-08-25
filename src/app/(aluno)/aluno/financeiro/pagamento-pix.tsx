"use client"

import { Check, Copy, QrCode } from "lucide-react"
import Image from "next/image"
import { useActionState, useState } from "react"
import { acaoGerarCobrancaPixAluno, type EstadoFinanceiro } from "@/app/actions/financeiro"
import { BotaoEnviar } from "@/components/ui/botao-enviar"
import { Button } from "@/components/ui/button"

export function PagamentoPix({
  mensalidadeId,
  pixCopiaECola,
  qrCodeDataUrl,
  rotuloAcao = "Gerar QR Code PIX",
}: {
  mensalidadeId?: string
  pixCopiaECola?: string | null
  qrCodeDataUrl?: string | null
  rotuloAcao?: string
}) {
  const [estado, acao] = useActionState<EstadoFinanceiro, FormData>(
    acaoGerarCobrancaPixAluno,
    undefined,
  )
  const [copiado, setCopiado] = useState(false)

  async function copiar() {
    if (!pixCopiaECola) return
    await navigator.clipboard.writeText(pixCopiaECola)
    setCopiado(true)
    window.setTimeout(() => setCopiado(false), 2_000)
  }

  if (!pixCopiaECola || !qrCodeDataUrl) {
    if (!mensalidadeId) return null
    return (
      <form action={acao} className="space-y-3">
        <input type="hidden" name="mensalidadeId" value={mensalidadeId} />
        {estado?.erro && <p className="text-sm text-destructive">{estado.erro}</p>}
        <BotaoEnviar>
          <QrCode className="size-4" /> {rotuloAcao}
        </BotaoEnviar>
      </form>
    )
  }

  return (
    <div className="grid gap-4 sm:grid-cols-[180px_1fr] sm:items-center">
      <div className="mx-auto rounded-xl border border-border bg-white p-2">
        <Image
          src={qrCodeDataUrl}
          alt="QR Code PIX para pagamento"
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
        <Button type="button" variant="outline" onClick={copiar}>
          {copiado ? <Check className="size-4" /> : <Copy className="size-4" />}
          {copiado ? "Copiado" : "Copiar código PIX"}
        </Button>
      </div>
    </div>
  )
}

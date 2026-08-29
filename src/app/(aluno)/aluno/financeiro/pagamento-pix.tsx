"use client"

import { Check, Copy, QrCode, Repeat2, XCircle } from "lucide-react"
import Image from "next/image"
import { useActionState, useState } from "react"
import {
  acaoAtivarPixAutomaticoAluno,
  acaoCancelarPixAutomaticoAluno,
  acaoGerarCobrancaPixAluno,
  type EstadoFinanceiro,
} from "@/app/actions/financeiro"
import { BotaoEnviar } from "@/components/ui/botao-enviar"
import { Button } from "@/components/ui/button"
import { DialogoConfirmacao } from "@/components/ui/dialogo-confirmacao"

export function PagamentoPix({
  mensalidadeId,
  pixCopiaECola,
  qrCodeDataUrl,
  permitirPixRecorrente = false,
  rotuloAcao = "Gerar QR Code PIX",
}: {
  mensalidadeId?: string
  pixCopiaECola?: string | null
  qrCodeDataUrl?: string | null
  permitirPixRecorrente?: boolean
  rotuloAcao?: string
}) {
  const [estadoMensal, acaoMensal, mensalPendente] = useActionState<EstadoFinanceiro, FormData>(
    acaoGerarCobrancaPixAluno,
    undefined,
  )
  const [estadoRecorrente, acaoRecorrente, recorrentePendente] = useActionState<
    EstadoFinanceiro,
    FormData
  >(acaoAtivarPixAutomaticoAluno, undefined)
  const [copiado, setCopiado] = useState(false)

  async function copiar() {
    if (!pixCopiaECola) return
    await navigator.clipboard.writeText(pixCopiaECola)
    setCopiado(true)
    window.setTimeout(() => setCopiado(false), 2_000)
  }

  if (!pixCopiaECola || !qrCodeDataUrl) {
    if (!mensalidadeId && !permitirPixRecorrente) return null
    return (
      <div className="space-y-3">
        {(estadoMensal?.erro || estadoRecorrente?.erro) && (
          <p className="text-sm text-destructive">{estadoMensal?.erro ?? estadoRecorrente?.erro}</p>
        )}
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
          {mensalidadeId && (
            <form action={acaoMensal}>
              <input type="hidden" name="mensalidadeId" value={mensalidadeId} />
              <BotaoEnviar className="w-full sm:w-auto" disabled={recorrentePendente}>
                <QrCode className="size-4" /> {rotuloAcao}
              </BotaoEnviar>
            </form>
          )}
          {permitirPixRecorrente && (
            <form action={acaoRecorrente}>
              <BotaoEnviar className="w-full sm:w-auto" variant="outline" disabled={mensalPendente}>
                <Repeat2 className="size-4" /> Cadastrar pix recorrente
              </BotaoEnviar>
            </form>
          )}
        </div>
      </div>
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

export function CancelarPixAutomatico() {
  const [aberto, setAberto] = useState(false)

  return (
    <>
      <Button type="button" variant="outline" onClick={() => setAberto(true)}>
        <XCircle className="size-4" /> Cancelar PIX recorrente
      </Button>
      <DialogoConfirmacao
        aberto={aberto}
        aoFechar={() => setAberto(false)}
        titulo="Cancelar PIX recorrente"
        descricao={
          <p>
            As mensalidades já pagas serão preservadas. As próximas cobranças automáticas serão
            encerradas e seu pagamento voltará ao PIX mensal.
          </p>
        }
        acao={acaoCancelarPixAutomaticoAluno}
        campos={{}}
        rotuloConfirmar="Cancelar recorrência"
      />
    </>
  )
}

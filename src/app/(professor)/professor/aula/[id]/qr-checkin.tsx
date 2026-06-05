import { QrCode } from "lucide-react"
import { headers } from "next/headers"
import Image from "next/image"
import QRCode from "qrcode"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

function primeiroHeader(valor: string | null) {
  return valor?.split(",")[0]?.trim()
}

async function origemDaRequisicao() {
  const lista = await headers()
  const host =
    primeiroHeader(lista.get("x-forwarded-host")) ?? lista.get("host") ?? "localhost:3000"
  const protocolo =
    primeiroHeader(lista.get("x-forwarded-proto")) ??
    (host.startsWith("localhost") ? "http" : "https")

  return `${protocolo}://${host}`
}

export async function QrCheckin({ aulaId }: { aulaId: string }) {
  const url = `${await origemDaRequisicao()}/aluno/checkin/${aulaId}`
  const qrDataUrl = await QRCode.toDataURL(url, {
    errorCorrectionLevel: "M",
    margin: 2,
    width: 224,
  })

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <QrCode className="size-4" />
          Check-in por QR Code
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <div className="w-fit rounded-md border border-border bg-white p-3">
          <Image
            src={qrDataUrl}
            alt="QR Code para check-in da aula"
            width={224}
            height={224}
            unoptimized
          />
        </div>
        <div className="min-w-0 space-y-2">
          <p className="text-sm text-muted-foreground">
            Exiba este código para os alunos autenticados confirmarem o check-in da aula pelo
            celular.
          </p>
          <p className="break-all rounded-md bg-muted p-2 font-mono text-xs text-muted-foreground">
            {url}
          </p>
        </div>
      </CardContent>
    </Card>
  )
}

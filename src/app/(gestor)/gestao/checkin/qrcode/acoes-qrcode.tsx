"use client"

import { Download, Printer } from "lucide-react"
import { Button } from "@/components/ui/button"

export function AcoesQRCode({ qrDataUrl }: { qrDataUrl: string }) {
  return (
    <div className="flex flex-wrap gap-2 print:hidden">
      <Button type="button" variant="outline" onClick={() => window.print()}>
        <Printer /> Imprimir folha
      </Button>
      <Button asChild variant="secondary">
        <a href={qrDataUrl} download="ecvo-checkin-qrcode.png">
          <Download /> Baixar QR
        </a>
      </Button>
    </div>
  )
}

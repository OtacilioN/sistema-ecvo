"use client"

import { Check, Copy } from "lucide-react"
import { useRouter } from "next/navigation"
import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"

export function AtualizadorPagamento({ ativo }: { ativo: boolean }) {
  const router = useRouter()
  useEffect(() => {
    if (!ativo) return
    const intervalo = window.setInterval(() => router.refresh(), 5_000)
    return () => window.clearInterval(intervalo)
  }, [ativo, router])
  return null
}

export function CopiarPix({ payload }: { payload: string }) {
  const [copiado, setCopiado] = useState(false)
  async function copiar() {
    await navigator.clipboard.writeText(payload)
    setCopiado(true)
    window.setTimeout(() => setCopiado(false), 2_000)
  }
  return (
    <Button type="button" variant="outline" onClick={copiar}>
      {copiado ? <Check className="size-4" /> : <Copy className="size-4" />}
      {copiado ? "Copiado" : "Copiar código PIX"}
    </Button>
  )
}

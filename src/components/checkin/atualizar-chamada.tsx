"use client"

import { RefreshCw } from "lucide-react"
import { useRouter } from "next/navigation"
import { useEffect, useTransition } from "react"
import { Button } from "@/components/ui/button"

export function AtualizarChamada() {
  const router = useRouter()
  const [atualizando, iniciarAtualizacao] = useTransition()
  useEffect(() => {
    const intervalo = setInterval(() => {
      if (document.visibilityState === "visible") router.refresh()
    }, 30_000)
    return () => clearInterval(intervalo)
  }, [router])
  return (
    <Button
      variant="outline"
      onClick={() => iniciarAtualizacao(() => router.refresh())}
      disabled={atualizando}
    >
      <RefreshCw className={atualizando ? "size-4 animate-spin" : "size-4"} />
      {atualizando ? "Atualizando…" : "Atualizar chamada"}
    </Button>
  )
}

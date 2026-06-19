"use client"

import { useEffect } from "react"

const INTERVALO_MS = 15 * 60 * 1000

export function LembretesTreinoGestorPulso() {
  useEffect(() => {
    let cancelado = false

    async function disparar() {
      if (cancelado) return
      try {
        await fetch("/api/tarefas/lembretes-treino", {
          method: "GET",
          cache: "no-store",
          keepalive: true,
        })
      } catch {
        // Best-effort: a próxima batida tenta novamente.
      }
    }

    void disparar()
    const intervalo = window.setInterval(() => {
      void disparar()
    }, INTERVALO_MS)

    return () => {
      cancelado = true
      window.clearInterval(intervalo)
    }
  }, [])

  return null
}

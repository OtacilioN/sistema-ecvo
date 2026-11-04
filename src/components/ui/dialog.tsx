"use client"

import { X } from "lucide-react"
import { useEffect, useId, useRef } from "react"
import { createPortal } from "react-dom"
import { cn } from "@/lib/utils"

type Variante = "centro" | "lateral"

const SELETOR_FOCAVEL =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'

// Only the foremost dialog may handle the keyboard or restore focus.
const dialogosAbertos: symbol[] = []
let overflowAnterior = ""

/**
 * Overlay controlado (modal central ou painel lateral) construído sobre um portal.
 * Cuida de: backdrop, tecla Escape, trava de scroll, foco inicial/restaurado e trap de Tab.
 */
export function Dialog({
  aberto,
  aoFechar,
  titulo,
  descricao,
  variante = "centro",
  className,
  children,
}: {
  aberto: boolean
  aoFechar: () => void
  titulo: string
  descricao?: string
  variante?: Variante
  className?: string
  children: React.ReactNode
}) {
  const painelRef = useRef<HTMLDivElement>(null)
  const aoFecharRef = useRef(aoFechar)
  const tituloId = useId()
  const descricaoId = useId()

  useEffect(() => {
    aoFecharRef.current = aoFechar
  }, [aoFechar])

  useEffect(() => {
    if (!aberto) return
    const dialogo = Symbol("dialogo")
    const elementoAnterior = document.activeElement as HTMLElement | null
    if (dialogosAbertos.length === 0) overflowAnterior = document.body.style.overflow
    dialogosAbertos.push(dialogo)
    document.body.style.overflow = "hidden"

    const painel = painelRef.current
    const primeiro = painel?.querySelector<HTMLElement>(SELETOR_FOCAVEL)
    ;(primeiro ?? painel)?.focus()

    function aoTeclar(evento: KeyboardEvent) {
      if (dialogosAbertos.at(-1) !== dialogo) return
      if (evento.key === "Escape") {
        aoFecharRef.current()
        return
      }
      if (evento.key !== "Tab" || !painel) return
      const focaveis = Array.from(painel.querySelectorAll<HTMLElement>(SELETOR_FOCAVEL))
      if (focaveis.length === 0) return
      const primeiroEl = focaveis[0]
      const ultimoEl = focaveis[focaveis.length - 1]
      if (evento.shiftKey && document.activeElement === primeiroEl) {
        evento.preventDefault()
        ultimoEl.focus()
      } else if (!evento.shiftKey && document.activeElement === ultimoEl) {
        evento.preventDefault()
        primeiroEl.focus()
      }
    }

    document.addEventListener("keydown", aoTeclar)
    return () => {
      document.removeEventListener("keydown", aoTeclar)
      const estavaNoTopo = dialogosAbertos.at(-1) === dialogo
      const indice = dialogosAbertos.indexOf(dialogo)
      if (indice !== -1) dialogosAbertos.splice(indice, 1)
      if (dialogosAbertos.length === 0) document.body.style.overflow = overflowAnterior
      if (estavaNoTopo && elementoAnterior?.isConnected) elementoAnterior.focus()
    }
  }, [aberto])

  if (!aberto) return null

  const ehLateral = variante === "lateral"

  return createPortal(
    <div className="fixed inset-0 z-50 flex">
      <button
        type="button"
        aria-label="Fechar"
        tabIndex={-1}
        onClick={aoFechar}
        className="anim-fade absolute inset-0 bg-black/40"
      />
      <div
        ref={painelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={tituloId}
        aria-describedby={descricao ? descricaoId : undefined}
        tabIndex={-1}
        className={cn(
          "z-10 flex flex-col bg-card shadow-lg outline-none",
          ehLateral
            ? "anim-slide-right fixed inset-y-0 right-0 h-dvh w-full max-w-xl border-l border-border"
            : "anim-zoom relative m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-lg rounded-lg border border-border",
          className,
        )}
      >
        <div className="flex items-start justify-between gap-4 border-b border-border p-5">
          <div className="space-y-1">
            <h2 id={tituloId} className="text-lg font-semibold leading-none tracking-tight">
              {titulo}
            </h2>
            {descricao && (
              <p id={descricaoId} className="text-sm text-muted-foreground">
                {descricao}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={aoFechar}
            aria-label="Fechar"
            className="-mr-1 -mt-1 shrink-0 rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <X className="size-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-5">{children}</div>
      </div>
    </div>,
    document.body,
  )
}

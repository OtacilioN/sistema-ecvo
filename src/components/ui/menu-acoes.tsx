"use client"

import { MoreHorizontal } from "lucide-react"
import Link from "next/link"
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { cn } from "@/lib/utils"

const CLASSE_ITEM =
  "flex w-full items-center gap-2.5 rounded-sm px-2.5 py-2 text-left text-sm transition-colors focus-visible:outline-none"
const CLASSE_ITEM_PADRAO = "text-foreground hover:bg-muted focus-visible:bg-muted"

/**
 * Menu de ações contextual por linha (dropdown "⋯").
 *
 * O conteúdo é renderizado num portal com posição `fixed` calculada a partir
 * do botão — assim o menu escapa de qualquer ancestral com `overflow` (ex.: a
 * tabela rolável dentro do Card) e nunca fica recortado. Fecha ao clicar fora,
 * apertar Escape ou rolar a página. O conteúdo recebe `fechar` para que cada
 * item possa fechar o menu antes de abrir um diálogo.
 */
export function MenuAcoes({
  children,
  rotulo = "Ações",
}: {
  children: (fechar: () => void) => React.ReactNode
  rotulo?: string
}) {
  const [aberto, setAberto] = useState(false)
  const [estilo, setEstilo] = useState<React.CSSProperties>({})
  const gatilhoRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  const fechar = useCallback(() => setAberto(false), [])

  function alternar() {
    if (aberto) {
      setAberto(false)
      return
    }
    const rect = gatilhoRef.current?.getBoundingClientRect()
    if (rect) {
      setEstilo({
        position: "fixed",
        top: rect.bottom + 4,
        right: window.innerWidth - rect.right,
      })
    }
    setAberto(true)
  }

  // Ajusta verticalmente (abre para cima) quando não há espaço abaixo.
  useLayoutEffect(() => {
    if (!aberto) return
    const rect = gatilhoRef.current?.getBoundingClientRect()
    const menu = menuRef.current
    if (!rect || !menu) return
    const altura = menu.offsetHeight
    const abrirAcima = window.innerHeight - rect.bottom < altura + 8 && rect.top > altura
    if (abrirAcima) {
      setEstilo({
        position: "fixed",
        bottom: window.innerHeight - rect.top + 4,
        right: window.innerWidth - rect.right,
      })
    }
  }, [aberto])

  useEffect(() => {
    if (!aberto) return
    function aoClicarFora(evento: MouseEvent) {
      const alvo = evento.target as Node
      if (gatilhoRef.current?.contains(alvo) || menuRef.current?.contains(alvo)) return
      setAberto(false)
    }
    function aoTeclar(evento: KeyboardEvent) {
      if (evento.key === "Escape") setAberto(false)
    }
    function aoReposicionar() {
      setAberto(false)
    }
    document.addEventListener("mousedown", aoClicarFora)
    document.addEventListener("keydown", aoTeclar)
    window.addEventListener("scroll", aoReposicionar, true)
    window.addEventListener("resize", aoReposicionar)
    return () => {
      document.removeEventListener("mousedown", aoClicarFora)
      document.removeEventListener("keydown", aoTeclar)
      window.removeEventListener("scroll", aoReposicionar, true)
      window.removeEventListener("resize", aoReposicionar)
    }
  }, [aberto])

  return (
    <>
      <button
        ref={gatilhoRef}
        type="button"
        onClick={alternar}
        aria-haspopup="menu"
        aria-expanded={aberto}
        className="inline-flex size-9 items-center justify-center rounded-md border border-input bg-card text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <MoreHorizontal className="size-4" />
        <span className="sr-only">{rotulo}</span>
      </button>
      {aberto &&
        createPortal(
          <div
            ref={menuRef}
            role="menu"
            style={estilo}
            className="anim-fade z-50 min-w-48 overflow-hidden rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-lg"
          >
            {children(fechar)}
          </div>,
          document.body,
        )}
    </>
  )
}

type IconeProps = { className?: string }

export function ItemMenu({
  icone: Icone,
  variante = "default",
  children,
  ...props
}: {
  icone?: React.ComponentType<IconeProps>
  variante?: "default" | "destructive"
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      role="menuitem"
      className={cn(
        CLASSE_ITEM,
        variante === "destructive"
          ? "text-destructive hover:bg-destructive/10 focus-visible:bg-destructive/10"
          : CLASSE_ITEM_PADRAO,
      )}
      {...props}
    >
      {Icone && <Icone className="size-4 shrink-0" />}
      {children}
    </button>
  )
}

export function ItemMenuLink({
  href,
  icone: Icone,
  children,
  onClick,
}: {
  href: string
  icone?: React.ComponentType<IconeProps>
  children: React.ReactNode
  onClick?: () => void
}) {
  return (
    <Link
      href={href}
      role="menuitem"
      onClick={onClick}
      className={cn(CLASSE_ITEM, CLASSE_ITEM_PADRAO)}
    >
      {Icone && <Icone className="size-4 shrink-0" />}
      {children}
    </Link>
  )
}

export function SeparadorMenu() {
  return <hr className="my-1 h-px border-0 bg-border" />
}

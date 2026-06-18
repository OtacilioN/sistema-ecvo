"use client"

import { Menu, X } from "lucide-react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { useEffect, useState } from "react"
import { cn } from "@/lib/utils"

export type ItemNav = {
  href: string
  rotulo: string
  icone?: React.ReactNode
  ativoEm?: string[]
}

function normalizarCaminho(caminho: string) {
  return caminho === "/" ? caminho : caminho.replace(/\/+$/, "")
}

function correspondeAoItem(pathname: string, href: string) {
  const caminhoAtual = normalizarCaminho(pathname)
  const caminhoItem = normalizarCaminho(href)

  return caminhoAtual === caminhoItem || caminhoAtual.startsWith(`${caminhoItem}/`)
}

function obterHrefAtivo(pathname: string, itens: ItemNav[]) {
  return itens
    .filter(
      (item) =>
        correspondeAoItem(pathname, item.href) ||
        item.ativoEm?.some((href) => correspondeAoItem(pathname, href)),
    )
    .toSorted((a, b) => b.href.length - a.href.length)[0]?.href
}

/** Navegação lateral (desktop / painel). */
export function NavLateral({ itens }: { itens: ItemNav[] }) {
  const pathname = usePathname()
  const hrefAtivo = obterHrefAtivo(pathname, itens)

  return (
    <nav className="flex flex-col gap-1">
      {itens.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          className={cn(
            "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
            hrefAtivo === item.href
              ? "bg-primary text-primary-foreground"
              : "text-foreground hover:bg-muted",
          )}
        >
          {item.icone}
          {item.rotulo}
        </Link>
      ))}
    </nav>
  )
}

/** Navegação principal em drawer para painéis no mobile. */
export function NavPainelMobile({ itens }: { itens: ItemNav[] }) {
  const pathname = usePathname()
  const hrefAtivo = obterHrefAtivo(pathname, itens)
  const [aberto, setAberto] = useState(false)

  useEffect(() => {
    if (!aberto) return

    const overflowOriginal = document.body.style.overflow
    document.body.style.overflow = "hidden"

    return () => {
      document.body.style.overflow = overflowOriginal
    }
  }, [aberto])

  return (
    <>
      <button
        type="button"
        onClick={() => setAberto(true)}
        aria-label="Abrir menu"
        aria-expanded={aberto}
        className="inline-flex size-10 items-center justify-center rounded-md border border-border bg-card text-foreground shadow-sm transition-colors hover:bg-muted md:hidden"
      >
        <Menu className="size-5" />
      </button>

      {aberto && (
        <div className="fixed inset-0 z-40 md:hidden">
          <button
            type="button"
            aria-label="Fechar menu"
            className="absolute inset-0 bg-foreground/35"
            onClick={() => setAberto(false)}
          />
          <aside className="anim-slide-left absolute inset-y-0 left-0 flex w-[min(20rem,86vw)] flex-col border-r border-border bg-card shadow-xl">
            <div className="flex h-14 items-center justify-between border-b border-border px-4">
              <div className="leading-tight">
                <span className="block text-sm font-semibold">Menu</span>
                <span className="block text-xs text-muted-foreground">Gestão ECVO</span>
              </div>
              <button
                type="button"
                onClick={() => setAberto(false)}
                aria-label="Fechar menu"
                className="inline-flex size-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <X className="size-5" />
              </button>
            </div>

            <nav className="flex-1 space-y-1 overflow-y-auto p-3">
              {itens.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setAberto(false)}
                  className={cn(
                    "flex items-center gap-3 rounded-md px-3 py-3 text-sm font-medium transition-colors",
                    hrefAtivo === item.href
                      ? "bg-primary text-primary-foreground"
                      : "text-foreground hover:bg-muted",
                  )}
                >
                  {item.icone}
                  <span className="min-w-0 truncate">{item.rotulo}</span>
                </Link>
              ))}
            </nav>
          </aside>
        </div>
      )}
    </>
  )
}

/** Navegação inferior fixa (mobile / aluno). Oculta no desktop, onde há sidebar. */
export function NavInferior({ itens }: { itens: ItemNav[] }) {
  const pathname = usePathname()
  const hrefAtivo = obterHrefAtivo(pathname, itens)

  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-flow-col border-t border-border bg-card pb-[env(safe-area-inset-bottom)] md:hidden">
      {itens.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          className={cn(
            "flex flex-col items-center gap-1 py-2 text-[11px] font-medium transition-colors",
            hrefAtivo === item.href ? "text-primary" : "text-muted-foreground",
          )}
        >
          {item.icone}
          {item.rotulo}
        </Link>
      ))}
    </nav>
  )
}

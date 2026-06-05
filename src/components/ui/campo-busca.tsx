"use client"

import { Search, X } from "lucide-react"
import { cn } from "@/lib/utils"

/** Campo de busca controlado, com ícone e botão de limpar. */
export function CampoBusca({
  valor,
  aoMudar,
  placeholder = "Buscar…",
  className,
}: {
  valor: string
  aoMudar: (valor: string) => void
  placeholder?: string
  className?: string
}) {
  return (
    <div className={cn("relative w-full sm:max-w-xs", className)}>
      <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
      <input
        type="search"
        value={valor}
        onChange={(evento) => aoMudar(evento.target.value)}
        placeholder={placeholder}
        className="h-10 w-full rounded-md border border-input bg-card pl-9 pr-9 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-search-cancel-button]:appearance-none"
      />
      {valor && (
        <button
          type="button"
          onClick={() => aoMudar("")}
          aria-label="Limpar busca"
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded-sm p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <X className="size-4" />
        </button>
      )}
    </div>
  )
}

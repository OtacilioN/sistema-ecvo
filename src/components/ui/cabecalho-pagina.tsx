import type * as React from "react"

/**
 * Cabeçalho padrão de página de gestão: título + descrição à esquerda,
 * ações primárias (ex.: botão "Novo…") à direita.
 */
export function CabecalhoPagina({
  titulo,
  descricao,
  children,
}: {
  titulo: string
  descricao?: string
  children?: React.ReactNode
}) {
  return (
    <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0 space-y-1">
        <h1 className="text-balance text-2xl font-bold tracking-tight">{titulo}</h1>
        {descricao && <p className="text-pretty text-sm text-muted-foreground">{descricao}</p>}
      </div>
      {children && (
        <div className="flex w-full min-w-0 flex-wrap items-center gap-2 sm:w-auto sm:shrink-0 [&>*]:w-full sm:[&>*]:w-auto">
          {children}
        </div>
      )}
    </div>
  )
}

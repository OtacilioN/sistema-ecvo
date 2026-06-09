import { type ItemNav, NavLateral, NavPainelMobile } from "@/components/layout/nav-links"
import { SairBotao } from "@/components/layout/sair-botao"
import { Marca } from "@/components/marca"
import { BotaoInstalarApp } from "@/components/pwa-install-button"

// Shell para áreas de Gestor e Professor: drawer no mobile, sidebar no desktop.
export function PainelShell({
  itens,
  usuarioNome,
  papelRotulo,
  children,
}: {
  itens: ItemNav[]
  usuarioNome: string
  papelRotulo: string
  children: React.ReactNode
}) {
  return (
    <div className="flex min-h-dvh min-w-0 flex-col overflow-x-hidden print:block print:min-h-0 print:overflow-visible print:bg-white">
      <header className="sticky top-0 z-20 flex h-14 items-center justify-between gap-3 border-b border-border bg-card px-3 sm:px-4 print:hidden">
        <div className="flex min-w-0 items-center gap-2">
          <NavPainelMobile itens={itens} />
          <Marca tamanho={32} />
        </div>
        <div className="flex min-w-0 items-center gap-2 sm:gap-3">
          <BotaoInstalarApp />
          <div className="min-w-0 text-right leading-tight">
            <span className="block text-sm font-medium">{usuarioNome}</span>
            <span className="block text-xs text-muted-foreground">{papelRotulo}</span>
          </div>
          <SairBotao />
        </div>
      </header>

      <div className="flex min-w-0 flex-1 print:block print:min-h-0 print:overflow-visible">
        <aside className="hidden w-60 shrink-0 border-r border-border bg-card p-3 print:hidden md:block">
          <NavLateral itens={itens} />
        </aside>
        <main className="min-w-0 flex-1 overflow-x-hidden p-3 print:overflow-visible print:p-0 sm:p-4 md:p-6">
          {children}
        </main>
      </div>
    </div>
  )
}

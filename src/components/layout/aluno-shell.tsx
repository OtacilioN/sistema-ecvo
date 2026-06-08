import { Bell } from "lucide-react"
import Link from "next/link"
import { type ItemNav, NavInferior, NavLateral } from "@/components/layout/nav-links"
import { SairBotao } from "@/components/layout/sair-botao"
import { Marca } from "@/components/marca"
import { Button } from "@/components/ui/button"

// Shell do Aluno: navegação inferior fixa no mobile (RNF-002) e sidebar no desktop.
export function AlunoShell({
  itens,
  usuarioNome,
  children,
}: {
  itens: ItemNav[]
  usuarioNome: string
  children: React.ReactNode
}) {
  return (
    <div className="flex min-h-dvh min-w-0 flex-col">
      <header className="sticky top-0 z-20 flex h-14 items-center justify-between gap-3 border-b border-border bg-card px-4 md:h-16 md:px-6">
        <Marca tamanho={32} />
        <div className="flex items-center gap-1 md:gap-3">
          <div className="hidden text-right leading-tight md:block">
            <span className="block text-sm font-medium">{usuarioNome}</span>
            <span className="block text-xs text-muted-foreground">Aluno</span>
          </div>
          <Button asChild variant="ghost" size="icon" aria-label="Notificações">
            <Link href="/aluno/notificacoes">
              <Bell />
              <span className="sr-only">Notificações</span>
            </Link>
          </Button>
          <SairBotao />
        </div>
      </header>

      <div className="flex min-w-0 flex-1">
        <aside className="hidden w-60 shrink-0 border-r border-border bg-card p-3 md:block">
          <NavLateral itens={itens} />
        </aside>
        <main className="mx-auto w-full max-w-2xl flex-1 p-4 pb-24 md:max-w-5xl md:p-8 md:pb-8">
          {children}
        </main>
      </div>

      <NavInferior itens={itens} />
    </div>
  )
}

import { Bell } from "lucide-react"
import Link from "next/link"
import { type ItemNav, NavInferior } from "@/components/layout/nav-links"
import { SairBotao } from "@/components/layout/sair-botao"
import { Marca } from "@/components/marca"
import { Button } from "@/components/ui/button"

// Shell mobile-first do Aluno (RNF-002): header enxuto + navegação inferior fixa.
export function AlunoShell({ itens, children }: { itens: ItemNav[]; children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-20 flex h-14 items-center justify-between border-b border-border bg-card px-4">
        <Marca tamanho={32} comTexto={false} />
        <span className="text-sm font-semibold">ECVO</span>
        <div className="flex items-center gap-1">
          <Button asChild variant="ghost" size="icon" aria-label="Notificações">
            <Link href="/aluno/notificacoes">
              <Bell />
              <span className="sr-only">Notificações</span>
            </Link>
          </Button>
          <SairBotao />
        </div>
      </header>
      <main className="mx-auto w-full max-w-2xl flex-1 p-4 pb-24">{children}</main>
      <NavInferior itens={itens} />
    </div>
  )
}

import Link from "next/link"
import { Marca } from "@/components/marca"
import { Button } from "@/components/ui/button"

export const metadata = {
  title: "Sem conexão",
}

export default function OfflinePage() {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-background px-4 py-10 text-foreground">
      <div className="w-full max-w-md space-y-8">
        <Marca tamanho={56} />

        <section className="space-y-4">
          <div className="space-y-2">
            <p className="text-sm font-medium text-primary">Modo offline</p>
            <h1 className="text-3xl font-bold tracking-tight">Sem conexão com a internet</h1>
          </div>
          <p className="text-base leading-7 text-muted-foreground">
            As telas abertas anteriormente podem continuar disponíveis. Ações como check-in,
            presença, exclusões e alterações de cadastro serão liberadas quando a conexão voltar.
          </p>
        </section>

        <Button asChild>
          <Link href="/">Tentar novamente</Link>
        </Button>
      </div>
    </main>
  )
}

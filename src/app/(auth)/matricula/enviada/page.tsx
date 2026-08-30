import { Check, Clock3 } from "lucide-react"
import type { Metadata } from "next"
import Link from "next/link"
import { Marca } from "@/components/marca"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"

export const metadata: Metadata = { title: "Matrícula enviada" }

export default function MatriculaEnviadaPage() {
  return (
    <main className="w-full max-w-lg">
      <div className="mb-6 flex justify-center">
        <Marca tamanho={56} />
      </div>
      <Card className="overflow-hidden">
        <div className="h-1.5 bg-primary" />
        <CardContent className="space-y-6 py-8 text-center sm:px-8">
          <div className="mx-auto flex size-14 items-center justify-center rounded-full bg-success text-success-foreground">
            <Check className="size-7" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Matrícula enviada</h1>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              Recebemos seus dados. A equipe vai conferir a solicitação e a forma de matrícula
              escolhida antes de criar seu acesso.
            </p>
          </div>
          <div className="flex items-start gap-3 rounded-lg border border-border bg-muted/30 p-4 text-left text-sm">
            <Clock3 className="mt-0.5 size-5 shrink-0 text-primary" />
            <p>
              Quando a matrícula for aprovada, você poderá entrar com o e-mail e a senha informados
              no cadastro.
            </p>
          </div>
          <Button asChild size="lg" className="w-full">
            <Link href="/login">Ir para a tela de acesso</Link>
          </Button>
        </CardContent>
      </Card>
    </main>
  )
}

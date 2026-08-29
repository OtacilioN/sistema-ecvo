import { ArrowLeft, ShieldCheck } from "lucide-react"
import type { Metadata } from "next"
import Link from "next/link"
import { Marca } from "@/components/marca"
import { listarOpcoesPublicasMatricula } from "@/lib/services/matricula.service"
import { FormMatricula } from "./form-matricula"

export const metadata: Metadata = {
  title: "Cadastro e matrícula",
  description: "Solicite sua matrícula na ECVO e escolha a modalidade que deseja treinar.",
}

export const dynamic = "force-dynamic"

export default async function MatriculaPage() {
  const modalidades = await listarOpcoesPublicasMatricula()

  return (
    <main className="w-full max-w-5xl py-4">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <Link
          href="/login"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-4" /> Voltar para o acesso
        </Link>
        <div className="flex items-center gap-3">
          <Marca tamanho={44} />
          <div>
            <p className="text-sm font-bold tracking-[0.18em]">ECVO</p>
            <p className="text-xs text-muted-foreground">Escola de combate</p>
          </div>
        </div>
      </div>

      <section className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
        <div className="relative overflow-hidden border-b border-border bg-foreground px-5 py-8 text-background sm:px-8 sm:py-10">
          <div className="absolute inset-y-0 left-0 w-1.5 bg-primary" />
          <div className="relative max-w-2xl space-y-3">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-primary">
              Comece seu treino
            </p>
            <h1 className="text-balance text-3xl font-black tracking-tight sm:text-4xl">
              Cadastro e matrícula
            </h1>
            <p className="max-w-xl text-sm leading-relaxed text-background/70 sm:text-base">
              Escolha sua modalidade, confira a grade disponível e envie seus dados. A equipe
              analisará a solicitação antes de liberar seu acesso às aulas e ao check-in.
            </p>
          </div>
        </div>

        <FormMatricula modalidades={modalidades} />
      </section>

      <p className="mt-5 flex items-center justify-center gap-2 text-center text-xs text-muted-foreground">
        <ShieldCheck className="size-4" /> Seus dados são usados somente para analisar e efetivar a
        matrícula.
      </p>
    </main>
  )
}

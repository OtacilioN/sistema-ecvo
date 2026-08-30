import {
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  CreditCard,
  ShieldCheck,
  TicketCheck,
} from "lucide-react"
import type { Metadata } from "next"
import Link from "next/link"
import { Marca } from "@/components/marca"
import { listarOpcoesPublicasMatricula } from "@/lib/services/matricula.service"
import { obterPlanoPadraoMatricula } from "@/lib/services/pagamento-matricula.service"
import { FormMatricula } from "./form-matricula"

export const metadata: Metadata = {
  title: "Cadastro e matrícula",
  description: "Solicite sua matrícula na ECVO e escolha a modalidade que deseja treinar.",
}

export const dynamic = "force-dynamic"

export type TipoPagamentoMatriculaPublica = "MENSALISTA" | "WELLHUB" | "TOTALPASS"

const OPCOES: Array<{
  tipo: TipoPagamentoMatriculaPublica
  parametro: string
  titulo: string
  chamada: string
  descricao: string
  icone: typeof CreditCard
}> = [
  {
    tipo: "MENSALISTA",
    parametro: "mensalista",
    titulo: "Mensalista",
    chamada: "Plano direto ECVO",
    descricao: "Matrícula com primeira mensalidade via PIX e pagamentos mensais à ECVO.",
    icone: CreditCard,
  },
  {
    tipo: "WELLHUB",
    parametro: "wellhub",
    titulo: "Wellhub",
    chamada: "A partir do plano Basic",
    descricao: "Sem pagamento de matrícula ou mensalidade à ECVO.",
    icone: BadgeCheck,
  },
  {
    tipo: "TOTALPASS",
    parametro: "totalpass",
    titulo: "TotalPass",
    chamada: "A partir do plano TP1+",
    descricao: "Sem pagamento de matrícula ou mensalidade à ECVO.",
    icone: TicketCheck,
  },
]

export default async function MatriculaPage({
  searchParams,
}: {
  searchParams: Promise<{ tipoPagamento?: string | string[] }>
}) {
  const tipoPagamento = normalizarTipoPagamento((await searchParams).tipoPagamento)
  const titulo = tipoPagamento ? tituloDoFluxo(tipoPagamento) : "Escolha como deseja se matricular"

  let modalidades: Awaited<ReturnType<typeof listarOpcoesPublicasMatricula>> = []
  let planoPadrao: Awaited<ReturnType<typeof obterPlanoPadraoMatricula>> = null
  if (tipoPagamento) {
    const resultados = await Promise.all([
      listarOpcoesPublicasMatricula(),
      tipoPagamento === "MENSALISTA" ? obterPlanoPadraoMatricula() : Promise.resolve(null),
    ])
    modalidades = resultados[0]
    planoPadrao = resultados[1]
  }

  const formularioDisponivel = tipoPagamento !== "MENSALISTA" || Boolean(planoPadrao)

  return (
    <main className="w-full max-w-5xl py-4">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <Link
          href={tipoPagamento ? "/matricula" : "/login"}
          className="inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          {tipoPagamento ? "Trocar forma de matrícula" : "Voltar para o acesso"}
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
          <div className="absolute -right-16 top-1/2 h-44 w-44 -translate-y-1/2 rotate-45 border border-background/10" />
          <div className="relative max-w-2xl space-y-3">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-primary">
              Comece seu treino
            </p>
            <h1 className="text-balance text-3xl font-black tracking-tight sm:text-4xl">
              {titulo}
            </h1>
            <p className="max-w-xl text-sm leading-relaxed text-background/70 sm:text-base">
              {tipoPagamento
                ? descricaoDoFluxo(tipoPagamento)
                : "Selecione a forma de acesso que você já utiliza. Cada opção abre o cadastro com as etapas e declarações corretas."}
            </p>
          </div>
        </div>

        {!tipoPagamento ? (
          <EscolhaTipoPagamento />
        ) : formularioDisponivel ? (
          <FormMatricula
            modalidades={modalidades}
            tipoPagamento={tipoPagamento}
            planoPadrao={planoPadrao ? { ...planoPadrao, valor: Number(planoPadrao.valor) } : null}
          />
        ) : (
          <p className="p-8 text-center text-sm text-destructive">
            A matrícula mensalista online está temporariamente indisponível porque o plano padrão
            não foi configurado. As matrículas por Wellhub e TotalPass continuam disponíveis.
          </p>
        )}
      </section>

      <p className="mt-5 flex items-center justify-center gap-2 text-center text-xs text-muted-foreground">
        <ShieldCheck className="size-4" /> Seus dados são usados somente para analisar e efetivar a
        matrícula.
      </p>
    </main>
  )
}

function EscolhaTipoPagamento() {
  return (
    <div className="p-5 sm:p-8">
      <div className="grid gap-4 md:grid-cols-3">
        {OPCOES.map((opcao, indice) => {
          const Icone = opcao.icone
          return (
            <Link
              key={opcao.tipo}
              href={`/matricula?tipoPagamento=${opcao.parametro}`}
              className="group relative flex min-h-64 flex-col overflow-hidden rounded-xl border border-border bg-background p-5 transition-[border-color,box-shadow,transform] hover:-translate-y-1 hover:border-primary/60 hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span className="absolute right-4 top-3 font-mono text-5xl font-black text-muted/70">
                0{indice + 1}
              </span>
              <span className="relative flex size-11 items-center justify-center rounded-lg bg-foreground text-background transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
                <Icone className="size-5" />
              </span>
              <div className="relative mt-auto pt-10">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">
                  {opcao.chamada}
                </p>
                <h2 className="mt-2 text-2xl font-black tracking-tight">{opcao.titulo}</h2>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  {opcao.descricao}
                </p>
                <span className="mt-5 inline-flex items-center gap-2 text-sm font-semibold">
                  Escolher
                  <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" />
                </span>
              </div>
            </Link>
          )
        })}
      </div>
      <p className="mt-6 text-center text-xs text-muted-foreground">
        Você poderá voltar e trocar a opção antes de enviar seus dados.
      </p>
    </div>
  )
}

function normalizarTipoPagamento(
  valor: string | string[] | undefined,
): TipoPagamentoMatriculaPublica | null {
  if (typeof valor !== "string") return null
  const normalizado = valor.trim().toUpperCase()
  if (normalizado === "MENSALISTA" || normalizado === "WELLHUB" || normalizado === "TOTALPASS") {
    return normalizado
  }
  return null
}

function tituloDoFluxo(tipo: TipoPagamentoMatriculaPublica) {
  if (tipo === "WELLHUB") return "Matrícula Wellhub"
  if (tipo === "TOTALPASS") return "Matrícula TotalPass"
  return "Matrícula mensalista"
}

function descricaoDoFluxo(tipo: TipoPagamentoMatriculaPublica) {
  if (tipo === "WELLHUB") {
    return "Preencha seus dados e declare ter um plano Wellhub ativo a partir do Basic. Não há pagamento de matrícula ou mensalidade à ECVO."
  }
  if (tipo === "TOTALPASS") {
    return "Preencha seus dados e declare ter um plano TotalPass ativo a partir do TP1+. Não há pagamento de matrícula ou mensalidade à ECVO."
  }
  return "Escolha sua modalidade, confira a grade e conclua a primeira mensalidade por PIX para enviar sua solicitação."
}

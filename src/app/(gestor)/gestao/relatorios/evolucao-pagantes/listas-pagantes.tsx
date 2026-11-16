"use client"

import { Check, Copy, Search } from "lucide-react"
import Link from "next/link"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { consultarEvolucaoPagantes } from "@/lib/services/evolucao-pagantes.service"
import { cn } from "@/lib/utils"

type Listas = Awaited<ReturnType<typeof consultarEvolucaoPagantes>>["listas"]
type Grupo = keyof Listas

const grupos: { id: Grupo; titulo: string; descricao: string }[] = [
  {
    id: "saidas",
    titulo: "Saídas",
    descricao: "Pagaram o mês anterior, mas não a competência selecionada.",
  },
  {
    id: "recorrentes",
    titulo: "Recorrentes",
    descricao: "Pagaram a competência anterior e a selecionada.",
  },
  {
    id: "novos",
    titulo: "Novos pagantes",
    descricao: "Primeira competência paga no histórico disponível.",
  },
  {
    id: "retornos",
    titulo: "Retornos",
    descricao: "Voltaram a pagar após pelo menos uma competência sem pagamento.",
  },
]

const situacoes: Record<string, string> = {
  PAGA: "Paga",
  ISENTA: "Isenta",
  EM_ABERTO: "Em aberto",
  VENCIDA: "Vencida",
  CANCELADA: "Cancelada",
  SEM_MENSALIDADE: "Sem mensalidade",
}

function normalizar(valor: string) {
  return valor
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR")
}

export function ListasPagantes({
  listas,
  periodo,
  anterior,
  parcial,
  modalidadeNome,
}: {
  listas: Listas
  periodo: string
  anterior: string
  parcial: boolean
  modalidadeNome?: string
}) {
  const [grupo, setGrupo] = useState<Grupo>("saidas")
  const [busca, setBusca] = useState("")
  const [copia, setCopia] = useState<"inicial" | "copiado" | "erro">("inicial")
  const selecionado = grupos.find((item) => item.id === grupo) ?? grupos[0]
  const alunos = listas[grupo].filter((aluno) =>
    normalizar(aluno.nome).includes(normalizar(busca.trim())),
  )
  const texto = [
    `*${selecionado.titulo} — ${periodo}*`,
    `${alunos.length} aluno(s)${busca.trim() ? " na busca" : ""}. Comparação com ${anterior}.`,
    ...(modalidadeNome
      ? [
          `Modalidade atual do cadastro: ${modalidadeNome}. Não reconstrói trocas anteriores de modalidade.`,
        ]
      : []),
    selecionado.descricao,
    "Isenção considerada como não pagamento.",
    ...(parcial ? ["Resultado parcial: mês em andamento."] : []),
    "",
    ...alunos.map((aluno, index) => `${index + 1}. ${aluno.nome}`),
  ].join("\n")

  async function copiar() {
    try {
      await navigator.clipboard.writeText(texto)
      setCopia("copiado")
    } catch {
      setCopia("erro")
    }
  }

  return (
    <section aria-labelledby="listas-pagantes" className="rounded-lg border bg-card shadow-sm">
      <div className="border-b p-4 sm:p-5">
        <h2 id="listas-pagantes" className="font-semibold">
          Quem compõe cada grupo
        </h2>
        <fieldset className="mt-4 grid grid-cols-2 gap-2 lg:grid-cols-4">
          <legend className="sr-only">Grupos de pagantes</legend>
          {grupos.map((item) => (
            <button
              key={item.id}
              type="button"
              aria-pressed={grupo === item.id}
              onClick={() => {
                setGrupo(item.id)
                setBusca("")
                setCopia("inicial")
              }}
              className={cn(
                "flex min-h-12 items-center justify-between gap-2 rounded-md border px-3 py-2 text-left text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                grupo === item.id
                  ? "border-foreground bg-foreground text-background"
                  : "border-border hover:bg-muted",
              )}
            >
              {item.titulo}
              <span className="tabular-nums">{listas[item.id].length}</span>
            </button>
          ))}
        </fieldset>
      </div>
      <div className="space-y-4 p-4 sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="space-y-1">
            <h3 className="font-semibold">
              {selecionado.titulo}{" "}
              <span className="font-normal text-muted-foreground">· {listas[grupo].length}</span>
            </h3>
            <p className="text-sm text-muted-foreground">{selecionado.descricao}</p>
          </div>
          <Button variant="outline" onClick={copiar} disabled={alunos.length === 0}>
            {copia === "copiado" ? <Check className="size-4" /> : <Copy className="size-4" />}
            {copia === "copiado" ? "Lista copiada" : "Copiar para WhatsApp"}
          </Button>
        </div>
        <div className="max-w-sm space-y-2">
          <Label htmlFor="busca-pagantes">Buscar aluno neste grupo</Label>
          <div className="relative">
            <Search
              aria-hidden="true"
              className="absolute left-3 top-3 size-4 text-muted-foreground"
            />
            <Input
              id="busca-pagantes"
              type="search"
              value={busca}
              className="pl-9"
              placeholder="Nome do aluno"
              onChange={(event) => {
                setBusca(event.target.value)
                setCopia("inicial")
              }}
            />
          </div>
        </div>
        <p role="status" className="text-xs text-muted-foreground">
          {copia === "copiado"
            ? "Lista copiada. Cole na conversa do WhatsApp."
            : `${alunos.length} de ${listas[grupo].length} aluno(s). A cópia inclui os nomes exibidos.`}
        </p>
        {copia === "erro" && (
          <div className="space-y-2">
            <Label htmlFor="lista-para-copiar">
              Não foi possível copiar automaticamente. Selecione e copie o texto abaixo.
            </Label>
            <textarea
              id="lista-para-copiar"
              readOnly
              value={texto}
              onFocus={(event) => event.target.select()}
              className="min-h-44 w-full rounded-md border bg-background p-3 text-sm"
            />
          </div>
        )}
        {alunos.length ? (
          <ul
            className="divide-y"
            aria-label={`Lista de ${selecionado.titulo.toLocaleLowerCase("pt-BR")}`}
          >
            {alunos.map((aluno) => (
              <li
                key={aluno.id}
                className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <Link
                  href={`/gestao/alunos/${aluno.id}`}
                  className="text-sm font-medium underline-offset-4 hover:underline"
                >
                  {aluno.nome}
                </Link>
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  <span>
                    Anterior:{" "}
                    <strong className="font-medium text-foreground">
                      {situacoes[aluno.situacaoAnterior]}
                    </strong>
                  </span>
                  <span>
                    Selecionada:{" "}
                    <strong
                      className={cn(
                        "font-medium",
                        aluno.situacaoAtual === "PAGA" ? "text-success" : "text-foreground",
                      )}
                    >
                      {situacoes[aluno.situacaoAtual]}
                    </strong>
                  </span>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="rounded-md bg-muted/50 px-4 py-8 text-center text-sm text-muted-foreground">
            {busca.trim()
              ? "Nenhum aluno encontrado nesta busca."
              : "Nenhum aluno neste grupo para a competência selecionada."}
          </p>
        )}
      </div>
    </section>
  )
}

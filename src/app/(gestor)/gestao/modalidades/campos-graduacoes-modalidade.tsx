"use client"

import { Plus, RotateCcw, Trash2 } from "lucide-react"
import { useEffect, useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"

export type GraduacaoForm = {
  id?: string | null
  nome: string
  ordem: number
  minHoras: number | null
  minFrequencia: number | null
  minTempoNoGrauDias: number | null
}

type LinhaGraduacao = GraduacaoForm & { chave: string; remover: boolean }

export function CamposGraduacoesModalidade({ graduacoes = [] }: { graduacoes?: GraduacaoForm[] }) {
  const iniciais = useMemo(
    () =>
      graduacoes.map((graduacao, index) => ({
        ...graduacao,
        chave: graduacao.id ?? `nova-${index}`,
        remover: false,
      })),
    [graduacoes],
  )
  const [linhas, setLinhas] = useState<LinhaGraduacao[]>(iniciais)

  useEffect(() => {
    setLinhas(iniciais)
  }, [iniciais])

  const adicionar = () => {
    const maiorOrdem = linhas.reduce((maior, linha) => Math.max(maior, linha.ordem), 0)
    setLinhas((atuais) => [
      ...atuais,
      {
        chave: `nova-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        id: null,
        nome: "",
        ordem: maiorOrdem + 1,
        minHoras: null,
        minFrequencia: null,
        minTempoNoGrauDias: null,
        remover: false,
      },
    ])
  }

  const alternarRemocao = (chave: string) => {
    setLinhas((atuais) =>
      atuais.flatMap((linha) => {
        if (linha.chave !== chave) return linha
        if (!linha.id) return []
        return { ...linha, remover: !linha.remover }
      }),
    )
  }

  return (
    <fieldset className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <Label>Graduações</Label>
        <Button type="button" variant="outline" size="sm" onClick={adicionar}>
          <Plus className="size-4" /> Adicionar
        </Button>
      </div>

      <div className="space-y-3">
        {linhas.map((linha, index) => (
          <div
            key={linha.chave}
            className={cn(
              "grid gap-3 rounded-md border border-border p-3 sm:grid-cols-[minmax(14rem,1fr)_5rem_7rem_auto]",
              linha.remover && "border-destructive/50 bg-destructive/5 opacity-75",
            )}
          >
            <input type="hidden" name="graduacaoId" value={linha.id ?? ""} />
            {linha.remover && linha.id && (
              <input type="hidden" name="graduacaoRemover" value={linha.id} />
            )}

            <CampoTexto
              id={`graduacao-nome-${linha.chave}`}
              label="Nome"
              name="graduacaoNome"
              defaultValue={linha.nome}
            />
            <CampoNumero
              id={`graduacao-ordem-${linha.chave}`}
              label="Ordem"
              name="graduacaoOrdem"
              defaultValue={linha.ordem || index + 1}
            />
            <CampoNumero
              id={`graduacao-horas-${linha.chave}`}
              label="Horas mín."
              name="graduacaoMinHoras"
              defaultValue={linha.minHoras}
            />

            <div className="flex items-end justify-end">
              <Button
                type="button"
                variant={linha.remover ? "secondary" : "destructive"}
                size="icon"
                onClick={() => alternarRemocao(linha.chave)}
                aria-label={linha.remover ? "Manter graduação" : "Remover graduação"}
                title={linha.remover ? "Manter graduação" : "Remover graduação"}
              >
                {linha.remover ? <RotateCcw className="size-4" /> : <Trash2 className="size-4" />}
              </Button>
            </div>
          </div>
        ))}

        {linhas.length === 0 && (
          <div className="rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">
            Nenhuma graduação cadastrada.
          </div>
        )}
      </div>
    </fieldset>
  )
}

function CampoTexto({
  id,
  label,
  name,
  defaultValue,
}: {
  id: string
  label: string
  name: string
  defaultValue: string
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} name={name} defaultValue={defaultValue} required />
    </div>
  )
}

function CampoNumero({
  id,
  label,
  name,
  defaultValue,
  max,
}: {
  id: string
  label: string
  name: string
  defaultValue: number | null
  max?: number
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        name={name}
        type="number"
        min={0}
        max={max}
        defaultValue={defaultValue ?? ""}
      />
    </div>
  )
}

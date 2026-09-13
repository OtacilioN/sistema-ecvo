"use client"

import { Save } from "lucide-react"
import { useActionState, useState } from "react"
import { acaoSalvarOutrasReceitas } from "@/app/actions/outras-receitas"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  CAMPOS_OUTRAS_RECEITAS,
  type ValoresOutrasReceitas,
} from "@/lib/financeiro/outras-receitas"
import { formatarCompetencia } from "@/lib/utils/datas"
import { formatarBRL } from "@/lib/utils/formato"

export function FormOutrasReceitas({
  competencia,
  valores,
  personalizado,
  somenteLeitura,
}: {
  competencia: string
  valores: ValoresOutrasReceitas
  personalizado: boolean
  somenteLeitura: boolean
}) {
  const [estado, acao, pendente] = useActionState(acaoSalvarOutrasReceitas, undefined)
  const [rascunho, setRascunho] = useState(() =>
    Object.fromEntries(CAMPOS_OUTRAS_RECEITAS.map(({ nome }) => [nome, valores[nome].toFixed(2)])),
  )
  const totalCentavos = CAMPOS_OUTRAS_RECEITAS.reduce((total, { nome }) => {
    const valor = Number(rascunho[nome])
    return total + (Number.isFinite(valor) ? Math.round(valor * 100) : 0)
  }, 0)

  return (
    <Card id="outras-receitas" className="scroll-mt-4">
      <CardHeader>
        <CardTitle>Outras fontes de receita de {formatarCompetencia(competencia)}</CardTitle>
        <CardDescription>
          {personalizado
            ? "Valores configurados para este mês."
            : "Este mês utiliza os valores padrão de receita."}{" "}
          A receita fica integralmente com a escola, sem repasse aos professores. As alterações
          valem apenas para o mês selecionado.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form action={acao} className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Aluguel de horário: padrão de R$ 500,00 a partir de setembro de 2026 e R$ 0,00 nos meses
            anteriores. Outros: padrão de R$ 0,00.
          </p>
          <input type="hidden" name="competencia" value={competencia} />
          <fieldset
            disabled={somenteLeitura || pendente}
            className="grid gap-4 sm:grid-cols-2 lg:grid-cols-2"
          >
            <legend className="sr-only">Outras fontes de receita em reais</legend>
            {CAMPOS_OUTRAS_RECEITAS.map(({ nome, rotulo }) => (
              <div key={nome} className="space-y-1.5">
                <Label htmlFor={`receita-${nome}`}>{rotulo} (R$)</Label>
                <Input
                  id={`receita-${nome}`}
                  name={nome}
                  type="number"
                  inputMode="decimal"
                  min="0"
                  max="9999999999.99"
                  step="0.01"
                  value={rascunho[nome]}
                  onChange={(event) =>
                    setRascunho((atual) => ({ ...atual, [nome]: event.target.value }))
                  }
                  required
                />
              </div>
            ))}
          </fieldset>
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
            <p className="text-sm">
              Total informado:{" "}
              <strong className="tabular-nums">{formatarBRL(totalCentavos / 100)}</strong>
            </p>
            {!somenteLeitura && (
              <Button type="submit" disabled={pendente}>
                <Save className="size-4" /> {pendente ? "Salvando…" : "Salvar receitas deste mês"}
              </Button>
            )}
          </div>
          {estado?.erro && (
            <p role="alert" className="text-sm text-destructive">
              {estado.erro}
            </p>
          )}
          {estado?.ok && (
            <p role="status" className="text-sm text-emerald-700">
              Receitas de {formatarCompetencia(competencia)} salvas.
            </p>
          )}
        </form>
      </CardContent>
    </Card>
  )
}

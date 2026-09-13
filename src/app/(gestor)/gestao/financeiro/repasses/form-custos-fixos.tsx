"use client"

import { Save } from "lucide-react"
import { useActionState, useState } from "react"
import { acaoSalvarCustosFixos } from "@/app/actions/custos-fixos"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { CAMPOS_CUSTOS_FIXOS, type ValoresCustosFixos } from "@/lib/financeiro/custos-fixos"
import { formatarCompetencia } from "@/lib/utils/datas"
import { formatarBRL } from "@/lib/utils/formato"

export function FormCustosFixos({
  competencia,
  valores,
  personalizado,
  somenteLeitura,
}: {
  competencia: string
  valores: ValoresCustosFixos
  personalizado: boolean
  somenteLeitura: boolean
}) {
  const [estado, acao, pendente] = useActionState(acaoSalvarCustosFixos, undefined)
  const [rascunho, setRascunho] = useState(() =>
    Object.fromEntries(CAMPOS_CUSTOS_FIXOS.map(({ nome }) => [nome, valores[nome].toFixed(2)])),
  )
  const totalCentavos = CAMPOS_CUSTOS_FIXOS.reduce((total, { nome }) => {
    const valor = Number(rascunho[nome])
    return total + (Number.isFinite(valor) ? Math.round(valor * 100) : 0)
  }, 0)

  return (
    <Card id="custos-fixos" className="scroll-mt-4">
      <CardHeader>
        <CardTitle>Custos fixos de {formatarCompetencia(competencia)}</CardTitle>
        <CardDescription>
          {personalizado
            ? "Valores configurados para este mês."
            : "Este mês utiliza os valores padrão."}{" "}
          As alterações valem apenas para o mês selecionado e atualizam a divisão da sobra após
          salvar.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form action={acao} className="space-y-4">
          <input type="hidden" name="competencia" value={competencia} />
          <fieldset
            disabled={somenteLeitura || pendente}
            className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
          >
            <legend className="sr-only">Custos mensais em reais</legend>
            {CAMPOS_CUSTOS_FIXOS.map(({ nome, rotulo }) => (
              <div key={nome} className="space-y-1.5">
                <Label htmlFor={`custo-${nome}`}>{rotulo} (R$)</Label>
                <Input
                  id={`custo-${nome}`}
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
                <Save className="size-4" /> {pendente ? "Salvando…" : "Salvar custos deste mês"}
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
              Custos de {formatarCompetencia(competencia)} salvos.
            </p>
          )}
        </form>
      </CardContent>
    </Card>
  )
}

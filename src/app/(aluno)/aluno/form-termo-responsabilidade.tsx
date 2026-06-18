"use client"

import { ShieldCheck } from "lucide-react"
import { useActionState, useMemo, useState } from "react"
import {
  acaoAceitarTermoResponsabilidade,
  type EstadoTermoResponsabilidade,
} from "@/app/actions/termo-responsabilidade"
import { BotaoEnviar } from "@/components/ui/botao-enviar"
import { Label } from "@/components/ui/label"
import {
  DECLARACAO_RESPONSAVEL_MENOR_ID,
  DECLARACOES_TERMO_RESPONSABILIDADE,
} from "@/lib/termo-responsabilidade"

type Props = {
  menorDeIdade: boolean
}

export function FormTermoResponsabilidade({ menorDeIdade }: Props) {
  const [estado, acao] = useActionState<EstadoTermoResponsabilidade, FormData>(
    acaoAceitarTermoResponsabilidade,
    undefined,
  )
  const [marcados, setMarcados] = useState<Record<string, boolean>>({})
  const totalObrigatorio = DECLARACOES_TERMO_RESPONSABILIDADE.length + (menorDeIdade ? 1 : 0)
  const totalMarcado = useMemo(() => Object.values(marcados).filter(Boolean).length, [marcados])
  const todosMarcados = totalMarcado === totalObrigatorio

  function alternar(id: string, checked: boolean) {
    setMarcados((atual) => ({ ...atual, [id]: checked }))
  }

  return (
    <form action={acao} className="space-y-4">
      <div className="space-y-3">
        {DECLARACOES_TERMO_RESPONSABILIDADE.map((declaracao) => (
          <Label
            key={declaracao.id}
            className="grid cursor-pointer grid-cols-[auto_1fr] gap-3 rounded-md border border-border bg-background p-3 leading-relaxed"
          >
            <input
              type="checkbox"
              name="declaracoes"
              value={declaracao.id}
              checked={Boolean(marcados[declaracao.id])}
              onChange={(event) => alternar(declaracao.id, event.target.checked)}
              className="mt-1 size-4 accent-primary"
            />
            <span className="text-sm font-normal">{declaracao.texto}</span>
          </Label>
        ))}

        {menorDeIdade && (
          <Label className="grid cursor-pointer grid-cols-[auto_1fr] gap-3 rounded-md border border-warning/40 bg-warning/10 p-3 leading-relaxed">
            <input
              type="checkbox"
              name="declaracoes"
              value={DECLARACAO_RESPONSAVEL_MENOR_ID}
              checked={Boolean(marcados[DECLARACAO_RESPONSAVEL_MENOR_ID])}
              onChange={(event) => alternar(DECLARACAO_RESPONSAVEL_MENOR_ID, event.target.checked)}
              className="mt-1 size-4 accent-primary"
            />
            <span className="text-sm font-normal">
              Sou responsável legal pelo aluno menor de 18 anos e autorizo a assinatura digital
              deste termo.
            </span>
          </Label>
        )}
      </div>

      {estado?.erro && (
        <p className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          {estado.erro}
        </p>
      )}

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-muted-foreground">
          {totalMarcado}/{totalObrigatorio} aceites obrigatórios marcados.
        </p>
        <BotaoEnviar disabled={!todosMarcados} className="w-full sm:w-auto">
          <ShieldCheck className="size-4" />
          Aceitar termo
        </BotaoEnviar>
      </div>
    </form>
  )
}

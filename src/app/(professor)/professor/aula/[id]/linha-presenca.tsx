"use client"

import { Check, RotateCcw } from "lucide-react"
import { useActionState, useState } from "react"
import {
  acaoAtualizarObservacaoTecnica,
  acaoInvalidarCheckin,
  acaoLancarCheckin,
  type EstadoTreino,
} from "@/app/actions/treino"
import { Badge } from "@/components/ui/badge"
import { BotaoEnviar } from "@/components/ui/botao-enviar"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { ROTULO_STATUS_LINHA, type StatusLinha } from "@/lib/aula-monitoramento"

export function LinhaPresenca({
  aulaId,
  alunoId,
  nome,
  observacoesTecnicas,
  status,
  checkinId,
  somenteLeitura = false,
}: {
  aulaId: string
  alunoId: string
  nome: string
  observacoesTecnicas: string | null
  status: StatusLinha
  checkinId: string | null
  somenteLeitura?: boolean
}) {
  const [lancar, acaoLancar] = useActionState<EstadoTreino, FormData>(acaoLancarCheckin, undefined)
  const [invalidar, acaoInvalidar] = useActionState<EstadoTreino, FormData>(
    acaoInvalidarCheckin,
    undefined,
  )
  const [observacao, acaoObservacao] = useActionState<EstadoTreino, FormData>(
    acaoAtualizarObservacaoTecnica,
    undefined,
  )
  const [abrindo, setAbrindo] = useState(false)
  const erro = lancar?.erro ?? invalidar?.erro ?? observacao?.erro
  const rotulo = ROTULO_STATUS_LINHA[status]

  return (
    <tr className="border-b border-border last:border-0 align-top">
      <td className="p-4 font-medium" data-label="Aluno">
        {nome}
      </td>
      <td className="p-4" data-label="Situação">
        <Badge variant={rotulo.variant}>{rotulo.texto}</Badge>
      </td>
      <td className="p-4" data-label="Ação">
        {somenteLeitura ? (
          <div className="space-y-2">
            {observacoesTecnicas ? (
              <p className="max-w-md text-sm text-muted-foreground">{observacoesTecnicas}</p>
            ) : (
              <span className="text-sm text-muted-foreground">Somente leitura</span>
            )}
          </div>
        ) : status === "PRESENTE" && checkinId ? (
          abrindo ? (
            <form action={acaoInvalidar} className="flex flex-wrap items-center gap-2">
              <input type="hidden" name="checkinId" value={checkinId} />
              <input type="hidden" name="aulaId" value={aulaId} />
              <Input
                name="justificativa"
                placeholder="Justificativa"
                required
                minLength={3}
                className="h-9 w-full sm:w-48"
              />
              <label className="flex h-9 items-center gap-2 rounded-md border border-border px-3 text-xs text-muted-foreground">
                <input type="checkbox" name="excluir" className="accent-destructive" />
                Excluir
              </label>
              <BotaoEnviar size="sm" variant="destructive">
                Confirmar
              </BotaoEnviar>
            </form>
          ) : (
            <button
              type="button"
              onClick={() => setAbrindo(true)}
              className="inline-flex items-center gap-1.5 text-sm font-medium text-destructive hover:underline"
            >
              <RotateCcw className="size-4" /> Invalidar
            </button>
          )
        ) : (
          <form action={acaoLancar} className="grid gap-2">
            <input type="hidden" name="aulaId" value={aulaId} />
            <input type="hidden" name="alunoId" value={alunoId} />
            <Input
              name="justificativa"
              placeholder="Justificativa se retroativo"
              className="h-9 w-full sm:w-56"
            />
            <div>
              <BotaoEnviar size="sm" variant="outline">
                <Check className="size-4" /> Lançar check-in
              </BotaoEnviar>
            </div>
          </form>
        )}
        <form action={acaoObservacao} className="mt-3 grid gap-2">
          <input type="hidden" name="aulaId" value={aulaId} />
          <input type="hidden" name="alunoId" value={alunoId} />
          <Textarea
            name="observacoesTecnicas"
            defaultValue={observacoesTecnicas ?? ""}
            placeholder="Observações técnicas"
            className="min-h-16 text-xs"
            maxLength={2000}
          />
          <div className="flex items-center gap-2">
            <BotaoEnviar size="sm" variant="secondary">
              Salvar observação
            </BotaoEnviar>
            {observacao?.ok && <span className="text-xs text-success">Salvo.</span>}
          </div>
        </form>
        {erro && <p className="mt-1 text-xs text-destructive">{erro}</p>}
      </td>
    </tr>
  )
}

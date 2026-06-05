"use client"

import { useActionState, useEffect } from "react"
import { acaoAtualizarStatusProfessor, type EstadoForm } from "@/app/actions/cadastros"
import { BotaoEnviar } from "@/components/ui/botao-enviar"
import { Label } from "@/components/ui/label"
import { Select } from "@/components/ui/select"

export function FormStatusProfessor({
  professorId,
  ativo,
  aoConcluir,
}: {
  professorId: string
  ativo: boolean
  aoConcluir?: () => void
}) {
  const [estado, acao] = useActionState<EstadoForm, FormData>(
    acaoAtualizarStatusProfessor,
    undefined,
  )

  useEffect(() => {
    if (estado?.ok) aoConcluir?.()
  }, [estado?.ok, aoConcluir])

  return (
    <form action={acao} className="space-y-4">
      <input type="hidden" name="professorId" value={professorId} />
      <div className="space-y-1.5">
        <Label htmlFor="ativo-professor">Situação</Label>
        <Select id="ativo-professor" name="ativo" defaultValue={ativo ? "true" : "false"}>
          <option value="true">Ativo</option>
          <option value="false">Inativo</option>
        </Select>
      </div>
      {estado?.erro && <p className="text-sm text-destructive">{estado.erro}</p>}
      <div className="flex justify-end">
        <BotaoEnviar>Salvar</BotaoEnviar>
      </div>
    </form>
  )
}

"use client"

import { useActionState, useEffect, useRef } from "react"
import { acaoCriarDocumentoAluno, type EstadoForm } from "@/app/actions/cadastros"
import { BotaoEnviar } from "@/components/ui/botao-enviar"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

export function FormDocumentoAluno({
  aluno,
  aoConcluir,
}: {
  aluno: { id: string; nome: string }
  aoConcluir?: () => void
}) {
  const [estado, acao] = useActionState<EstadoForm, FormData>(acaoCriarDocumentoAluno, undefined)
  const ref = useRef<HTMLFormElement>(null)

  useEffect(() => {
    if (estado?.ok) {
      ref.current?.reset()
      aoConcluir?.()
    }
  }, [estado?.ok, aoConcluir])

  return (
    <form ref={ref} action={acao} className="grid gap-4 sm:grid-cols-2">
      <input type="hidden" name="alunoId" value={aluno.id} />
      <div className="space-y-1.5">
        <Label htmlFor="documentoTitulo">Título</Label>
        <Input id="documentoTitulo" name="titulo" required />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="documentoCategoria">Categoria</Label>
        <Input
          id="documentoCategoria"
          name="categoria"
          placeholder="Contrato, atestado, autorização"
        />
      </div>
      <div className="space-y-1.5 sm:col-span-2">
        <Label htmlFor="documentoUrl">URL do documento</Label>
        <Input id="documentoUrl" name="url" type="url" placeholder="https://..." required />
      </div>
      <div className="space-y-1.5 sm:col-span-2">
        <Label htmlFor="documentoObservacao">Observação</Label>
        <Input id="documentoObservacao" name="observacao" />
      </div>
      {estado?.erro && <p className="text-sm text-destructive sm:col-span-2">{estado.erro}</p>}
      <div className="flex justify-end sm:col-span-2">
        <BotaoEnviar>Anexar documento</BotaoEnviar>
      </div>
    </form>
  )
}

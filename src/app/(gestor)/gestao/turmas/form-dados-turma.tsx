"use client"

import { useActionState, useEffect } from "react"
import { acaoAtualizarDadosTurma, type EstadoForm } from "@/app/actions/cadastros"
import { BotaoEnviar } from "@/components/ui/botao-enviar"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select } from "@/components/ui/select"

type OpcaoProfessor = { id: string; nome: string }
type TurmaDados = {
  id: string
  rotulo: string
  nome: string | null
  professorId: string | null
  capacidade: number
  local: string | null
  nivel: string | null
  ativa: boolean
}

export function FormDadosTurma({
  turma,
  professores,
  aoConcluir,
}: {
  turma: TurmaDados
  professores: OpcaoProfessor[]
  aoConcluir?: () => void
}) {
  const [estado, acao] = useActionState<EstadoForm, FormData>(acaoAtualizarDadosTurma, undefined)

  useEffect(() => {
    if (estado?.ok) aoConcluir?.()
  }, [estado?.ok, aoConcluir])

  return (
    <form action={acao} className="grid gap-4 sm:grid-cols-3">
      <input type="hidden" name="turmaId" value={turma.id} />
      <div className="space-y-1.5">
        <Label htmlFor="nome-turma">Nome</Label>
        <Input id="nome-turma" name="nome" defaultValue={turma?.nome ?? ""} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="professorId-turma">Professor</Label>
        <Select id="professorId-turma" name="professorId" defaultValue={turma?.professorId ?? ""}>
          <option value="">Sem professor fixo</option>
          {professores.map((professor) => (
            <option key={professor.id} value={professor.id}>
              {professor.nome}
            </option>
          ))}
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="ativa-turma">Status</Label>
        <Select id="ativa-turma" name="ativa" defaultValue={turma?.ativa ? "true" : "false"}>
          <option value="true">Ativa</option>
          <option value="false">Inativa</option>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="capacidade-turma">Capacidade</Label>
        <Input
          id="capacidade-turma"
          name="capacidade"
          type="number"
          min={0}
          defaultValue={turma?.capacidade ?? 0}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="local-turma">Local</Label>
        <Input id="local-turma" name="local" defaultValue={turma?.local ?? ""} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="nivel-turma">Nível</Label>
        <Input id="nivel-turma" name="nivel" defaultValue={turma?.nivel ?? ""} />
      </div>

      <div className="flex items-center gap-3 sm:col-span-3">
        <BotaoEnviar>Salvar turma</BotaoEnviar>
        {estado?.erro && <p className="text-sm text-destructive">{estado.erro}</p>}
      </div>
    </form>
  )
}

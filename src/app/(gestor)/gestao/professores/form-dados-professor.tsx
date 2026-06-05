"use client"

import { useActionState, useEffect } from "react"
import { acaoAtualizarDadosProfessor, type EstadoForm } from "@/app/actions/cadastros"
import { BotaoEnviar } from "@/components/ui/botao-enviar"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"

type Modalidade = { id: string; nome: string }

type ProfessorParaEdicao = {
  id: string
  nome: string
  cpf: string | null
  telefone: string | null
  fotoUrl: string | null
  observacoes: string | null
  modalidades: string[]
}

export function FormDadosProfessor({
  modalidades,
  professor,
  aoConcluir,
}: {
  modalidades: Modalidade[]
  professor: ProfessorParaEdicao
  aoConcluir?: () => void
}) {
  const [estado, acao] = useActionState<EstadoForm, FormData>(
    acaoAtualizarDadosProfessor,
    undefined,
  )
  const modalidadeIds = new Set(professor.modalidades)

  useEffect(() => {
    if (estado?.ok) aoConcluir?.()
  }, [estado?.ok, aoConcluir])

  return (
    <form action={acao} className="grid gap-4 sm:grid-cols-2">
      <input type="hidden" name="professorId" value={professor.id} />
      <div className="space-y-1.5">
        <Label htmlFor="nome-professor">Nome</Label>
        <Input id="nome-professor" name="nome" defaultValue={professor?.nome ?? ""} required />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="cpf-professor">CPF</Label>
        <Input id="cpf-professor" name="cpf" defaultValue={professor?.cpf ?? ""} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="telefone-professor">Telefone</Label>
        <Input id="telefone-professor" name="telefone" defaultValue={professor?.telefone ?? ""} />
      </div>
      <div className="space-y-1.5 sm:col-span-2">
        <Label htmlFor="fotoUrl-professor">URL da foto</Label>
        <Input
          id="fotoUrl-professor"
          name="fotoUrl"
          type="url"
          defaultValue={professor?.fotoUrl ?? ""}
        />
      </div>

      <div className="space-y-1.5 sm:col-span-2">
        <Label>Modalidades</Label>
        <div className="flex flex-wrap gap-2">
          {modalidades.map((m) => (
            <label
              key={m.id}
              className="flex cursor-pointer items-center gap-2 rounded-md border border-input px-3 py-2 text-sm has-[:checked]:border-primary has-[:checked]:bg-accent"
            >
              <input
                type="checkbox"
                name="modalidadeIds"
                value={m.id}
                defaultChecked={modalidadeIds.has(m.id)}
              />
              {m.nome}
            </label>
          ))}
          {modalidades.length === 0 && (
            <p className="text-sm text-muted-foreground">
              Cadastre uma modalidade antes de editar professores.
            </p>
          )}
        </div>
      </div>

      <div className="space-y-1.5 sm:col-span-2">
        <Label htmlFor="observacoes-professor">Observações</Label>
        <Textarea
          id="observacoes-professor"
          name="observacoes"
          defaultValue={professor?.observacoes ?? ""}
        />
      </div>

      <div className="flex items-center gap-3 sm:col-span-2">
        <BotaoEnviar>Salvar professor</BotaoEnviar>
        {estado?.erro && <p className="text-sm text-destructive">{estado.erro}</p>}
      </div>
    </form>
  )
}

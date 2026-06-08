"use client"

import { useActionState, useEffect } from "react"
import { acaoAtualizarDadosTurma, type EstadoForm } from "@/app/actions/cadastros"
import { BotaoEnviar } from "@/components/ui/botao-enviar"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select } from "@/components/ui/select"
import { DIAS_SEMANA } from "@/lib/utils/datas"

type OpcaoProfessor = { id: string; nome: string }
type OpcaoModalidade = { id: string; nome: string }
type TurmaDados = {
  id: string
  rotulo: string
  modalidadeId: string
  nome: string | null
  professorId: string | null
  diasSemana: number[]
  horaInicio: string | null
  horaFim: string | null
  capacidade: number
  local: string | null
  nivel: string | null
  ativa: boolean
}

export function FormDadosTurma({
  turma,
  modalidades,
  professores,
  aoConcluir,
}: {
  turma: TurmaDados
  modalidades: OpcaoModalidade[]
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
        <Label htmlFor="modalidadeId-turma">Modalidade</Label>
        <Select
          id="modalidadeId-turma"
          name="modalidadeId"
          required
          defaultValue={turma.modalidadeId}
        >
          {modalidades.map((modalidade) => (
            <option key={modalidade.id} value={modalidade.id}>
              {modalidade.nome}
            </option>
          ))}
        </Select>
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
      <fieldset className="space-y-2 sm:col-span-3">
        <legend className="text-sm font-medium leading-none text-foreground">Dias da semana</legend>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {DIAS_SEMANA.map((dia, i) => (
            <Label
              key={dia}
              className="flex h-10 cursor-pointer items-center gap-2 rounded-md border border-input bg-card px-3 py-2 text-sm shadow-sm transition-colors hover:bg-muted/50"
            >
              <input
                type="checkbox"
                name="diasSemana"
                value={i}
                defaultChecked={turma.diasSemana.includes(i)}
                className="size-4 accent-primary"
              />
              {dia}
            </Label>
          ))}
        </div>
      </fieldset>
      <div className="space-y-1.5">
        <Label htmlFor="horaInicio-turma">Início</Label>
        <Input
          id="horaInicio-turma"
          name="horaInicio"
          type="time"
          defaultValue={turma.horaInicio ?? ""}
          required
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="horaFim-turma">Fim</Label>
        <Input
          id="horaFim-turma"
          name="horaFim"
          type="time"
          defaultValue={turma.horaFim ?? ""}
          required
        />
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

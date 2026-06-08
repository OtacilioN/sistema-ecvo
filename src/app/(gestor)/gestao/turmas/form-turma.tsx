"use client"

import { useActionState, useEffect, useRef } from "react"
import { acaoCriarTurma, type EstadoForm } from "@/app/actions/cadastros"
import { BotaoEnviar } from "@/components/ui/botao-enviar"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select } from "@/components/ui/select"
import { DIAS_SEMANA } from "@/lib/utils/datas"

export function FormTurma({
  modalidades,
  professores,
  aoConcluir,
}: {
  modalidades: { id: string; nome: string }[]
  professores: { id: string; nome: string }[]
  aoConcluir?: () => void
}) {
  const [estado, acao] = useActionState<EstadoForm, FormData>(acaoCriarTurma, undefined)
  const ref = useRef<HTMLFormElement>(null)

  useEffect(() => {
    if (estado?.ok) {
      ref.current?.reset()
      aoConcluir?.()
    }
  }, [estado?.ok, aoConcluir])

  return (
    <form ref={ref} action={acao} className="grid gap-4 sm:grid-cols-3">
      <div className="space-y-1.5">
        <Label htmlFor="nome">Nome</Label>
        <Input id="nome" name="nome" placeholder="Kickboxing 20h" />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="modalidadeId">Modalidade</Label>
        <Select id="modalidadeId" name="modalidadeId" required defaultValue="">
          <option value="" disabled>
            Selecione…
          </option>
          {modalidades.map((m) => (
            <option key={m.id} value={m.id}>
              {m.nome}
            </option>
          ))}
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="professorId">Professor</Label>
        <Select id="professorId" name="professorId" defaultValue="">
          <option value="">Sem professor fixo</option>
          {professores.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nome}
            </option>
          ))}
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
                defaultChecked={i === 1}
                className="size-4 accent-primary"
              />
              {dia}
            </Label>
          ))}
        </div>
      </fieldset>
      <div className="space-y-1.5">
        <Label htmlFor="horaInicio">Início</Label>
        <Input id="horaInicio" name="horaInicio" type="time" defaultValue="19:00" required />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="horaFim">Fim</Label>
        <Input id="horaFim" name="horaFim" type="time" defaultValue="20:30" required />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="capacidade">Capacidade (0 = ilimitada)</Label>
        <Input id="capacidade" name="capacidade" type="number" min={0} defaultValue={0} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="local">Local</Label>
        <Input id="local" name="local" placeholder="Tatame 1" />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="nivel">Nível</Label>
        <Input id="nivel" name="nivel" placeholder="Todos os níveis" />
      </div>
      <div className="flex items-center gap-3 sm:col-span-3">
        <BotaoEnviar>Criar grade e gerar aulas</BotaoEnviar>
        {estado?.erro && <p className="text-sm text-destructive">{estado.erro}</p>}
      </div>
    </form>
  )
}

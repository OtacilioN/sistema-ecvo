"use client"

import { CalendarPlus, UserRoundCheck, XCircle } from "lucide-react"
import { useActionState, useEffect, useRef } from "react"
import {
  acaoCancelarAula,
  acaoCriarEvento,
  acaoDefinirProfessorAula,
  type EstadoTurma,
} from "@/app/actions/turmas"
import { BotaoEnviar } from "@/components/ui/botao-enviar"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select } from "@/components/ui/select"

type Opcao = { id: string; nome: string }

export function FormEvento({
  modalidades,
  professores,
  aoConcluir,
}: {
  modalidades: Opcao[]
  professores: Opcao[]
  aoConcluir?: () => void
}) {
  const [estado, acao] = useActionState<EstadoTurma, FormData>(acaoCriarEvento, undefined)
  const ref = useRef<HTMLFormElement>(null)

  useEffect(() => {
    if (estado?.ok) {
      ref.current?.reset()
      aoConcluir?.()
    }
  }, [estado?.ok, aoConcluir])

  return (
    <form ref={ref} action={acao} className="grid gap-4 sm:grid-cols-2">
      <CampoTexto id="nome" rotulo="Nome" placeholder="Aulão, seminário, open mat" />
      <SelectCampo id="modalidadeId" rotulo="Modalidade" opcoes={modalidades} />
      <SelectCampo
        id="professorId"
        rotulo="Professor"
        opcoes={professores}
        opcional="Sem professor"
      />
      <CampoTexto id="capacidade" rotulo="Capacidade" tipo="number" min={0} valorPadrao="0" />
      <CampoTexto id="inicio" rotulo="Início" tipo="datetime-local" />
      <CampoTexto id="fim" rotulo="Fim" tipo="datetime-local" />
      <CampoTexto id="local" rotulo="Local" placeholder="Tatame 1" />
      <Mensagem estado={estado} />
      <div className="flex justify-end sm:col-span-2">
        <BotaoEnviar>
          <CalendarPlus className="size-4" /> Criar aula
        </BotaoEnviar>
      </div>
    </form>
  )
}

export function FormProfessorAula({
  aulaId,
  professores,
  aoConcluir,
}: {
  aulaId: string
  professores: Opcao[]
  aoConcluir?: () => void
}) {
  const [estado, acao] = useActionState<EstadoTurma, FormData>(acaoDefinirProfessorAula, undefined)

  useEffect(() => {
    if (estado?.ok) aoConcluir?.()
  }, [estado?.ok, aoConcluir])

  return (
    <form action={acao} className="space-y-4">
      <input type="hidden" name="aulaId" value={aulaId} />
      <SelectCampo
        id="professorId"
        rotulo="Professor"
        opcoes={professores}
        opcional="Sem professor"
      />
      <CampoTexto id="justificativa" rotulo="Justificativa" placeholder="Substituição autorizada" />
      <Mensagem estado={estado} />
      <div className="flex justify-end">
        <BotaoEnviar>
          <UserRoundCheck className="size-4" /> Atualizar professor
        </BotaoEnviar>
      </div>
    </form>
  )
}

export function FormCancelarAula({
  aulaId,
  aoConcluir,
}: {
  aulaId: string
  aoConcluir?: () => void
}) {
  const [estado, acao] = useActionState<EstadoTurma, FormData>(acaoCancelarAula, undefined)

  useEffect(() => {
    if (estado?.ok) aoConcluir?.()
  }, [estado?.ok, aoConcluir])

  return (
    <form action={acao} className="space-y-4">
      <input type="hidden" name="aulaId" value={aulaId} />
      <CampoTexto
        id="justificativa"
        rotulo="Justificativa"
        placeholder="Motivo do cancelamento"
        obrigatorio
      />
      <p className="text-sm text-muted-foreground">
        Os alunos com agendamento marcado serão notificados do cancelamento.
      </p>
      <Mensagem estado={estado} />
      <div className="flex justify-end">
        <BotaoEnviar variant="destructive">
          <XCircle className="size-4" /> Cancelar aula
        </BotaoEnviar>
      </div>
    </form>
  )
}

function SelectCampo({
  id,
  rotulo,
  opcoes,
  opcional,
}: {
  id: string
  rotulo: string
  opcoes: Opcao[]
  opcional?: string
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{rotulo}</Label>
      <Select id={id} name={id} required={!opcional} defaultValue="">
        <option value="">{opcional ?? "Selecione"}</option>
        {opcoes.map((opcao) => (
          <option key={opcao.id} value={opcao.id}>
            {opcao.nome}
          </option>
        ))}
      </Select>
    </div>
  )
}

function CampoTexto({
  id,
  rotulo,
  tipo = "text",
  placeholder,
  min,
  valorPadrao,
  obrigatorio,
}: {
  id: string
  rotulo: string
  tipo?: string
  placeholder?: string
  min?: number
  valorPadrao?: string
  obrigatorio?: boolean
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{rotulo}</Label>
      <Input
        id={id}
        name={id}
        type={tipo}
        min={min}
        defaultValue={valorPadrao}
        placeholder={placeholder}
        required={obrigatorio ?? (!valorPadrao && id !== "local" && id !== "justificativa")}
      />
    </div>
  )
}

function Mensagem({ estado }: { estado: EstadoTurma }) {
  if (estado?.erro) return <p className="text-sm text-destructive sm:col-span-2">{estado.erro}</p>
  return null
}

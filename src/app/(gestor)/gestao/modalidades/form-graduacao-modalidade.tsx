"use client"

import { Award } from "lucide-react"
import { useActionState, useEffect, useRef } from "react"
import { acaoCriarGraduacaoModalidade, type EstadoForm } from "@/app/actions/cadastros"
import { BotaoEnviar } from "@/components/ui/botao-enviar"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

type ModalidadeOpcao = { id: string; nome: string }

export function FormGraduacaoModalidade({
  modalidade,
  aoConcluir,
}: {
  modalidade: ModalidadeOpcao
  aoConcluir?: () => void
}) {
  const [estado, acao] = useActionState<EstadoForm, FormData>(
    acaoCriarGraduacaoModalidade,
    undefined,
  )
  const ref = useRef<HTMLFormElement>(null)

  useEffect(() => {
    if (estado?.ok) {
      ref.current?.reset()
      aoConcluir?.()
    }
  }, [estado?.ok, aoConcluir])

  return (
    <form ref={ref} action={acao} className="grid gap-4 sm:grid-cols-2">
      <input type="hidden" name="modalidadeId" value={modalidade.id} />
      <div className="space-y-1.5">
        <Label htmlFor="nomeGraduacao">Nome</Label>
        <Input id="nomeGraduacao" name="nome" placeholder="Faixa azul" required />
      </div>
      <CampoNumero id="ordem" rotulo="Ordem" padrao={0} />
      <CampoNumero id="minHoras" rotulo="Horas mín." />
      <CampoNumero id="minFrequencia" rotulo="Freq. mín. (%)" />
      <CampoNumero id="minTempoNoGrauDias" rotulo="Dias no grau" />
      {estado?.erro && <p className="text-sm text-destructive sm:col-span-2">{estado.erro}</p>}
      <div className="flex justify-end sm:col-span-2">
        <BotaoEnviar>
          <Award className="size-4" /> Cadastrar graduação
        </BotaoEnviar>
      </div>
    </form>
  )
}

function CampoNumero({ id, rotulo, padrao }: { id: string; rotulo: string; padrao?: number }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{rotulo}</Label>
      <Input id={id} name={id} type="number" min={0} defaultValue={padrao} />
    </div>
  )
}

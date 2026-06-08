"use client"

import { CalendarPlus } from "lucide-react"
import { useActionState, useEffect, useRef } from "react"
import { acaoCriarExame, type EstadoGraduacao } from "@/app/actions/graduacoes"
import { BotaoEnviar } from "@/components/ui/botao-enviar"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"

type ModalidadeOpcao = { id: string; nome: string }

export function FormExame({
  modalidades,
  aoConcluir,
}: {
  modalidades: ModalidadeOpcao[]
  aoConcluir?: () => void
}) {
  const [estado, acao] = useActionState<EstadoGraduacao, FormData>(acaoCriarExame, undefined)
  const ref = useRef<HTMLFormElement>(null)

  useEffect(() => {
    if (estado?.ok) {
      ref.current?.reset()
      aoConcluir?.()
    }
  }, [estado?.ok, aoConcluir])

  return (
    <form ref={ref} action={acao} className="grid gap-4 sm:grid-cols-2">
      <div className="space-y-1.5">
        <Label htmlFor="modalidadeId">Modalidade</Label>
        <Select id="modalidadeId" name="modalidadeId" required>
          <option value="">Selecione</option>
          {modalidades.map((modalidade) => (
            <option key={modalidade.id} value={modalidade.id}>
              {modalidade.nome}
            </option>
          ))}
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="data">Data</Label>
        <Input id="data" name="data" type="datetime-local" required />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="taxa">Taxa</Label>
        <Input id="taxa" name="taxa" type="number" min={0} step="0.01" placeholder="0,00" />
      </div>
      <div className="space-y-1.5 sm:col-span-2">
        <Label htmlFor="descricao">Descrição</Label>
        <Textarea id="descricao" name="descricao" placeholder="Banca, critérios e observações" />
      </div>
      <div className="flex items-center gap-3 sm:col-span-2">
        <BotaoEnviar variant="outline">
          <CalendarPlus className="size-4" /> Criar exame
        </BotaoEnviar>
        {estado?.erro && <p className="text-sm text-destructive">{estado.erro}</p>}
      </div>
    </form>
  )
}

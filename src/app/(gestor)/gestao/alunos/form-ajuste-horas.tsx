"use client"

import { ClockPlus } from "lucide-react"
import { useActionState, useEffect, useRef } from "react"
import { acaoAjustarHorasManual, type EstadoHoras } from "@/app/actions/horas"
import { BotaoEnviar } from "@/components/ui/botao-enviar"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select } from "@/components/ui/select"

type Opcao = { id: string; nome: string }

export function FormAjusteHoras({
  aluno,
  modalidades,
  aoConcluir,
}: {
  aluno: Opcao
  modalidades: Opcao[]
  aoConcluir?: () => void
}) {
  const [estado, acao] = useActionState<EstadoHoras, FormData>(acaoAjustarHorasManual, undefined)
  const ref = useRef<HTMLFormElement>(null)

  useEffect(() => {
    if (estado?.ok) {
      ref.current?.reset()
      aoConcluir?.()
    }
  }, [estado?.ok, aoConcluir])

  return (
    <form ref={ref} action={acao} className="space-y-4">
      <input type="hidden" name="alunoId" value={aluno.id} />
      <div className="space-y-1.5">
        <Label htmlFor="ajusteModalidadeId">Modalidade</Label>
        <Select id="ajusteModalidadeId" name="modalidadeId" required>
          <option value="">Selecione</option>
          {modalidades.map((modalidade) => (
            <option key={modalidade.id} value={modalidade.id}>
              {modalidade.nome}
            </option>
          ))}
        </Select>
      </div>
      <div className="grid gap-4 sm:grid-cols-[150px_1fr]">
        <div className="space-y-1.5">
          <Label htmlFor="minutos">Minutos</Label>
          <Input
            id="minutos"
            name="minutos"
            type="number"
            step={1}
            placeholder="-30 ou 60"
            required
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="motivo">Motivo</Label>
          <Input id="motivo" name="motivo" placeholder="Correção auditada" required />
        </div>
      </div>
      {estado?.erro && <p className="text-sm text-destructive">{estado.erro}</p>}
      <div className="flex justify-end">
        <BotaoEnviar>
          <ClockPlus className="size-4" /> Registrar ajuste
        </BotaoEnviar>
      </div>
    </form>
  )
}

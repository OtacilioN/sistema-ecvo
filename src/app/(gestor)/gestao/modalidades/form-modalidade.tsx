"use client"

import { useActionState, useEffect, useRef } from "react"
import { acaoCriarModalidade, type EstadoForm } from "@/app/actions/cadastros"
import { BotaoEnviar } from "@/components/ui/botao-enviar"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { CamposGraduacoesModalidade } from "./campos-graduacoes-modalidade"

export function FormModalidade({ aoConcluir }: { aoConcluir?: () => void }) {
  const [estado, acao] = useActionState<EstadoForm, FormData>(acaoCriarModalidade, undefined)
  const ref = useRef<HTMLFormElement>(null)

  useEffect(() => {
    if (estado?.ok) {
      ref.current?.reset()
      aoConcluir?.()
    }
  }, [estado?.ok, aoConcluir])

  return (
    <form ref={ref} action={acao} className="grid gap-4 sm:grid-cols-3">
      <div className="space-y-1.5 sm:col-span-1">
        <Label htmlFor="nome">Nome</Label>
        <Input id="nome" name="nome" placeholder="Jiu-jitsu" required />
      </div>
      <div className="space-y-1.5 sm:col-span-1">
        <Label htmlFor="duracaoPadraoMin">Duração padrão (min)</Label>
        <Input
          id="duracaoPadraoMin"
          name="duracaoPadraoMin"
          type="number"
          defaultValue={60}
          min={15}
          max={480}
          required
        />
      </div>
      <div className="space-y-1.5 sm:col-span-1">
        <Label htmlFor="descricao">Descrição</Label>
        <Textarea id="descricao" name="descricao" className="min-h-10" rows={1} />
      </div>

      <div className="sm:col-span-3">
        <CamposGraduacoesModalidade />
      </div>

      <div className="flex items-center gap-3 sm:col-span-3">
        <BotaoEnviar>Cadastrar</BotaoEnviar>
        {estado?.erro && <p className="text-sm text-destructive">{estado.erro}</p>}
      </div>
    </form>
  )
}

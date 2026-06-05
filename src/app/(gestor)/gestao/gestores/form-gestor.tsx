"use client"

import { ShieldPlus } from "lucide-react"
import { useActionState, useEffect, useRef } from "react"
import { acaoCriarGestor, type EstadoForm } from "@/app/actions/cadastros"
import { BotaoEnviar } from "@/components/ui/botao-enviar"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

export function FormGestor({ aoConcluir }: { aoConcluir?: () => void }) {
  const [estado, acao] = useActionState<EstadoForm, FormData>(acaoCriarGestor, undefined)
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
        <Label htmlFor="nome">Nome</Label>
        <Input id="nome" name="nome" required />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="email">E-mail (login)</Label>
        <Input id="email" name="email" type="email" required />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="senha">Senha inicial</Label>
        <Input id="senha" name="senha" type="text" minLength={6} required />
      </div>
      {estado?.erro && <p className="text-sm text-destructive sm:col-span-2">{estado.erro}</p>}
      <div className="flex justify-end sm:col-span-2">
        <BotaoEnviar>
          <ShieldPlus className="size-4" /> Cadastrar gestor
        </BotaoEnviar>
      </div>
    </form>
  )
}

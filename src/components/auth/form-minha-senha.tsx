"use client"

import { KeyRound } from "lucide-react"
import { useActionState, useEffect, useId, useRef } from "react"
import { acaoAlterarMinhaSenha, type EstadoSenha } from "@/app/actions/auth"
import { BotaoEnviar } from "@/components/ui/botao-enviar"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

export function FormMinhaSenha() {
  const [estado, acao] = useActionState<EstadoSenha, FormData>(acaoAlterarMinhaSenha, undefined)
  const ref = useRef<HTMLFormElement>(null)
  const id = useId()

  useEffect(() => {
    if (estado?.ok) ref.current?.reset()
  }, [estado?.ok])

  return (
    <form ref={ref} action={acao} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor={`${id}-senha-atual`}>Senha atual</Label>
        <Input
          id={`${id}-senha-atual`}
          name="senhaAtual"
          type="password"
          autoComplete="current-password"
          required
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor={`${id}-nova-senha`}>Nova senha</Label>
          <Input
            id={`${id}-nova-senha`}
            name="novaSenha"
            type="password"
            autoComplete="new-password"
            minLength={6}
            required
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`${id}-confirmar-senha`}>Confirmar senha</Label>
          <Input
            id={`${id}-confirmar-senha`}
            name="confirmarSenha"
            type="password"
            autoComplete="new-password"
            minLength={6}
            required
          />
        </div>
      </div>
      {estado?.erro && <p className="text-sm text-destructive">{estado.erro}</p>}
      {estado?.ok && <p className="text-sm text-success">Senha alterada.</p>}
      <div className="flex justify-end">
        <BotaoEnviar>
          <KeyRound className="size-4" /> Alterar senha
        </BotaoEnviar>
      </div>
    </form>
  )
}

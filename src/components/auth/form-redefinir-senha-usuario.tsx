"use client"

import { KeyRound } from "lucide-react"
import { useActionState, useEffect, useId, useRef } from "react"
import { acaoRedefinirSenhaUsuario, type EstadoSenha } from "@/app/actions/auth"
import { BotaoEnviar } from "@/components/ui/botao-enviar"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

type UsuarioSenha = {
  id: string
  nome: string
  email: string
}

export function FormRedefinirSenhaUsuario({
  usuario,
  aoConcluir,
}: {
  usuario: UsuarioSenha
  aoConcluir?: () => void
}) {
  const [estado, acao] = useActionState<EstadoSenha, FormData>(acaoRedefinirSenhaUsuario, undefined)
  const ref = useRef<HTMLFormElement>(null)
  const id = useId()

  useEffect(() => {
    if (estado?.ok) {
      ref.current?.reset()
      aoConcluir?.()
    }
  }, [estado?.ok, aoConcluir])

  return (
    <form ref={ref} action={acao} className="space-y-4">
      <input type="hidden" name="usuarioId" value={usuario.id} />
      <div className="rounded-md border border-border bg-muted/40 p-3 text-sm">
        <span className="font-medium">{usuario.nome}</span>
        <span className="block text-xs text-muted-foreground">{usuario.email}</span>
      </div>
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
      {estado?.erro && <p className="text-sm text-destructive">{estado.erro}</p>}
      <div className="flex justify-end">
        <BotaoEnviar>
          <KeyRound className="size-4" /> Salvar senha
        </BotaoEnviar>
      </div>
    </form>
  )
}

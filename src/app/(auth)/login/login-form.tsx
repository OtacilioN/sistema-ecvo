"use client"

import { type KeyboardEvent, useActionState } from "react"
import { entrar } from "@/app/actions/auth"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

export function LoginForm({ mensagemInicial }: { mensagemInicial?: string }) {
  const [estado, formAction, pending] = useActionState(entrar, undefined)

  function aoTeclar(evento: KeyboardEvent<HTMLFormElement>) {
    if (evento.key !== "Enter" || evento.nativeEvent.isComposing || pending) {
      return
    }

    if (!(evento.target instanceof HTMLInputElement)) {
      return
    }

    evento.preventDefault()
    evento.currentTarget.requestSubmit()
  }

  return (
    <form action={formAction} className="flex flex-col gap-4" onKeyDown={aoTeclar}>
      <div className="flex flex-col gap-2">
        <Label htmlFor="email">E-mail</Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          placeholder="voce@exemplo.com"
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="senha">Senha</Label>
        <Input
          id="senha"
          name="senha"
          type="password"
          autoComplete="current-password"
          required
          placeholder="••••••••"
        />
      </div>

      {(estado?.erro || mensagemInicial) && (
        <p className="text-sm text-destructive" role="alert">
          {estado?.erro ?? mensagemInicial}
        </p>
      )}

      <Button type="submit" size="lg" disabled={pending} className="mt-2">
        {pending ? "Entrando…" : "Entrar"}
      </Button>
    </form>
  )
}

"use client"

import { useActionState } from "react"
import { entrar } from "@/app/actions/auth"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

export function LoginForm() {
  const [estado, formAction, pending] = useActionState(entrar, undefined)

  return (
    <form action={formAction} className="flex flex-col gap-4">
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

      {estado?.erro && (
        <p className="text-sm text-destructive" role="alert">
          {estado.erro}
        </p>
      )}

      <Button type="submit" size="lg" disabled={pending} className="mt-2">
        {pending ? "Entrando…" : "Entrar"}
      </Button>
    </form>
  )
}

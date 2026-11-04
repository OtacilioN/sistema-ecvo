"use client"

import { useActionState } from "react"
import { solicitarRecuperacao } from "@/app/actions/recuperar-senha"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

export function EsqueciSenhaForm() {
  const [estado, formAction, pending] = useActionState(solicitarRecuperacao, undefined)

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
      {estado?.erro && (
        <p className="text-sm text-destructive" role="alert">
          {estado.erro}
        </p>
      )}
      {estado?.mensagem && (
        <p className="text-sm" role="status">
          {estado.mensagem}
        </p>
      )}
      <Button type="submit" size="lg" disabled={pending}>
        {pending ? "Enviando…" : "Enviar instruções"}
      </Button>
    </form>
  )
}

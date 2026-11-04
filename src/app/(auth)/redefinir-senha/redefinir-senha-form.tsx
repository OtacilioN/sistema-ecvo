"use client"

import Link from "next/link"
import { useActionState } from "react"
import { redefinirSenha } from "@/app/actions/recuperar-senha"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

export function RedefinirSenhaForm({ token }: { token: string }) {
  const [estado, formAction, pending] = useActionState(redefinirSenha, undefined)

  if (estado?.sucesso) {
    return (
      <div className="flex flex-col gap-4">
        <p className="text-sm" role="status">
          {estado.mensagem ?? "Senha redefinida com sucesso."}
        </p>
        <Button asChild size="lg">
          <Link href="/login">Entrar</Link>
        </Button>
      </div>
    )
  }

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="token" value={token} />
      <div className="flex flex-col gap-2">
        <Label htmlFor="senha">Nova senha</Label>
        <Input
          id="senha"
          name="senha"
          type="password"
          autoComplete="new-password"
          minLength={6}
          required
        />
        <p className="text-xs text-muted-foreground">Use pelo menos 6 caracteres.</p>
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="confirmarSenha">Confirme a nova senha</Label>
        <Input
          id="confirmarSenha"
          name="confirmarSenha"
          type="password"
          autoComplete="new-password"
          minLength={6}
          required
        />
      </div>
      {estado?.erro && (
        <p className="text-sm text-destructive" role="alert">
          {estado.erro}
        </p>
      )}
      <Button type="submit" size="lg" disabled={pending}>
        {pending ? "Salvando…" : "Redefinir senha"}
      </Button>
    </form>
  )
}

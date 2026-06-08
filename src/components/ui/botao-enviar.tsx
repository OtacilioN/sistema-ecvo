"use client"

import { useFormStatus } from "react-dom"
import { Button, type ButtonProps } from "@/components/ui/button"

/** Botão de submit que reflete o estado pendente do formulário (Server Actions). */
export function BotaoEnviar({ children, ...props }: ButtonProps) {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" {...props} disabled={pending || props.disabled}>
      {pending ? "Aguarde…" : children}
    </Button>
  )
}

"use client"

import { useActionState, useEffect, useRef } from "react"
import { acaoCriarProfessor, type EstadoForm } from "@/app/actions/cadastros"
import { SeletorModalidades } from "@/components/seletor-modalidades"
import { BotaoEnviar } from "@/components/ui/botao-enviar"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"

export function FormProfessor({
  modalidades,
  aoConcluir,
}: {
  modalidades: { id: string; nome: string }[]
  aoConcluir?: () => void
}) {
  const [estado, acao] = useActionState<EstadoForm, FormData>(acaoCriarProfessor, undefined)
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
        <Label htmlFor="telefone">Telefone</Label>
        <Input id="telefone" name="telefone" placeholder="(11) 90000-0000" />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="cpf">CPF</Label>
        <Input id="cpf" name="cpf" inputMode="numeric" placeholder="000.000.000-00" />
      </div>
      <div className="space-y-1.5 sm:col-span-2">
        <Label htmlFor="fotoUrl">URL da foto</Label>
        <Input id="fotoUrl" name="fotoUrl" type="url" placeholder="https://..." />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="email">E-mail (login)</Label>
        <Input id="email" name="email" type="email" required />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="senha">Senha inicial</Label>
        <Input id="senha" name="senha" type="text" minLength={6} required />
      </div>
      <div className="sm:col-span-2">
        <SeletorModalidades modalidades={modalidades} />
      </div>
      <div className="space-y-1.5 sm:col-span-2">
        <Label htmlFor="observacoes">Observações</Label>
        <Textarea id="observacoes" name="observacoes" />
      </div>
      <div className="flex items-center gap-3 sm:col-span-2">
        <BotaoEnviar>Cadastrar professor</BotaoEnviar>
        {estado?.erro && <p className="text-sm text-destructive">{estado.erro}</p>}
      </div>
    </form>
  )
}

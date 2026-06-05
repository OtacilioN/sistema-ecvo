"use client"

import { TriangleAlert } from "lucide-react"
import { useActionState, useEffect } from "react"
import type { EstadoForm } from "@/app/actions/cadastros"
import { BotaoEnviar } from "@/components/ui/botao-enviar"
import { Button } from "@/components/ui/button"
import { Dialog } from "@/components/ui/dialog"

type Acao = (estadoAnterior: EstadoForm, formData: FormData) => EstadoForm | Promise<EstadoForm>

/**
 * Diálogo de confirmação para ações destrutivas (ex.: exclusão).
 * Posta para uma Server Action com os `campos` ocultos informados e
 * fecha automaticamente quando a ação retorna `ok`.
 */
export function DialogoConfirmacao({
  aberto,
  aoFechar,
  titulo,
  descricao,
  acao,
  campos,
  rotuloConfirmar = "Excluir",
}: {
  aberto: boolean
  aoFechar: () => void
  titulo: string
  descricao: React.ReactNode
  acao: Acao
  campos: Record<string, string>
  rotuloConfirmar?: string
}) {
  const [estado, formAction] = useActionState<EstadoForm, FormData>(acao, undefined)

  useEffect(() => {
    if (estado?.ok) aoFechar()
  }, [estado?.ok, aoFechar])

  return (
    <Dialog aberto={aberto} aoFechar={aoFechar} variante="centro" titulo={titulo}>
      <form action={formAction} className="space-y-5">
        {Object.entries(campos).map(([nome, valor]) => (
          <input key={nome} type="hidden" name={nome} value={valor} />
        ))}
        <div className="flex gap-3">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-destructive/10 text-destructive">
            <TriangleAlert className="size-5" />
          </div>
          <div className="space-y-1 text-sm text-muted-foreground">{descricao}</div>
        </div>
        {estado?.erro && <p className="text-sm text-destructive">{estado.erro}</p>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={aoFechar}>
            Cancelar
          </Button>
          <BotaoEnviar variant="destructive">{rotuloConfirmar}</BotaoEnviar>
        </div>
      </form>
    </Dialog>
  )
}

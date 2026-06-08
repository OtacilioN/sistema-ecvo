"use client"

import type { Papel } from "@prisma/client"
import { ImagePlus } from "lucide-react"
import { useActionState, useEffect, useState } from "react"
import {
  acaoAtualizarFotoUsuario,
  acaoAtualizarMinhaFoto,
  type EstadoFoto,
} from "@/app/actions/auth"
import { CampoUploadFoto } from "@/components/campo-upload-foto"
import { BotaoEnviar } from "@/components/ui/botao-enviar"

type UsuarioFoto = {
  id: string
  nome: string
  papel?: Papel
  fotoUrl: string | null
}

export function FormMinhaFoto({ usuario }: { usuario: UsuarioFoto }) {
  return <FormFotoUsuarioBase usuario={usuario} modo="propria" />
}

export function FormFotoUsuarioGestor({
  usuario,
  aoConcluir,
}: {
  usuario: UsuarioFoto
  aoConcluir?: () => void
}) {
  return <FormFotoUsuarioBase usuario={usuario} modo="gestor" aoConcluir={aoConcluir} />
}

function FormFotoUsuarioBase({
  usuario,
  modo,
  aoConcluir,
}: {
  usuario: UsuarioFoto
  modo: "propria" | "gestor"
  aoConcluir?: () => void
}) {
  const action = modo === "gestor" ? acaoAtualizarFotoUsuario : acaoAtualizarMinhaFoto
  const [estado, acao] = useActionState<EstadoFoto, FormData>(action, undefined)
  const [uploadPendente, setUploadPendente] = useState(false)

  useEffect(() => {
    if (estado?.ok) aoConcluir?.()
  }, [estado?.ok, aoConcluir])

  return (
    <form action={acao} className="space-y-4">
      {modo === "gestor" && <input type="hidden" name="usuarioId" value={usuario.id} />}
      <CampoUploadFoto
        id={`foto-${usuario.id}`}
        entidade="usuarios"
        registroId={usuario.id}
        valorInicial={usuario.fotoUrl}
        onPendenteChange={setUploadPendente}
      />
      {estado?.erro && <p className="text-sm text-destructive">{estado.erro}</p>}
      {estado?.ok && <p className="text-sm text-success">Foto salva.</p>}
      <div className="flex justify-end">
        <BotaoEnviar disabled={uploadPendente}>
          <ImagePlus className="size-4" /> Salvar foto
        </BotaoEnviar>
      </div>
    </form>
  )
}

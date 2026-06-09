"use client"

import { Plus } from "lucide-react"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Dialog } from "@/components/ui/dialog"
import { FormGestor } from "./form-gestor"

export function BotaoNovoGestor() {
  const [aberto, setAberto] = useState(false)
  return (
    <>
      <Button onClick={() => setAberto(true)}>
        <Plus className="size-4" /> Novo acesso
      </Button>
      <Dialog
        aberto={aberto}
        aoFechar={() => setAberto(false)}
        variante="lateral"
        titulo="Novo acesso"
        descricao="Gestor ou Secretaria com acesso administrativo."
      >
        <FormGestor aoConcluir={() => setAberto(false)} />
      </Dialog>
    </>
  )
}

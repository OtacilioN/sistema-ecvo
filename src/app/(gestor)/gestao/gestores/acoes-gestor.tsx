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
        <Plus className="size-4" /> Novo gestor
      </Button>
      <Dialog
        aberto={aberto}
        aoFechar={() => setAberto(false)}
        variante="lateral"
        titulo="Novo gestor"
        descricao="Acesso administrativo à academia e à auditoria."
      >
        <FormGestor aoConcluir={() => setAberto(false)} />
      </Dialog>
    </>
  )
}

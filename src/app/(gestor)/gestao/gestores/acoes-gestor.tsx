"use client"

import { ImagePlus, KeyRound, Plus } from "lucide-react"
import { useState } from "react"
import { FormRedefinirSenhaUsuario } from "@/components/auth/form-redefinir-senha-usuario"
import { Button } from "@/components/ui/button"
import { Dialog } from "@/components/ui/dialog"
import { ItemMenu, MenuAcoes } from "@/components/ui/menu-acoes"
import { FormFotoUsuarioGestor } from "@/components/usuarios/form-foto-usuario"
import { FormGestor } from "./form-gestor"

export type GestorLinha = {
  id: string
  nome: string
  email: string
  fotoUrl: string | null
}

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

type Painel = "foto" | "senha" | null

export function AcoesGestor({ gestor }: { gestor: GestorLinha }) {
  const [painel, setPainel] = useState<Painel>(null)
  const fechar = () => setPainel(null)

  return (
    <>
      <MenuAcoes rotulo={`Ações de ${gestor.nome}`}>
        {(fecharMenu) => (
          <>
            <ItemMenu
              icone={ImagePlus}
              onClick={() => {
                fecharMenu()
                setPainel("foto")
              }}
            >
              Alterar foto
            </ItemMenu>
            <ItemMenu
              icone={KeyRound}
              onClick={() => {
                fecharMenu()
                setPainel("senha")
              }}
            >
              Redefinir senha
            </ItemMenu>
          </>
        )}
      </MenuAcoes>

      <Dialog
        aberto={painel === "foto"}
        aoFechar={fechar}
        variante="centro"
        titulo="Alterar foto"
        descricao={gestor.nome}
      >
        <FormFotoUsuarioGestor
          usuario={{ id: gestor.id, nome: gestor.nome, fotoUrl: gestor.fotoUrl }}
          aoConcluir={fechar}
        />
      </Dialog>

      <Dialog
        aberto={painel === "senha"}
        aoFechar={fechar}
        variante="centro"
        titulo="Redefinir senha"
        descricao={gestor.nome}
      >
        <FormRedefinirSenhaUsuario
          usuario={{ id: gestor.id, nome: gestor.nome, email: gestor.email }}
          aoConcluir={fechar}
        />
      </Dialog>
    </>
  )
}

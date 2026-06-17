"use client"

import { ImagePlus, KeyRound, Pencil, Plus, ToggleLeft, Trash2 } from "lucide-react"
import { useState } from "react"
import { acaoExcluirProfessor } from "@/app/actions/cadastros"
import { FormRedefinirSenhaUsuario } from "@/components/auth/form-redefinir-senha-usuario"
import { Button } from "@/components/ui/button"
import { Dialog } from "@/components/ui/dialog"
import { DialogoConfirmacao } from "@/components/ui/dialogo-confirmacao"
import { ItemMenu, MenuAcoes, SeparadorMenu } from "@/components/ui/menu-acoes"
import { FormFotoUsuarioGestor } from "@/components/usuarios/form-foto-usuario"
import { FormDadosProfessor } from "./form-dados-professor"
import { FormProfessor } from "./form-professor"
import { FormStatusProfessor } from "./form-status-professor"

type Modalidade = { id: string; nome: string }

export type ProfessorLinha = {
  id: string
  usuarioId: string
  nome: string
  email: string
  ativo: boolean
  cpf: string | null
  telefone: string | null
  dataNascimento: Date | null
  fotoUrl: string | null
  observacoes: string | null
  modalidades: string[]
}

export function BotaoNovoProfessor({ modalidades }: { modalidades: Modalidade[] }) {
  const [aberto, setAberto] = useState(false)
  return (
    <>
      <Button onClick={() => setAberto(true)}>
        <Plus className="size-4" /> Novo professor
      </Button>
      <Dialog
        aberto={aberto}
        aoFechar={() => setAberto(false)}
        variante="lateral"
        titulo="Novo professor"
        descricao="Equipe técnica e modalidades habilitadas."
      >
        <FormProfessor modalidades={modalidades} aoConcluir={() => setAberto(false)} />
      </Dialog>
    </>
  )
}

type Painel = "editar" | "foto" | "senha" | "situacao" | "excluir" | null

export function AcoesProfessor({
  professor,
  modalidades,
}: {
  professor: ProfessorLinha
  modalidades: Modalidade[]
}) {
  const [painel, setPainel] = useState<Painel>(null)
  const fechar = () => setPainel(null)

  return (
    <>
      <MenuAcoes rotulo={`Ações de ${professor.nome}`}>
        {(fecharMenu) => (
          <>
            <ItemMenu
              icone={Pencil}
              onClick={() => {
                fecharMenu()
                setPainel("editar")
              }}
            >
              Editar dados
            </ItemMenu>
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
            <SeparadorMenu />
            <ItemMenu
              icone={ToggleLeft}
              onClick={() => {
                fecharMenu()
                setPainel("situacao")
              }}
            >
              Alterar situação
            </ItemMenu>
            <SeparadorMenu />
            <ItemMenu
              icone={Trash2}
              variante="destructive"
              onClick={() => {
                fecharMenu()
                setPainel("excluir")
              }}
            >
              Excluir professor
            </ItemMenu>
          </>
        )}
      </MenuAcoes>

      <Dialog
        aberto={painel === "editar"}
        aoFechar={fechar}
        variante="lateral"
        titulo="Editar professor"
        descricao={professor.nome}
      >
        <FormDadosProfessor professor={professor} modalidades={modalidades} aoConcluir={fechar} />
      </Dialog>

      <Dialog
        aberto={painel === "foto"}
        aoFechar={fechar}
        variante="centro"
        titulo="Alterar foto"
        descricao={professor.nome}
      >
        <FormFotoUsuarioGestor
          usuario={{ id: professor.usuarioId, nome: professor.nome, fotoUrl: professor.fotoUrl }}
          aoConcluir={fechar}
        />
      </Dialog>

      <Dialog
        aberto={painel === "senha"}
        aoFechar={fechar}
        variante="centro"
        titulo="Redefinir senha"
        descricao={professor.nome}
      >
        <FormRedefinirSenhaUsuario
          usuario={{ id: professor.usuarioId, nome: professor.nome, email: professor.email }}
          aoConcluir={fechar}
        />
      </Dialog>

      <Dialog
        aberto={painel === "situacao"}
        aoFechar={fechar}
        variante="centro"
        titulo="Alterar situação"
        descricao={professor.nome}
      >
        <FormStatusProfessor
          professorId={professor.id}
          ativo={professor.ativo}
          aoConcluir={fechar}
        />
      </Dialog>

      <DialogoConfirmacao
        aberto={painel === "excluir"}
        aoFechar={fechar}
        titulo="Excluir professor"
        acao={acaoExcluirProfessor}
        campos={{ professorId: professor.id }}
        descricao={
          <>
            <p>
              Tem certeza que deseja excluir{" "}
              <strong className="text-foreground">{professor.nome}</strong>?
            </p>
            <p>Esta ação é irreversível.</p>
          </>
        }
      />
    </>
  )
}

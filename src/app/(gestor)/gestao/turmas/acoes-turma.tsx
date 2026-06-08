"use client"

import { CalendarPlus, ListChecks, Pencil, Plus, UserRoundCheck, XCircle } from "lucide-react"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Dialog } from "@/components/ui/dialog"
import { ItemMenu, ItemMenuLink, MenuAcoes, SeparadorMenu } from "@/components/ui/menu-acoes"
import { FormDadosTurma } from "./form-dados-turma"
import { FormTurma } from "./form-turma"
import { FormCancelarAula, FormEvento, FormProfessorAula } from "./forms-aulas"

type Opcao = { id: string; nome: string }

type TurmaDados = {
  id: string
  rotulo: string
  modalidadeId: string
  nome: string | null
  professorId: string | null
  diasSemana: number[]
  horaInicio: string | null
  horaFim: string | null
  capacidade: number
  local: string | null
  nivel: string | null
  ativa: boolean
}

export function BotaoNovaTurma({
  modalidades,
  professores,
}: {
  modalidades: Opcao[]
  professores: Opcao[]
}) {
  const [aberto, setAberto] = useState(false)
  return (
    <>
      <Button onClick={() => setAberto(true)}>
        <Plus className="size-4" /> Nova turma
      </Button>
      <Dialog
        aberto={aberto}
        aoFechar={() => setAberto(false)}
        variante="lateral"
        titulo="Nova turma recorrente"
        descricao="Cria a grade e gera as aulas das próximas 8 semanas."
      >
        <FormTurma
          modalidades={modalidades}
          professores={professores}
          aoConcluir={() => setAberto(false)}
        />
      </Dialog>
    </>
  )
}

export function BotaoAulaAvulsa({
  modalidades,
  professores,
}: {
  modalidades: Opcao[]
  professores: Opcao[]
}) {
  const [aberto, setAberto] = useState(false)
  return (
    <>
      <Button variant="outline" onClick={() => setAberto(true)}>
        <CalendarPlus className="size-4" /> Aula avulsa
      </Button>
      <Dialog
        aberto={aberto}
        aoFechar={() => setAberto(false)}
        variante="lateral"
        titulo="Aula avulsa"
        descricao="Aulão, seminário ou open mat fora da grade."
      >
        <FormEvento
          modalidades={modalidades}
          professores={professores}
          aoConcluir={() => setAberto(false)}
        />
      </Dialog>
    </>
  )
}

export function AcoesTurma({
  turma,
  modalidades,
  professores,
}: {
  turma: TurmaDados
  modalidades: Opcao[]
  professores: Opcao[]
}) {
  const [editar, setEditar] = useState(false)
  return (
    <>
      <MenuAcoes rotulo={`Ações da turma ${turma.nome ?? turma.rotulo}`}>
        {(fecharMenu) => (
          <ItemMenu
            icone={Pencil}
            onClick={() => {
              fecharMenu()
              setEditar(true)
            }}
          >
            Editar turma
          </ItemMenu>
        )}
      </MenuAcoes>
      <Dialog
        aberto={editar}
        aoFechar={() => setEditar(false)}
        variante="lateral"
        titulo="Editar turma"
        descricao={turma.nome ?? turma.rotulo}
      >
        <FormDadosTurma
          turma={turma}
          modalidades={modalidades}
          professores={professores}
          aoConcluir={() => setEditar(false)}
        />
      </Dialog>
    </>
  )
}

type PainelAula = "professor" | "cancelar" | null

export function AcoesAula({
  aulaId,
  rotulo,
  cancelada,
  professores,
}: {
  aulaId: string
  rotulo: string
  cancelada: boolean
  professores: Opcao[]
}) {
  const [painel, setPainel] = useState<PainelAula>(null)
  const fechar = () => setPainel(null)

  return (
    <>
      <MenuAcoes rotulo={`Ações da aula ${rotulo}`}>
        {(fecharMenu) => (
          <>
            <ItemMenuLink
              href={`/gestao/turmas/aula/${aulaId}`}
              icone={ListChecks}
              onClick={fecharMenu}
            >
              Abrir lista
            </ItemMenuLink>
            {!cancelada && (
              <>
                <ItemMenu
                  icone={UserRoundCheck}
                  onClick={() => {
                    fecharMenu()
                    setPainel("professor")
                  }}
                >
                  Professor substituto
                </ItemMenu>
                <SeparadorMenu />
                <ItemMenu
                  icone={XCircle}
                  variante="destructive"
                  onClick={() => {
                    fecharMenu()
                    setPainel("cancelar")
                  }}
                >
                  Cancelar aula
                </ItemMenu>
              </>
            )}
          </>
        )}
      </MenuAcoes>

      <Dialog
        aberto={painel === "professor"}
        aoFechar={fechar}
        variante="centro"
        titulo="Professor substituto"
        descricao={rotulo}
      >
        <FormProfessorAula aulaId={aulaId} professores={professores} aoConcluir={fechar} />
      </Dialog>

      <Dialog
        aberto={painel === "cancelar"}
        aoFechar={fechar}
        variante="centro"
        titulo="Cancelar aula"
        descricao={rotulo}
      >
        <FormCancelarAula aulaId={aulaId} aoConcluir={fechar} />
      </Dialog>
    </>
  )
}

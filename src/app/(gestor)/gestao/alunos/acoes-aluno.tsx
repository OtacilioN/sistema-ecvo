"use client"

import { ClockPlus, FileText, Pencil, Plus, Trash2 } from "lucide-react"
import { useState } from "react"
import { acaoExcluirAluno } from "@/app/actions/cadastros"
import { Button } from "@/components/ui/button"
import { Dialog } from "@/components/ui/dialog"
import { DialogoConfirmacao } from "@/components/ui/dialogo-confirmacao"
import { ItemMenu, MenuAcoes, SeparadorMenu } from "@/components/ui/menu-acoes"
import { FormAjusteHoras } from "./form-ajuste-horas"
import { FormAluno } from "./form-aluno"
import { FormDadosAluno } from "./form-dados-aluno"
import { FormDocumentoAluno } from "./form-documento-aluno"

type Modalidade = { id: string; nome: string }

type TipoAluno = "MENSALISTA" | "WELLHUB" | "TOTALPASS" | "AVULSO"
type StatusAluno = "ATIVO" | "INATIVO" | "SUSPENSO" | "CANCELADO" | "INADIMPLENTE" | "TRANCADO"

export type AlunoLinha = {
  id: string
  nome: string
  tipo: TipoAluno
  status: StatusAluno
  cpf: string | null
  telefone: string | null
  fotoUrl: string | null
  dataNascimento: Date | null
  dataInicio: Date | null
  endereco: string | null
  contatoEmergencia: string | null
  restricoesMedicas: string | null
  observacoesTecnicas: string | null
  observacoesAdmin: string | null
  idExterno: string | null
  modalidades: string[]
}

/** Botão primário de cabeçalho que abre o painel de cadastro de aluno. */
export function BotaoNovoAluno({ modalidades }: { modalidades: Modalidade[] }) {
  const [aberto, setAberto] = useState(false)
  return (
    <>
      <Button onClick={() => setAberto(true)}>
        <Plus className="size-4" /> Novo aluno
      </Button>
      <Dialog
        aberto={aberto}
        aoFechar={() => setAberto(false)}
        variante="lateral"
        titulo="Novo aluno"
        descricao="Cadastro de aluno."
      >
        <FormAluno modalidades={modalidades} aoConcluir={() => setAberto(false)} />
      </Dialog>
    </>
  )
}

type Painel = "editar" | "horas" | "documento" | "excluir" | null

/** Menu de ações por linha da tabela de alunos. */
export function AcoesAluno({
  aluno,
  modalidades,
}: {
  aluno: AlunoLinha
  modalidades: Modalidade[]
}) {
  const [painel, setPainel] = useState<Painel>(null)
  const fechar = () => setPainel(null)

  return (
    <>
      <MenuAcoes rotulo={`Ações de ${aluno.nome}`}>
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
              icone={ClockPlus}
              onClick={() => {
                fecharMenu()
                setPainel("horas")
              }}
            >
              Ajustar horas
            </ItemMenu>
            <ItemMenu
              icone={FileText}
              onClick={() => {
                fecharMenu()
                setPainel("documento")
              }}
            >
              Anexar documento
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
              Excluir aluno
            </ItemMenu>
          </>
        )}
      </MenuAcoes>

      <Dialog
        aberto={painel === "editar"}
        aoFechar={fechar}
        variante="lateral"
        titulo="Editar aluno"
        descricao={aluno.nome}
      >
        <FormDadosAluno aluno={aluno} modalidades={modalidades} aoConcluir={fechar} />
      </Dialog>

      <Dialog
        aberto={painel === "horas"}
        aoFechar={fechar}
        variante="centro"
        titulo="Ajustar horas"
        descricao={`Lançamento manual auditado para ${aluno.nome}.`}
      >
        <FormAjusteHoras
          aluno={{ id: aluno.id, nome: aluno.nome }}
          modalidades={modalidades}
          aoConcluir={fechar}
        />
      </Dialog>

      <Dialog
        aberto={painel === "documento"}
        aoFechar={fechar}
        variante="centro"
        titulo="Anexar documento"
        descricao={aluno.nome}
      >
        <FormDocumentoAluno aluno={{ id: aluno.id, nome: aluno.nome }} aoConcluir={fechar} />
      </Dialog>

      <DialogoConfirmacao
        aberto={painel === "excluir"}
        aoFechar={fechar}
        titulo="Excluir aluno"
        acao={acaoExcluirAluno}
        campos={{ alunoId: aluno.id }}
        descricao={
          <>
            <p>
              Tem certeza que deseja excluir{" "}
              <strong className="text-foreground">{aluno.nome}</strong>?
            </p>
            <p>Esta ação é irreversível.</p>
          </>
        }
      />
    </>
  )
}

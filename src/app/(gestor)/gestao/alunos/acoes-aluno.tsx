"use client"

import { ClockPlus, FileText, Pencil, Plus, Trash2, WalletCards } from "lucide-react"
import { useState } from "react"
import { acaoExcluirAluno } from "@/app/actions/cadastros"
import { Button } from "@/components/ui/button"
import { Dialog } from "@/components/ui/dialog"
import { DialogoConfirmacao } from "@/components/ui/dialogo-confirmacao"
import { ItemMenu, MenuAcoes, SeparadorMenu } from "@/components/ui/menu-acoes"
import { FormBaixaMensalidadeAluno } from "../financeiro/forms-financeiro"
import { FormAjusteHoras } from "./form-ajuste-horas"
import { FormAluno } from "./form-aluno"
import { FormDadosAluno } from "./form-dados-aluno"
import { FormDocumentoAluno } from "./form-documento-aluno"

type Modalidade = { id: string; nome: string }
type Plano = {
  id: string
  nome: string
  valor: number
  periodicidade: string
  ativo: boolean
}

type TipoAluno = "MENSALISTA" | "WELLHUB" | "TOTALPASS" | "AVULSO"
type StatusAluno = "ATIVO" | "INATIVO" | "SUSPENSO" | "CANCELADO" | "INADIMPLENTE" | "TRANCADO"

type ResponsavelAluno = {
  nome: string
  cpf: string | null
  telefone: string | null
  email: string | null
  grauParentesco: string | null
  responsavelFinanceiro: boolean
} | null

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
  planoId: string | null
  planoNome: string | null
  planoValor: number | null
  diaVencimento: number
  modalidades: string[]
  responsavel: ResponsavelAluno
}

/** Botão primário de cabeçalho que abre o painel de cadastro de aluno. */
export function BotaoNovoAluno({
  modalidades,
  planos,
}: {
  modalidades: Modalidade[]
  planos: Plano[]
}) {
  const [aberto, setAberto] = useState(false)
  return (
    <>
      <Button type="button" onClick={() => setAberto(true)}>
        <Plus className="size-4" /> Novo aluno
      </Button>
      <Dialog
        aberto={aberto}
        aoFechar={() => setAberto(false)}
        variante="lateral"
        titulo="Novo aluno"
        descricao="Cadastro de aluno."
      >
        <FormAluno modalidades={modalidades} planos={planos} aoConcluir={() => setAberto(false)} />
      </Dialog>
    </>
  )
}

type Painel = "editar" | "horas" | "pagamento" | "documento" | "excluir" | null

/** Menu de ações por linha da tabela de alunos. */
export function AcoesAluno({
  aluno,
  modalidades,
  planos,
  competenciaAtual,
  podeAdministrar,
}: {
  aluno: AlunoLinha
  modalidades: Modalidade[]
  planos: Plano[]
  competenciaAtual: string
  podeAdministrar: boolean
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
            {podeAdministrar && (
              <>
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
                  icone={WalletCards}
                  disabled={!aluno.planoId}
                  title={!aluno.planoId ? "Aluno sem plano de pagamento" : undefined}
                  onClick={() => {
                    fecharMenu()
                    setPainel("pagamento")
                  }}
                >
                  Dar baixa
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
        <FormDadosAluno
          aluno={aluno}
          modalidades={modalidades}
          planos={planos}
          aoConcluir={fechar}
        />
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
        aberto={painel === "pagamento"}
        aoFechar={fechar}
        variante="lateral"
        titulo="Dar baixa"
        descricao={aluno.nome}
      >
        <FormBaixaMensalidadeAluno
          aluno={{
            id: aluno.id,
            nome: aluno.nome,
            planoNome: aluno.planoNome,
            planoValor: aluno.planoValor,
            diaVencimento: aluno.diaVencimento,
          }}
          competenciaAtual={competenciaAtual}
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

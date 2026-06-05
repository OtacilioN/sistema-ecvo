"use client"

import { CreditCard, FilePlus, LinkIcon, WalletCards } from "lucide-react"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Dialog } from "@/components/ui/dialog"
import { ItemMenu, MenuAcoes } from "@/components/ui/menu-acoes"
import {
  FormBaixarMensalidade,
  FormGerarMensalidade,
  FormPagamentoAvulso,
  FormPlano,
  FormStatusMensalidade,
  FormVinculoPlano,
} from "./forms-financeiro"

type AlunoOpcao = { id: string; nome: string; detalhe: string }
type PlanoOpcao = { id: string; nome: string }
type ModalidadeOpcao = { id: string; nome: string }
type StatusMensalidade = "EM_ABERTO" | "PAGA" | "VENCIDA" | "CANCELADA" | "ISENTA"

/** Ações primárias do cabeçalho da tela Financeiro. */
export function AcoesFinanceiro({
  modalidades,
  planos,
  alunos,
  alunosComPlano,
  competenciaAtual,
}: {
  modalidades: ModalidadeOpcao[]
  planos: PlanoOpcao[]
  alunos: AlunoOpcao[]
  alunosComPlano: AlunoOpcao[]
  competenciaAtual: string
}) {
  const [painel, setPainel] = useState<"mensalidade" | "pagamento" | "plano" | "vinculo" | null>(
    null,
  )
  const fechar = () => setPainel(null)

  return (
    <>
      <Button variant="outline" onClick={() => setPainel("plano")}>
        <FilePlus className="size-4" /> Novo plano
      </Button>
      <Button variant="outline" onClick={() => setPainel("vinculo")}>
        <LinkIcon className="size-4" /> Vincular plano
      </Button>
      <Button variant="outline" onClick={() => setPainel("pagamento")}>
        <WalletCards className="size-4" /> Pagamento avulso
      </Button>
      <Button onClick={() => setPainel("mensalidade")}>
        <CreditCard className="size-4" /> Gerar mensalidade
      </Button>

      <Dialog
        aberto={painel === "plano"}
        aoFechar={fechar}
        variante="lateral"
        titulo="Novo plano"
        descricao="Plano de mensalidade e modalidades incluídas."
      >
        <FormPlano modalidades={modalidades} aoConcluir={fechar} />
      </Dialog>

      <Dialog
        aberto={painel === "vinculo"}
        aoFechar={fechar}
        variante="centro"
        titulo="Vincular plano"
        descricao="Associa mensalidade interna sem trocar vínculo externo."
      >
        <FormVinculoPlano alunos={alunos} planos={planos} aoConcluir={fechar} />
      </Dialog>

      <Dialog
        aberto={painel === "pagamento"}
        aoFechar={fechar}
        variante="lateral"
        titulo="Pagamento avulso"
        descricao="Aula única, diária, pacote, exame ou produto."
      >
        <FormPagamentoAvulso alunos={alunos} aoConcluir={fechar} />
      </Dialog>

      <Dialog
        aberto={painel === "mensalidade"}
        aoFechar={fechar}
        variante="centro"
        titulo="Gerar mensalidade"
        descricao="Cria a cobrança de um aluno com plano na competência."
      >
        <FormGerarMensalidade
          alunos={alunosComPlano}
          competenciaAtual={competenciaAtual}
          aoConcluir={fechar}
        />
      </Dialog>
    </>
  )
}

/** Menu de ações por linha da tabela de mensalidades. */
export function AcoesMensalidade({
  mensalidadeId,
  status,
  formaPagamento,
  observacao,
  quitada,
}: {
  mensalidadeId: string
  status: StatusMensalidade
  formaPagamento: string | null
  observacao: string | null
  quitada: boolean
}) {
  const [painel, setPainel] = useState<"baixar" | "status" | null>(null)
  const fechar = () => setPainel(null)

  return (
    <>
      <MenuAcoes rotulo="Ações da mensalidade">
        {(fecharMenu) => (
          <>
            {!quitada && (
              <ItemMenu
                icone={WalletCards}
                onClick={() => {
                  fecharMenu()
                  setPainel("baixar")
                }}
              >
                Baixar pagamento
              </ItemMenu>
            )}
            <ItemMenu
              icone={CreditCard}
              onClick={() => {
                fecharMenu()
                setPainel("status")
              }}
            >
              Alterar status
            </ItemMenu>
          </>
        )}
      </MenuAcoes>

      <Dialog
        aberto={painel === "baixar"}
        aoFechar={fechar}
        variante="centro"
        titulo="Baixar pagamento"
        descricao="Marca a mensalidade como paga."
      >
        <FormBaixarMensalidade mensalidadeId={mensalidadeId} aoConcluir={fechar} />
      </Dialog>

      <Dialog
        aberto={painel === "status"}
        aoFechar={fechar}
        variante="centro"
        titulo="Alterar status"
        descricao="Atualiza status, forma de pagamento e observação."
      >
        <FormStatusMensalidade
          mensalidadeId={mensalidadeId}
          status={status}
          formaPagamento={formaPagamento}
          observacao={observacao}
          aoConcluir={fechar}
        />
      </Dialog>
    </>
  )
}

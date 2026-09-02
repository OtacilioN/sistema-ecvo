"use client"

import {
  CreditCard,
  FilePlus,
  LinkIcon,
  Pencil,
  Repeat2,
  Trash2,
  WalletCards,
  XCircle,
} from "lucide-react"
import { useState } from "react"
import { acaoCancelarCobrancaAsaas } from "@/app/actions/financeiro"
import { Button } from "@/components/ui/button"
import { Dialog } from "@/components/ui/dialog"
import { DialogoConfirmacao } from "@/components/ui/dialogo-confirmacao"
import { ItemMenu, MenuAcoes } from "@/components/ui/menu-acoes"
import {
  FormBaixarMensalidade,
  FormEditarPlano,
  FormExcluirPlano,
  FormPagamentoAvulso,
  FormPlano,
  FormStatusMensalidade,
  FormTipoCobrancaPix,
  FormVinculoPlano,
  type PlanoEdicao,
} from "./forms-financeiro"

type ModalidadeOpcao = { id: string; nome: string }
type AlunoOpcao = {
  id: string
  nome: string
  detalhe: string
  modalidades: ModalidadeOpcao[]
  modalidadeContratadaIds: string[]
}
type PlanoOpcao = { id: string; nome: string }
type StatusMensalidade = "EM_ABERTO" | "PAGA" | "VENCIDA" | "CANCELADA" | "ISENTA"

/** Ações primárias do cabeçalho da tela Financeiro. */
export function AcoesFinanceiro({
  planos,
  alunos,
}: {
  planos: PlanoOpcao[]
  alunos: AlunoOpcao[]
}) {
  const [painel, setPainel] = useState<"pagamento" | "pix" | "plano" | "vinculo" | null>(null)
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
      <Button variant="outline" onClick={() => setPainel("pix")}>
        <Repeat2 className="size-4" /> Cobrança PIX
      </Button>
      <Dialog
        aberto={painel === "plano"}
        aoFechar={fechar}
        variante="lateral"
        titulo="Novo plano"
        descricao="Plano de mensalidade."
      >
        <FormPlano aoConcluir={fechar} />
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
        aberto={painel === "pix"}
        aoFechar={fechar}
        variante="centro"
        titulo="Configurar cobrança PIX"
        descricao="PIX mensal ou PIX Automático por seis mensalidades."
      >
        <FormTipoCobrancaPix alunos={alunos} aoConcluir={fechar} />
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
  cobrancaAsaas,
}: {
  mensalidadeId: string
  status: StatusMensalidade
  formaPagamento: string | null
  observacao: string | null
  quitada: boolean
  cobrancaAsaas?: {
    id: string
    ativa: boolean
    status: string
    tipo: string
  }
}) {
  const [painel, setPainel] = useState<"baixar" | "status" | "cancelarAsaas" | null>(null)
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
            {cobrancaAsaas?.ativa &&
              cobrancaAsaas.tipo === "PIX_MENSAL" &&
              cobrancaAsaas.status !== "RECEBIDA" && (
                <ItemMenu
                  icone={XCircle}
                  variante="destructive"
                  onClick={() => {
                    fecharMenu()
                    setPainel("cancelarAsaas")
                  }}
                >
                  Cancelar cobrança Asaas
                </ItemMenu>
              )}
          </>
        )}
      </MenuAcoes>

      <Dialog
        aberto={painel === "baixar"}
        aoFechar={fechar}
        variante="centro"
        titulo="Baixar pagamento"
        descricao={
          cobrancaAsaas?.ativa
            ? "Marca a mensalidade como paga e cancela antes a cobrança pendente no Asaas."
            : "Marca a mensalidade como paga."
        }
      >
        <FormBaixarMensalidade mensalidadeId={mensalidadeId} aoConcluir={fechar} />
      </Dialog>

      {cobrancaAsaas && (
        <DialogoConfirmacao
          aberto={painel === "cancelarAsaas"}
          aoFechar={fechar}
          titulo="Cancelar cobrança Asaas"
          descricao={
            <p>
              O sistema consultará o Asaas e só removerá uma cobrança ainda não recebida. Depois
              disso, a baixa manual ficará disponível.
            </p>
          }
          acao={acaoCancelarCobrancaAsaas}
          campos={{ cobrancaId: cobrancaAsaas.id }}
          rotuloConfirmar="Cancelar cobrança"
        />
      )}

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

/** Menu de ações por plano cadastrado. */
export function AcoesPlano({
  plano,
  planos,
  alunosVinculados,
}: {
  plano: PlanoEdicao
  planos: PlanoOpcao[]
  alunosVinculados: number
}) {
  const [painel, setPainel] = useState<"editar" | "excluir" | null>(null)
  const fechar = () => setPainel(null)

  return (
    <>
      <MenuAcoes rotulo="Ações do plano">
        {(fecharMenu) => (
          <>
            <ItemMenu
              icone={Pencil}
              onClick={() => {
                fecharMenu()
                setPainel("editar")
              }}
            >
              Editar plano
            </ItemMenu>
            <ItemMenu
              icone={Trash2}
              variante="destructive"
              onClick={() => {
                fecharMenu()
                setPainel("excluir")
              }}
            >
              Excluir plano
            </ItemMenu>
          </>
        )}
      </MenuAcoes>

      <Dialog
        aberto={painel === "editar"}
        aoFechar={fechar}
        variante="centro"
        titulo="Editar plano"
        descricao={plano.nome}
      >
        <FormEditarPlano plano={plano} aoConcluir={fechar} />
      </Dialog>

      <Dialog
        aberto={painel === "excluir"}
        aoFechar={fechar}
        variante="centro"
        titulo="Excluir plano"
        descricao={plano.nome}
      >
        <FormExcluirPlano
          plano={plano}
          planos={planos}
          alunosVinculados={alunosVinculados}
          aoConcluir={fechar}
        />
      </Dialog>
    </>
  )
}

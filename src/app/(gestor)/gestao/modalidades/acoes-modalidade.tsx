"use client"

import { Award, Plus, ScrollText, SlidersHorizontal, Trash2 } from "lucide-react"
import { useState } from "react"
import { acaoExcluirModalidade } from "@/app/actions/cadastros"
import { Button } from "@/components/ui/button"
import { Dialog } from "@/components/ui/dialog"
import { DialogoConfirmacao } from "@/components/ui/dialogo-confirmacao"
import { ItemMenu, MenuAcoes, SeparadorMenu } from "@/components/ui/menu-acoes"
import { FormDadosModalidade } from "./form-dados-modalidade"
import { FormGraduacaoModalidade } from "./form-graduacao-modalidade"
import { FormModalidade } from "./form-modalidade"
import { FormRegrasModalidade } from "./form-regras-modalidade"

export type ModalidadeLinha = {
  id: string
  nome: string
  descricao: string | null
  duracaoPadraoMin: number
  ativa: boolean
  graduacoes: {
    id: string
    nome: string
    ordem: number
    minHoras: number | null
    minFrequencia: number | null
    minTempoNoGrauDias: number | null
  }[]
  janelaComparecimentoHoras: number | null
  prazoCancelamentoHoras: number | null
  exigirComparecimentoParaCheckin: boolean | null
  politicaCheckinSemComparecimento: "PERMITIR" | "BLOQUEAR" | "APENAS_COM_APROVACAO" | null
  listaEsperaAtiva: boolean | null
}

export function BotaoNovaModalidade() {
  const [aberto, setAberto] = useState(false)
  return (
    <>
      <Button onClick={() => setAberto(true)}>
        <Plus className="size-4" /> Nova modalidade
      </Button>
      <Dialog
        aberto={aberto}
        aoFechar={() => setAberto(false)}
        variante="lateral"
        titulo="Nova modalidade"
        descricao="Modalidades oferecidas pela academia."
      >
        <FormModalidade aoConcluir={() => setAberto(false)} />
      </Dialog>
    </>
  )
}

type Painel = "dados" | "regras" | "graduacao" | "excluir" | null

export function AcoesModalidade({ modalidade }: { modalidade: ModalidadeLinha }) {
  const [painel, setPainel] = useState<Painel>(null)
  const fechar = () => setPainel(null)

  return (
    <>
      <MenuAcoes rotulo={`Ações de ${modalidade.nome}`}>
        {(fecharMenu) => (
          <>
            <ItemMenu
              icone={SlidersHorizontal}
              onClick={() => {
                fecharMenu()
                setPainel("dados")
              }}
            >
              Editar dados
            </ItemMenu>
            <ItemMenu
              icone={ScrollText}
              onClick={() => {
                fecharMenu()
                setPainel("regras")
              }}
            >
              Editar regras
            </ItemMenu>
            <ItemMenu
              icone={Award}
              onClick={() => {
                fecharMenu()
                setPainel("graduacao")
              }}
            >
              Adicionar graduação
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
              Excluir modalidade
            </ItemMenu>
          </>
        )}
      </MenuAcoes>

      <Dialog
        aberto={painel === "dados"}
        aoFechar={fechar}
        variante="lateral"
        titulo="Editar modalidade"
        descricao={modalidade.nome}
      >
        <FormDadosModalidade modalidade={modalidade} aoConcluir={fechar} />
      </Dialog>

      <Dialog
        aberto={painel === "regras"}
        aoFechar={fechar}
        variante="lateral"
        titulo="Regras da modalidade"
        descricao={modalidade.nome}
      >
        <FormRegrasModalidade modalidade={modalidade} aoConcluir={fechar} />
      </Dialog>

      <Dialog
        aberto={painel === "graduacao"}
        aoFechar={fechar}
        variante="centro"
        titulo="Nova graduação"
        descricao={modalidade.nome}
      >
        <FormGraduacaoModalidade
          modalidade={{ id: modalidade.id, nome: modalidade.nome }}
          aoConcluir={fechar}
        />
      </Dialog>

      <DialogoConfirmacao
        aberto={painel === "excluir"}
        aoFechar={fechar}
        titulo="Excluir modalidade"
        acao={acaoExcluirModalidade}
        campos={{ modalidadeId: modalidade.id }}
        descricao={
          <>
            <p>
              Tem certeza que deseja excluir{" "}
              <strong className="text-foreground">{modalidade.nome}</strong>?
            </p>
            <p>Esta ação é irreversível.</p>
          </>
        }
      />
    </>
  )
}

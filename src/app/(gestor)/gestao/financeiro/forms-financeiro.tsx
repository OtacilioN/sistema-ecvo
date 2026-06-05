"use client"

import { CreditCard, FilePlus, LinkIcon, WalletCards } from "lucide-react"
import type * as React from "react"
import { useActionState, useEffect, useRef } from "react"
import {
  acaoAtualizarStatusMensalidade,
  acaoBaixarMensalidade,
  acaoCriarPlano,
  acaoGerarMensalidade,
  acaoPagamentoAvulso,
  acaoVincularPlano,
  type EstadoFinanceiro,
} from "@/app/actions/financeiro"
import { SeletorModalidades } from "@/components/seletor-modalidades"
import { BotaoEnviar } from "@/components/ui/botao-enviar"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select } from "@/components/ui/select"

type AlunoOpcao = { id: string; nome: string; detalhe: string }
type PlanoOpcao = { id: string; nome: string }
type ModalidadeOpcao = { id: string; nome: string }

type StatusMensalidade = "EM_ABERTO" | "PAGA" | "VENCIDA" | "CANCELADA" | "ISENTA"

export function FormPlano({
  modalidades,
  aoConcluir,
}: {
  modalidades: ModalidadeOpcao[]
  aoConcluir?: () => void
}) {
  const [estado, acao] = useActionState<EstadoFinanceiro, FormData>(acaoCriarPlano, undefined)
  const ref = useRef<HTMLFormElement>(null)

  useEffect(() => {
    if (estado?.ok) {
      ref.current?.reset()
      aoConcluir?.()
    }
  }, [estado?.ok, aoConcluir])

  return (
    <form ref={ref} action={acao} className="grid gap-4 sm:grid-cols-2">
      <CampoTexto id="nome" rotulo="Nome" required />
      <CampoTexto id="valor" rotulo="Valor" type="number" min="0" step="0.01" required />
      <div className="space-y-1.5">
        <Label htmlFor="periodicidade">Periodicidade</Label>
        <Select id="periodicidade" name="periodicidade" defaultValue="MENSAL">
          <option value="MENSAL">Mensal</option>
          <option value="TRIMESTRAL">Trimestral</option>
          <option value="SEMESTRAL">Semestral</option>
          <option value="ANUAL">Anual</option>
        </Select>
      </div>
      <CampoTexto
        id="diaVencimento"
        rotulo="Dia de vencimento"
        type="number"
        min="1"
        max="28"
        defaultValue="10"
        required
      />
      <CampoTexto id="limiteAulas" rotulo="Limite de aulas" type="number" min="1" />
      <div className="sm:col-span-2">
        <SeletorModalidades modalidades={modalidades} />
      </div>
      <Erro estado={estado} />
      <div className="flex justify-end sm:col-span-2">
        <BotaoEnviar>
          <FilePlus className="size-4" /> Cadastrar plano
        </BotaoEnviar>
      </div>
    </form>
  )
}

export function FormVinculoPlano({
  alunos,
  planos,
  aoConcluir,
}: {
  alunos: AlunoOpcao[]
  planos: PlanoOpcao[]
  aoConcluir?: () => void
}) {
  const [estado, acao] = useActionState<EstadoFinanceiro, FormData>(acaoVincularPlano, undefined)

  useEffect(() => {
    if (estado?.ok) aoConcluir?.()
  }, [estado?.ok, aoConcluir])

  return (
    <form action={acao} className="space-y-4">
      <SelectCampo id="alunoId" rotulo="Aluno" opcoes={alunos} />
      <SelectCampo
        id="planoId"
        rotulo="Plano"
        opcoes={planos.map((p) => ({ ...p, detalhe: "" }))}
      />
      <Erro estado={estado} />
      <div className="flex justify-end">
        <BotaoEnviar>
          <LinkIcon className="size-4" /> Vincular plano
        </BotaoEnviar>
      </div>
    </form>
  )
}

export function FormGerarMensalidade({
  alunos,
  competenciaAtual,
  aoConcluir,
}: {
  alunos: AlunoOpcao[]
  competenciaAtual: string
  aoConcluir?: () => void
}) {
  const [estado, acao] = useActionState<EstadoFinanceiro, FormData>(acaoGerarMensalidade, undefined)

  useEffect(() => {
    if (estado?.ok) aoConcluir?.()
  }, [estado?.ok, aoConcluir])

  return (
    <form action={acao} className="space-y-4">
      <SelectCampo id="alunoId" rotulo="Aluno" opcoes={alunos} />
      <CampoTexto
        id="competencia"
        rotulo="Competência"
        type="month"
        defaultValue={competenciaAtual}
        required
      />
      <Erro estado={estado} />
      <div className="flex justify-end">
        <BotaoEnviar>
          <CreditCard className="size-4" /> Gerar mensalidade
        </BotaoEnviar>
      </div>
    </form>
  )
}

export function FormBaixarMensalidade({
  mensalidadeId,
  aoConcluir,
}: {
  mensalidadeId: string
  aoConcluir?: () => void
}) {
  const [estado, acao] = useActionState<EstadoFinanceiro, FormData>(
    acaoBaixarMensalidade,
    undefined,
  )

  useEffect(() => {
    if (estado?.ok) aoConcluir?.()
  }, [estado?.ok, aoConcluir])

  return (
    <form action={acao} className="space-y-4">
      <input type="hidden" name="mensalidadeId" value={mensalidadeId} />
      <CampoTexto id="formaPagamento" rotulo="Forma de pagamento" placeholder="Pix, cartão..." />
      <CampoTexto id="observacao" rotulo="Observação" />
      <Erro estado={estado} />
      <div className="flex justify-end">
        <BotaoEnviar>
          <WalletCards className="size-4" /> Baixar pagamento
        </BotaoEnviar>
      </div>
    </form>
  )
}

export function FormPagamentoAvulso({
  alunos,
  aoConcluir,
}: {
  alunos: AlunoOpcao[]
  aoConcluir?: () => void
}) {
  const [estado, acao] = useActionState<EstadoFinanceiro, FormData>(acaoPagamentoAvulso, undefined)
  const ref = useRef<HTMLFormElement>(null)

  useEffect(() => {
    if (estado?.ok) {
      ref.current?.reset()
      aoConcluir?.()
    }
  }, [estado?.ok, aoConcluir])

  return (
    <form ref={ref} action={acao} className="grid gap-4 sm:grid-cols-2">
      <SelectCampo id="alunoId" rotulo="Aluno" opcoes={alunos} opcional />
      <div className="space-y-1.5">
        <Label htmlFor="tipo">Tipo</Label>
        <Select id="tipo" name="tipo" defaultValue="AULA_UNICA">
          <option value="AULA_UNICA">Aula única</option>
          <option value="DIARIA">Diária</option>
          <option value="PACOTE">Pacote</option>
          <option value="SEMINARIO">Seminário</option>
          <option value="EVENTO">Evento</option>
          <option value="EXAME">Exame</option>
          <option value="PRODUTO">Produto</option>
        </Select>
      </div>
      <CampoTexto id="valor" rotulo="Valor" type="number" min="0" step="0.01" required />
      <CampoTexto id="formaPagamento" rotulo="Forma de pagamento" />
      <CampoTexto id="descricao" rotulo="Descrição" className="sm:col-span-2" />
      <Erro estado={estado} />
      <div className="flex justify-end sm:col-span-2">
        <BotaoEnviar>
          <WalletCards className="size-4" /> Registrar pagamento
        </BotaoEnviar>
      </div>
    </form>
  )
}

export function FormStatusMensalidade({
  mensalidadeId,
  status,
  formaPagamento,
  observacao,
  aoConcluir,
}: {
  mensalidadeId: string
  status: StatusMensalidade
  formaPagamento: string | null
  observacao: string | null
  aoConcluir?: () => void
}) {
  const [estado, acao] = useActionState<EstadoFinanceiro, FormData>(
    acaoAtualizarStatusMensalidade,
    undefined,
  )

  useEffect(() => {
    if (estado?.ok) aoConcluir?.()
  }, [estado?.ok, aoConcluir])

  return (
    <form action={acao} className="space-y-4">
      <input type="hidden" name="mensalidadeId" value={mensalidadeId} />
      <div className="space-y-1.5">
        <Label htmlFor="status-mensalidade">Status</Label>
        <Select id="status-mensalidade" name="status" defaultValue={status}>
          <option value="EM_ABERTO">Em aberto</option>
          <option value="PAGA">Paga</option>
          <option value="VENCIDA">Vencida</option>
          <option value="CANCELADA">Cancelada</option>
          <option value="ISENTA">Isenta</option>
        </Select>
      </div>
      <CampoTexto
        id="formaPagamento-mensalidade"
        nome="formaPagamento"
        rotulo="Forma de pagamento"
        defaultValue={formaPagamento ?? ""}
      />
      <CampoTexto
        id="observacao-mensalidade"
        nome="observacao"
        rotulo="Observação"
        defaultValue={observacao ?? ""}
      />
      <Erro estado={estado} />
      <div className="flex justify-end">
        <BotaoEnviar>Salvar status</BotaoEnviar>
      </div>
    </form>
  )
}

function CampoTexto({
  id,
  nome,
  rotulo,
  className,
  ...props
}: {
  id: string
  nome?: string
  rotulo: string
  className?: string
} & React.ComponentProps<typeof Input>) {
  return (
    <div className={`space-y-1.5 ${className ?? ""}`}>
      <Label htmlFor={id}>{rotulo}</Label>
      <Input id={id} name={nome ?? id} {...props} />
    </div>
  )
}

function SelectCampo({
  id,
  rotulo,
  opcoes,
  opcional,
}: {
  id: string
  rotulo: string
  opcoes: { id: string; nome?: string; rotulo?: string; detalhe?: string }[]
  opcional?: boolean
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{rotulo}</Label>
      <Select id={id} name={id} required={!opcional}>
        <option value="">{opcional ? "Sem vínculo" : "Selecione"}</option>
        {opcoes.map((opcao) => (
          <option key={opcao.id} value={opcao.id}>
            {opcao.rotulo ?? opcao.nome}
            {opcao.detalhe ? ` · ${opcao.detalhe}` : ""}
          </option>
        ))}
      </Select>
    </div>
  )
}

function Erro({ estado }: { estado: EstadoFinanceiro }) {
  if (!estado?.erro) return null
  return <p className="text-sm text-destructive sm:col-span-2">{estado.erro}</p>
}

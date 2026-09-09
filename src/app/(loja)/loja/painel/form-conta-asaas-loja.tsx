"use client"

import { CircleDollarSign, ShieldCheck } from "lucide-react"
import { useActionState } from "react"
import {
  acaoConfirmarAprovacaoContaAsaasLoja,
  acaoSolicitarCriacaoContaAsaasLoja,
  type EstadoContaAsaasLoja,
} from "@/app/actions/conta-asaas-loja"
import { Badge } from "@/components/ui/badge"
import { BotaoEnviar } from "@/components/ui/botao-enviar"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

export type ContaLojaView = {
  nomeTitular: string
  emailContaAsaas: string
  cpfCnpj: string
  dataNascimento: string
  celular: string
  rendaMensal: string
  logradouro: string
  numeroEndereco: string
  complemento: string
  bairro: string
  cep: string
  status:
    | "CRIANDO"
    | "RESULTADO_INDETERMINADO"
    | "AGUARDANDO_ATIVACAO"
    | "AGUARDANDO_APROVACAO"
    | "HABILITADA"
    | "BLOQUEADA"
    | "ERRO"
    | "DESABILITADA"
    | null
  walletFinal: string | null
  ultimoErro: string | null
}

const STATUS = {
  CRIANDO: ["Criando conta", "warning"],
  RESULTADO_INDETERMINADO: ["Conciliação necessária", "destructive"],
  AGUARDANDO_ATIVACAO: ["Aguardando ativação", "warning"],
  AGUARDANDO_APROVACAO: ["Em análise pelo Asaas", "warning"],
  HABILITADA: ["Wallet habilitada", "success"],
  BLOQUEADA: ["Conta bloqueada", "destructive"],
  DESABILITADA: ["Conta desabilitada", "outline"],
} as const

export function FormContaAsaasLoja({
  dados,
  ehGestor,
}: {
  dados: ContaLojaView
  ehGestor: boolean
}) {
  if (dados.status && dados.status !== "ERRO") {
    const [rotulo, variant] = STATUS[dados.status]
    return (
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <Badge variant={variant}>{rotulo}</Badge>
          {dados.walletFinal && (
            <span className="font-mono text-xs text-muted-foreground">
              wallet_••••{dados.walletFinal}
            </span>
          )}
        </div>
        <p className="max-w-3xl text-sm text-muted-foreground">{descricaoStatus(dados.status)}</p>
        {ehGestor && ["AGUARDANDO_ATIVACAO", "AGUARDANDO_APROVACAO"].includes(dados.status) && (
          <ConfirmarAprovacao />
        )}
      </div>
    )
  }
  return <Formulario dados={dados} />
}

function descricaoStatus(status: Exclude<ContaLojaView["status"], null | "ERRO">) {
  if (status === "HABILITADA") {
    return "Novas cobranças da loja podem enviar 100% do valor líquido para esta wallet."
  }
  if (status === "AGUARDANDO_ATIVACAO") {
    return "Otacilio deve abrir o e-mail do Asaas, definir a senha e concluir o envio dos documentos."
  }
  if (status === "AGUARDANDO_APROVACAO") {
    return "Os documentos e dados cadastrais estão em análise. Nenhuma cobrança da loja é liberada enquanto isso."
  }
  if (status === "RESULTADO_INDETERMINADO") {
    return "A comunicação foi interrompida. Confira a existência da subconta no Asaas antes de tentar novamente."
  }
  if (status === "BLOQUEADA") {
    return "A wallet não receberá novas vendas até a regularização cadastral no Asaas."
  }
  if (status === "DESABILITADA") return "O split da loja está desabilitado."
  return "A solicitação está em processamento."
}

function ConfirmarAprovacao() {
  const [estado, acao] = useActionState<EstadoContaAsaasLoja, FormData>(
    acaoConfirmarAprovacaoContaAsaasLoja,
    undefined,
  )
  return (
    <form action={acao} className="space-y-3 rounded-md border border-border bg-muted/30 p-4">
      <label className="flex items-start gap-3 text-sm">
        <input
          type="checkbox"
          name="confirmacao"
          value="APROVACAO_ASAAS_CONFIRMADA"
          required
          className="mt-0.5 size-4 accent-primary"
        />
        Confirmo que o status geral desta subconta aparece como aprovado no painel do Asaas.
      </label>
      {estado?.erro && <p className="text-sm text-destructive">{estado.erro}</p>}
      <BotaoEnviar variant="outline">
        <ShieldCheck className="size-4" /> Habilitar após conferência
      </BotaoEnviar>
    </form>
  )
}

function Formulario({ dados }: { dados: ContaLojaView }) {
  const [estado, acao] = useActionState<EstadoContaAsaasLoja, FormData>(
    acaoSolicitarCriacaoContaAsaasLoja,
    undefined,
  )
  return (
    <form action={acao} className="space-y-5">
      <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-4 text-sm">
        Os dados abaixo serão enviados ao Asaas para criar uma subconta de pessoa física. A ECVO
        guarda apenas os identificadores da conta e da wallet; a chave de API retornada não é
        armazenada.
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Campo id="nomeTitular" rotulo="Nome civil completo" className="sm:col-span-2">
          <Input id="nomeTitular" name="nomeTitular" defaultValue={dados.nomeTitular} required />
        </Campo>
        <Campo id="emailContaAsaas" rotulo="E-mail exclusivo no Asaas">
          <Input
            id="emailContaAsaas"
            name="emailContaAsaas"
            type="email"
            defaultValue={dados.emailContaAsaas}
            required
          />
        </Campo>
        <Campo id="cpfCnpj" rotulo="CPF">
          <Input
            id="cpfCnpj"
            name="cpfCnpj"
            defaultValue={dados.cpfCnpj}
            inputMode="numeric"
            placeholder="000.000.000-00"
            required
          />
        </Campo>
        <Campo id="dataNascimento" rotulo="Data de nascimento">
          <Input
            id="dataNascimento"
            name="dataNascimento"
            type="date"
            defaultValue={dados.dataNascimento}
            required
          />
        </Campo>
        <Campo id="celular" rotulo="Celular">
          <Input
            id="celular"
            name="celular"
            defaultValue={dados.celular}
            inputMode="tel"
            required
          />
        </Campo>
        <Campo id="rendaMensal" rotulo="Renda mensal">
          <Input
            id="rendaMensal"
            name="rendaMensal"
            defaultValue={dados.rendaMensal}
            inputMode="decimal"
            placeholder="3.000,00"
            required
          />
        </Campo>
        <Campo id="cep" rotulo="CEP">
          <Input id="cep" name="cep" defaultValue={dados.cep} inputMode="numeric" required />
        </Campo>
        <Campo id="logradouro" rotulo="Logradouro" className="sm:col-span-2">
          <Input id="logradouro" name="logradouro" defaultValue={dados.logradouro} required />
        </Campo>
        <Campo id="numeroEndereco" rotulo="Número">
          <Input
            id="numeroEndereco"
            name="numeroEndereco"
            defaultValue={dados.numeroEndereco}
            required
          />
        </Campo>
        <Campo id="complemento" rotulo="Complemento">
          <Input id="complemento" name="complemento" defaultValue={dados.complemento} />
        </Campo>
        <Campo id="bairro" rotulo="Bairro">
          <Input id="bairro" name="bairro" defaultValue={dados.bairro} required />
        </Campo>
      </div>

      <label className="flex items-start gap-3 rounded-md border border-border p-4 text-sm">
        <input
          type="checkbox"
          name="consentimento"
          required
          className="mt-0.5 size-4 accent-primary"
        />
        <span>
          Confirmo que Otacilio Maia autorizou o envio destes dados ao Asaas e está ciente da
          ativação, análise cadastral e envio de documentos.
        </span>
      </label>
      {(estado?.erro || dados.ultimoErro) && (
        <p className="text-sm text-destructive" aria-live="polite">
          {estado?.erro ?? dados.ultimoErro}
        </p>
      )}
      {estado?.ok && <p className="text-sm text-success">Solicitação enviada ao Asaas.</p>}
      <div className="flex justify-end">
        <BotaoEnviar>
          <CircleDollarSign className="size-4" /> Criar subconta da loja
        </BotaoEnviar>
      </div>
    </form>
  )
}

function Campo({
  id,
  rotulo,
  className,
  children,
}: {
  id: string
  rotulo: string
  className?: string
  children: React.ReactNode
}) {
  return (
    <div className={`space-y-1.5 ${className ?? ""}`}>
      <Label htmlFor={id}>{rotulo}</Label>
      {children}
    </div>
  )
}

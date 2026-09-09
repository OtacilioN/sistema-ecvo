"use client"

import { CircleDollarSign } from "lucide-react"
import type { ReactNode } from "react"
import { useActionState, useCallback, useEffect, useRef, useState } from "react"
import {
  acaoSolicitarCriacaoContaAsaasProfessor,
  type EstadoContaAsaasProfessor,
} from "@/app/actions/conta-asaas-professor"
import { Badge } from "@/components/ui/badge"
import { BotaoEnviar } from "@/components/ui/botao-enviar"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { cpfValido, interpretarBRL } from "@/lib/utils/formato"

export type StatusContaAsaasProfessorView =
  | "RASCUNHO"
  | "CRIANDO"
  | "RESULTADO_INDETERMINADO"
  | "AGUARDANDO_ATIVACAO"
  | "AGUARDANDO_APROVACAO"
  | "HABILITADA"
  | "BLOQUEADA"
  | "ERRO"
  | "DESABILITADA"

export type DadosContaAsaasProfessorView = {
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
  status: StatusContaAsaasProfessorView | null
  walletFinal: string | null
  ultimoErro: string | null
}

const STATUS: Record<
  Exclude<StatusContaAsaasProfessorView, "RASCUNHO" | "ERRO">,
  { descricao: string; rotulo: string; variant: "destructive" | "outline" | "success" | "warning" }
> = {
  CRIANDO: {
    rotulo: "Criando conta",
    descricao: "A solicitação está sendo processada. Não envie novamente.",
    variant: "warning",
  },
  RESULTADO_INDETERMINADO: {
    rotulo: "Conciliação necessária",
    descricao:
      "A comunicação foi interrompida e a gestão precisa confirmar se a conta foi criada antes de tentar novamente.",
    variant: "destructive",
  },
  AGUARDANDO_ATIVACAO: {
    rotulo: "Aguardando ativação",
    descricao:
      "A conta foi criada. Consulte o e-mail informado, defina sua senha e conclua o cadastro no Asaas.",
    variant: "warning",
  },
  AGUARDANDO_APROVACAO: {
    rotulo: "Em análise pelo Asaas",
    descricao: "Os documentos e dados cadastrais estão sendo analisados pelo Asaas.",
    variant: "warning",
  },
  HABILITADA: {
    rotulo: "Conta habilitada",
    descricao: "Sua conta está apta para receber novos splits automáticos.",
    variant: "success",
  },
  BLOQUEADA: {
    rotulo: "Conta bloqueada",
    descricao: "A conta não pode receber novos splits até a regularização.",
    variant: "destructive",
  },
  DESABILITADA: {
    rotulo: "Split desabilitado",
    descricao: "Nenhum novo split será enviado para esta conta.",
    variant: "outline",
  },
}

function somenteDigitos(valor: FormDataEntryValue | null) {
  return typeof valor === "string" ? valor.replace(/\D/g, "") : ""
}

function formularioValido(form: HTMLFormElement) {
  const dados = new FormData(form)
  const renda = interpretarBRL(dados.get("rendaMensal"))
  const celular = somenteDigitos(dados.get("celular"))

  return (
    form.checkValidity() &&
    cpfValido(somenteDigitos(dados.get("cpfCnpj"))) &&
    (celular.length === 10 || celular.length === 11) &&
    somenteDigitos(dados.get("cep")).length === 8 &&
    typeof renda === "number" &&
    Number.isFinite(renda) &&
    renda > 0 &&
    dados.get("consentimento") === "on"
  )
}

export function FormContaAsaasProfessor({ dados }: { dados: DadosContaAsaasProfessorView }) {
  if (dados.status && dados.status !== "RASCUNHO" && dados.status !== "ERRO") {
    const estado = STATUS[dados.status]
    return (
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <Badge variant={estado.variant}>{estado.rotulo}</Badge>
          {dados.walletFinal && (
            <span className="text-xs text-muted-foreground">
              Wallet registrada: ••••{dados.walletFinal}
            </span>
          )}
        </div>
        <p className="text-sm text-muted-foreground">{estado.descricao}</p>
      </div>
    )
  }

  return <Formulario dados={dados} />
}

function Formulario({ dados }: { dados: DadosContaAsaasProfessorView }) {
  const [estado, acao] = useActionState<EstadoContaAsaasProfessor, FormData>(
    acaoSolicitarCriacaoContaAsaasProfessor,
    undefined,
  )
  const ref = useRef<HTMLFormElement>(null)
  const [podeEnviar, setPodeEnviar] = useState(false)

  const conferir = useCallback(() => {
    setPodeEnviar(ref.current ? formularioValido(ref.current) : false)
  }, [])

  useEffect(() => conferir(), [conferir])

  return (
    <form ref={ref} action={acao} onInput={conferir} onChange={conferir} className="space-y-5">
      <div className="rounded-md border border-border bg-muted/40 p-4 text-sm text-muted-foreground">
        Estes dados serão enviados ao Asaas para criar uma conta financeira em seu nome. O e-mail da
        conta Asaas pode ser diferente do seu login no Sistema ECVO.
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Campo id="nomeTitular" rotulo="Nome civil completo" className="sm:col-span-2">
          <Input
            id="nomeTitular"
            name="nomeTitular"
            defaultValue={dados.nomeTitular}
            autoComplete="name"
            maxLength={120}
            required
          />
        </Campo>
        <Campo id="emailContaAsaas" rotulo="E-mail da conta Asaas">
          <Input
            id="emailContaAsaas"
            name="emailContaAsaas"
            type="email"
            defaultValue={dados.emailContaAsaas}
            autoComplete="email"
            maxLength={254}
            required
          />
        </Campo>
        <Campo id="cpfCnpj" rotulo="CPF">
          <Input
            id="cpfCnpj"
            name="cpfCnpj"
            defaultValue={dados.cpfCnpj}
            inputMode="numeric"
            autoComplete="off"
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
            autoComplete="bday"
            required
          />
        </Campo>
        <Campo id="celular" rotulo="Celular">
          <Input
            id="celular"
            name="celular"
            defaultValue={dados.celular}
            inputMode="tel"
            autoComplete="tel"
            placeholder="(83) 99999-9999"
            required
          />
        </Campo>
        <Campo id="rendaMensal" rotulo="Renda mensal">
          <Input
            id="rendaMensal"
            name="rendaMensal"
            type="text"
            defaultValue={dados.rendaMensal}
            inputMode="decimal"
            placeholder="3.000,00"
            required
          />
        </Campo>
        <Campo id="cep" rotulo="CEP">
          <Input
            id="cep"
            name="cep"
            defaultValue={dados.cep}
            inputMode="numeric"
            autoComplete="postal-code"
            placeholder="00000-000"
            required
          />
        </Campo>
        <Campo id="logradouro" rotulo="Logradouro" className="sm:col-span-2">
          <Input
            id="logradouro"
            name="logradouro"
            defaultValue={dados.logradouro}
            autoComplete="address-line1"
            maxLength={200}
            required
          />
        </Campo>
        <Campo id="numeroEndereco" rotulo="Número">
          <Input
            id="numeroEndereco"
            name="numeroEndereco"
            defaultValue={dados.numeroEndereco}
            autoComplete="address-line2"
            maxLength={20}
            required
          />
        </Campo>
        <Campo id="complemento" rotulo="Complemento (opcional)">
          <Input
            id="complemento"
            name="complemento"
            defaultValue={dados.complemento}
            maxLength={120}
          />
        </Campo>
        <Campo id="bairro" rotulo="Bairro">
          <Input
            id="bairro"
            name="bairro"
            defaultValue={dados.bairro}
            autoComplete="address-level3"
            maxLength={100}
            required
          />
        </Campo>
      </div>

      <label className="flex items-start gap-3 rounded-md border border-border p-4 text-sm">
        <input
          type="checkbox"
          name="consentimento"
          required
          className="mt-0.5 size-4 shrink-0 accent-primary"
        />
        <span>
          Autorizo a ECVO a enviar estes dados ao Asaas para criar uma conta em meu nome. Estou
          ciente de que receberei um e-mail para ativação e envio dos documentos solicitados pelo
          Asaas.
        </span>
      </label>

      {(estado?.erro || dados.ultimoErro) && (
        <p className="text-sm text-destructive" aria-live="polite">
          {estado?.erro ?? dados.ultimoErro}
        </p>
      )}
      {estado?.ok && (
        <p className="text-sm text-success" aria-live="polite">
          Solicitação enviada. Verifique o e-mail informado para ativar sua conta.
        </p>
      )}

      <div className="flex flex-col items-start gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-muted-foreground">
          O botão será liberado quando todos os campos obrigatórios estiverem válidos.
        </p>
        <BotaoEnviar disabled={!podeEnviar}>
          <CircleDollarSign /> Solicitar criação da conta Asaas
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
  children: ReactNode
}) {
  return (
    <div className={`space-y-1.5 ${className ?? ""}`}>
      <Label htmlFor={id}>{rotulo}</Label>
      {children}
    </div>
  )
}

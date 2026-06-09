"use client"

import { useActionState, useEffect, useRef, useState } from "react"
import { acaoCriarAluno, type EstadoForm } from "@/app/actions/cadastros"
import { CampoUploadFoto } from "@/components/campo-upload-foto"
import { SeletorModalidades } from "@/components/seletor-modalidades"
import { BotaoEnviar } from "@/components/ui/botao-enviar"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { formatarBRL } from "@/lib/utils/formato"

const TIPOS = [
  { v: "MENSALISTA", r: "Mensalista" },
  { v: "WELLHUB", r: "Wellhub" },
  { v: "TOTALPASS", r: "TotalPass" },
  { v: "AVULSO", r: "Avulso" },
]

const STATUS = [
  { v: "ATIVO", r: "Ativo" },
  { v: "INATIVO", r: "Inativo" },
  { v: "SUSPENSO", r: "Suspenso" },
  { v: "CANCELADO", r: "Cancelado" },
  { v: "INADIMPLENTE", r: "Inadimplente" },
  { v: "TRANCADO", r: "Trancado" },
]

type Plano = {
  id: string
  nome: string
  valor: number
  periodicidade: string
  ativo: boolean
}

export function FormAluno({
  modalidades,
  planos,
  aoConcluir,
}: {
  modalidades: { id: string; nome: string }[]
  planos: Plano[]
  aoConcluir?: () => void
}) {
  const [estado, acao] = useActionState<EstadoForm, FormData>(acaoCriarAluno, undefined)
  const ref = useRef<HTMLFormElement>(null)
  const [uploadPendente, setUploadPendente] = useState(false)
  const [fotoKey, setFotoKey] = useState(0)

  useEffect(() => {
    if (estado?.ok) {
      ref.current?.reset()
      setFotoKey((key) => key + 1)
      aoConcluir?.()
    }
  }, [estado?.ok, aoConcluir])

  return (
    <form ref={ref} action={acao} className="grid gap-4 sm:grid-cols-2">
      <div className="space-y-1.5">
        <Label htmlFor="nome">Nome</Label>
        <Input id="nome" name="nome" required />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="cpf">CPF</Label>
        <Input id="cpf" name="cpf" placeholder="000.000.000-00" />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="email">E-mail (login)</Label>
        <Input id="email" name="email" type="email" required />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="senha">Senha inicial</Label>
        <Input id="senha" name="senha" type="text" minLength={6} required />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="tipo">Tipo</Label>
        <Select id="tipo" name="tipo" defaultValue="MENSALISTA">
          {TIPOS.map((t) => (
            <option key={t.v} value={t.v}>
              {t.r}
            </option>
          ))}
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="status">Status</Label>
        <Select id="status" name="status" defaultValue="ATIVO">
          {STATUS.map((status) => (
            <option key={status.v} value={status.v}>
              {status.r}
            </option>
          ))}
        </Select>
      </div>
      <div className="space-y-1.5 sm:col-span-2">
        <Label htmlFor="planoId">Plano de pagamento</Label>
        <Select id="planoId" name="planoId" defaultValue="">
          <option value="">Sem plano</option>
          {planos.map((plano) => (
            <option key={plano.id} value={plano.id}>
              {rotuloPlano(plano)}
            </option>
          ))}
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="telefone">Telefone</Label>
        <Input id="telefone" name="telefone" />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="diaVencimento">Vencimento da mensalidade</Label>
        <Input
          id="diaVencimento"
          name="diaVencimento"
          type="number"
          min="1"
          max="28"
          defaultValue="10"
        />
      </div>
      <CampoUploadFoto
        key={fotoKey}
        id="fotoUrl"
        entidade="alunos"
        onPendenteChange={setUploadPendente}
      />
      <div className="space-y-1.5">
        <Label htmlFor="dataNascimento">Data de nascimento</Label>
        <Input id="dataNascimento" name="dataNascimento" type="date" />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="dataInicio">Data de início</Label>
        <Input id="dataInicio" name="dataInicio" type="date" />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="idExterno">ID externo (Wellhub/TotalPass)</Label>
        <Input id="idExterno" name="idExterno" placeholder="WH-0001" />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="endereco">Endereço</Label>
        <Input id="endereco" name="endereco" />
      </div>
      <div className="sm:col-span-2">
        <SeletorModalidades modalidades={modalidades} />
      </div>
      <div className="space-y-1.5 sm:col-span-2">
        <Label htmlFor="contatoEmergencia">Contato de emergência</Label>
        <Input id="contatoEmergencia" name="contatoEmergencia" />
      </div>
      <div className="space-y-1.5 sm:col-span-2">
        <Label htmlFor="restricoesMedicas">Restrições médicas (LGPD)</Label>
        <Input id="restricoesMedicas" name="restricoesMedicas" />
      </div>
      <div className="space-y-1.5 sm:col-span-2">
        <Label htmlFor="observacoesAdmin">Observações administrativas</Label>
        <Textarea id="observacoesAdmin" name="observacoesAdmin" />
      </div>
      <div className="space-y-1.5 sm:col-span-2">
        <Label htmlFor="observacoesTecnicas">Observações técnicas iniciais</Label>
        <Textarea id="observacoesTecnicas" name="observacoesTecnicas" />
      </div>

      <fieldset className="space-y-3 rounded-md border border-border p-4 sm:col-span-2">
        <legend className="px-1 text-sm font-medium text-muted-foreground">
          Responsável (se menor de idade)
        </legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="respNome">Nome do responsável</Label>
            <Input id="respNome" name="respNome" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="respCpf">CPF do responsável</Label>
            <Input id="respCpf" name="respCpf" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="respTelefone">Telefone</Label>
            <Input id="respTelefone" name="respTelefone" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="respEmail">E-mail</Label>
            <Input id="respEmail" name="respEmail" type="email" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="respParentesco">Parentesco</Label>
            <Input id="respParentesco" name="respParentesco" placeholder="Mãe / Pai" />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="respFinanceiro" className="accent-primary" />
            Responsável financeiro
          </label>
        </div>
      </fieldset>

      <div className="flex items-center gap-3 sm:col-span-2">
        <BotaoEnviar disabled={uploadPendente}>Cadastrar aluno</BotaoEnviar>
        {estado?.erro && <p className="text-sm text-destructive">{estado.erro}</p>}
      </div>
    </form>
  )
}

function rotuloPlano(plano: Plano) {
  const status = plano.ativo ? "" : " · inativo"
  return `${plano.nome} · ${formatarBRL(plano.valor)} · ${plano.periodicidade}${status}`
}

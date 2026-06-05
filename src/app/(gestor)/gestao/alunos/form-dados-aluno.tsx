"use client"

import { useActionState, useEffect } from "react"
import { acaoAtualizarDadosAluno, type EstadoForm } from "@/app/actions/cadastros"
import { BotaoEnviar } from "@/components/ui/botao-enviar"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"

type TipoAluno = "MENSALISTA" | "WELLHUB" | "TOTALPASS" | "AVULSO"
type StatusAluno = "ATIVO" | "INATIVO" | "SUSPENSO" | "CANCELADO" | "INADIMPLENTE" | "TRANCADO"

type Modalidade = { id: string; nome: string }

type AlunoParaEdicao = {
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

const TIPOS: TipoAluno[] = ["MENSALISTA", "WELLHUB", "TOTALPASS", "AVULSO"]
const STATUS: StatusAluno[] = [
  "ATIVO",
  "INATIVO",
  "SUSPENSO",
  "CANCELADO",
  "INADIMPLENTE",
  "TRANCADO",
]

export function FormDadosAluno({
  modalidades,
  aluno,
  aoConcluir,
}: {
  modalidades: Modalidade[]
  aluno: AlunoParaEdicao
  aoConcluir?: () => void
}) {
  const [estado, acao] = useActionState<EstadoForm, FormData>(acaoAtualizarDadosAluno, undefined)
  const modalidadeIds = new Set(aluno.modalidades)

  useEffect(() => {
    if (estado?.ok) aoConcluir?.()
  }, [estado?.ok, aoConcluir])

  return (
    <form action={acao} className="grid gap-4 sm:grid-cols-2">
      <input type="hidden" name="alunoId" value={aluno.id} />
      <div className="space-y-1.5">
        <Label htmlFor="nome-aluno">Nome</Label>
        <Input id="nome-aluno" name="nome" defaultValue={aluno?.nome ?? ""} required />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="cpf-aluno">CPF</Label>
        <Input id="cpf-aluno" name="cpf" defaultValue={aluno?.cpf ?? ""} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="tipo-aluno">Tipo</Label>
        <Select id="tipo-aluno" name="tipo" defaultValue={aluno?.tipo ?? "MENSALISTA"}>
          {TIPOS.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="status-aluno">Status</Label>
        <Select id="status-aluno" name="status" defaultValue={aluno?.status ?? "ATIVO"}>
          {STATUS.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="telefone-aluno">Telefone</Label>
        <Input id="telefone-aluno" name="telefone" defaultValue={aluno?.telefone ?? ""} />
      </div>
      <div className="space-y-1.5 sm:col-span-2">
        <Label htmlFor="fotoUrl-aluno">URL da foto</Label>
        <Input id="fotoUrl-aluno" name="fotoUrl" type="url" defaultValue={aluno?.fotoUrl ?? ""} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="dataNascimento-aluno">Data de nascimento</Label>
        <Input
          id="dataNascimento-aluno"
          name="dataNascimento"
          type="date"
          defaultValue={paraDataInput(aluno?.dataNascimento)}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="dataInicio-aluno">Data de início</Label>
        <Input
          id="dataInicio-aluno"
          name="dataInicio"
          type="date"
          defaultValue={paraDataInput(aluno?.dataInicio)}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="idExterno-aluno">ID externo</Label>
        <Input id="idExterno-aluno" name="idExterno" defaultValue={aluno?.idExterno ?? ""} />
      </div>
      <div className="space-y-1.5 sm:col-span-2">
        <Label htmlFor="endereco-aluno">Endereço</Label>
        <Input id="endereco-aluno" name="endereco" defaultValue={aluno?.endereco ?? ""} />
      </div>
      <div className="space-y-1.5 sm:col-span-2">
        <Label htmlFor="contatoEmergencia-aluno">Contato de emergência</Label>
        <Input
          id="contatoEmergencia-aluno"
          name="contatoEmergencia"
          defaultValue={aluno?.contatoEmergencia ?? ""}
        />
      </div>

      <div className="space-y-1.5 sm:col-span-2">
        <Label>Modalidades</Label>
        <div className="flex flex-wrap gap-2">
          {modalidades.map((m) => (
            <label
              key={m.id}
              className="flex cursor-pointer items-center gap-2 rounded-md border border-input px-3 py-2 text-sm has-[:checked]:border-primary has-[:checked]:bg-accent"
            >
              <input
                type="checkbox"
                name="modalidadeIds"
                value={m.id}
                defaultChecked={modalidadeIds.has(m.id)}
              />
              {m.nome}
            </label>
          ))}
          {modalidades.length === 0 && (
            <p className="text-sm text-muted-foreground">
              Cadastre uma modalidade antes de editar alunos.
            </p>
          )}
        </div>
      </div>

      <div className="space-y-1.5 sm:col-span-2">
        <Label htmlFor="restricoesMedicas-aluno">Restrições médicas</Label>
        <Input
          id="restricoesMedicas-aluno"
          name="restricoesMedicas"
          defaultValue={aluno?.restricoesMedicas ?? ""}
        />
      </div>
      <div className="space-y-1.5 sm:col-span-2">
        <Label htmlFor="observacoesAdmin-aluno">Observações administrativas</Label>
        <Textarea
          id="observacoesAdmin-aluno"
          name="observacoesAdmin"
          defaultValue={aluno?.observacoesAdmin ?? ""}
        />
      </div>
      <div className="space-y-1.5 sm:col-span-2">
        <Label htmlFor="observacoesTecnicas-aluno">Observações técnicas</Label>
        <Textarea
          id="observacoesTecnicas-aluno"
          name="observacoesTecnicas"
          defaultValue={aluno?.observacoesTecnicas ?? ""}
        />
      </div>

      <div className="flex items-center gap-3 sm:col-span-2">
        <BotaoEnviar>Salvar aluno</BotaoEnviar>
        {estado?.erro && <p className="text-sm text-destructive">{estado.erro}</p>}
      </div>
    </form>
  )
}

function paraDataInput(valor?: Date | null) {
  return valor ? valor.toISOString().split("T")[0] : ""
}

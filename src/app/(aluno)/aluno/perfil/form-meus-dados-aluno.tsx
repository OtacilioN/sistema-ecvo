"use client"

import { Save } from "lucide-react"
import { useActionState } from "react"
import { acaoAtualizarMeusDadosAluno, type EstadoMeusDadosAluno } from "@/app/actions/aluno-perfil"
import { BotaoEnviar } from "@/components/ui/botao-enviar"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { formatarDataInput } from "@/lib/utils/datas"

type AlunoPerfil = {
  usuario: {
    nome: string
    email: string
  }
  cpf: string | null
  telefone: string | null
  dataNascimento: Date | null
  endereco: string | null
  contatoEmergencia: string | null
  restricoesMedicas: string | null
  responsavel: {
    nome: string
    cpf: string | null
    telefone: string | null
    email: string | null
    grauParentesco: string | null
    responsavelFinanceiro: boolean
  } | null
}

export function FormMeusDadosAluno({ aluno }: { aluno: AlunoPerfil }) {
  const [estado, acao] = useActionState<EstadoMeusDadosAluno, FormData>(
    acaoAtualizarMeusDadosAluno,
    undefined,
  )

  return (
    <form action={acao} className="grid gap-4 sm:grid-cols-2">
      <div className="space-y-1.5">
        <Label htmlFor="meus-dados-nome">Nome</Label>
        <Input id="meus-dados-nome" name="nome" defaultValue={aluno.usuario.nome} required />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="meus-dados-email">E-mail</Label>
        <Input
          id="meus-dados-email"
          name="email"
          type="email"
          autoComplete="email"
          defaultValue={aluno.usuario.email}
          required
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="meus-dados-cpf">CPF</Label>
        <Input id="meus-dados-cpf" name="cpf" defaultValue={aluno.cpf ?? ""} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="meus-dados-telefone">Telefone</Label>
        <Input
          id="meus-dados-telefone"
          name="telefone"
          autoComplete="tel"
          defaultValue={aluno.telefone ?? ""}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="meus-dados-nascimento">Data de nascimento</Label>
        <Input
          id="meus-dados-nascimento"
          name="dataNascimento"
          type="date"
          defaultValue={paraDataInput(aluno.dataNascimento)}
        />
      </div>
      <div className="space-y-1.5 sm:col-span-2">
        <Label htmlFor="meus-dados-endereco">Endereço</Label>
        <Input
          id="meus-dados-endereco"
          name="endereco"
          autoComplete="street-address"
          defaultValue={aluno.endereco ?? ""}
        />
      </div>
      <div className="space-y-1.5 sm:col-span-2">
        <Label htmlFor="meus-dados-contato-emergencia">Contato de emergência</Label>
        <Input
          id="meus-dados-contato-emergencia"
          name="contatoEmergencia"
          defaultValue={aluno.contatoEmergencia ?? ""}
        />
      </div>
      <div className="space-y-1.5 sm:col-span-2">
        <Label htmlFor="meus-dados-restricoes">Restrições médicas</Label>
        <Textarea
          id="meus-dados-restricoes"
          name="restricoesMedicas"
          defaultValue={aluno.restricoesMedicas ?? ""}
        />
      </div>

      <fieldset className="space-y-3 rounded-md border border-border p-4 sm:col-span-2">
        <legend className="px-1 text-sm font-medium text-muted-foreground">
          Responsável, se houver
        </legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="meus-dados-resp-nome">Nome do responsável</Label>
            <Input
              id="meus-dados-resp-nome"
              name="respNome"
              defaultValue={aluno.responsavel?.nome ?? ""}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="meus-dados-resp-cpf">CPF do responsável</Label>
            <Input
              id="meus-dados-resp-cpf"
              name="respCpf"
              defaultValue={aluno.responsavel?.cpf ?? ""}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="meus-dados-resp-telefone">Telefone</Label>
            <Input
              id="meus-dados-resp-telefone"
              name="respTelefone"
              defaultValue={aluno.responsavel?.telefone ?? ""}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="meus-dados-resp-email">E-mail</Label>
            <Input
              id="meus-dados-resp-email"
              name="respEmail"
              type="email"
              defaultValue={aluno.responsavel?.email ?? ""}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="meus-dados-resp-parentesco">Parentesco</Label>
            <Input
              id="meus-dados-resp-parentesco"
              name="respParentesco"
              defaultValue={aluno.responsavel?.grauParentesco ?? ""}
            />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="respFinanceiro"
              defaultChecked={aluno.responsavel?.responsavelFinanceiro ?? false}
              className="accent-primary"
            />
            Responsável financeiro
          </label>
        </div>
      </fieldset>

      <div className="flex flex-wrap items-center justify-end gap-3 sm:col-span-2">
        {estado?.erro && <p className="text-sm text-destructive">{estado.erro}</p>}
        {estado?.ok && <p className="text-sm text-success">Dados salvos.</p>}
        <BotaoEnviar>
          <Save className="size-4" /> Salvar dados
        </BotaoEnviar>
      </div>
    </form>
  )
}

function paraDataInput(valor?: Date | null) {
  return valor ? formatarDataInput(valor) : ""
}

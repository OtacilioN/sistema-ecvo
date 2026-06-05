"use client"

import { useActionState, useEffect } from "react"
import { acaoAtualizarDadosModalidade, type EstadoForm } from "@/app/actions/cadastros"
import { BotaoEnviar } from "@/components/ui/botao-enviar"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { CamposGraduacoesModalidade, type GraduacaoForm } from "./campos-graduacoes-modalidade"

type ModalidadeDados = {
  id: string
  nome: string
  descricao: string | null
  duracaoPadraoMin: number
  ativa: boolean
  graduacoes: GraduacaoForm[]
}

export function FormDadosModalidade({
  modalidade,
  aoConcluir,
}: {
  modalidade: ModalidadeDados
  aoConcluir?: () => void
}) {
  const [estado, acao] = useActionState<EstadoForm, FormData>(
    acaoAtualizarDadosModalidade,
    undefined,
  )

  useEffect(() => {
    if (estado?.ok) aoConcluir?.()
  }, [estado?.ok, aoConcluir])

  return (
    <form action={acao} className="grid gap-4">
      <input type="hidden" name="modalidadeId" value={modalidade.id} />
      <div className="grid gap-3 sm:grid-cols-[1fr_9rem_9rem]">
        <div className="space-y-1.5">
          <Label htmlFor="nome-modalidade">Nome</Label>
          <Input id="nome-modalidade" name="nome" defaultValue={modalidade?.nome ?? ""} required />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="duracao-modalidade">Duração</Label>
          <Input
            id="duracao-modalidade"
            name="duracaoPadraoMin"
            type="number"
            min={15}
            max={480}
            defaultValue={modalidade?.duracaoPadraoMin ?? 60}
            required
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="ativa-modalidade">Status</Label>
          <Select
            id="ativa-modalidade"
            name="ativa"
            defaultValue={modalidade?.ativa ? "true" : "false"}
          >
            <option value="true">Ativa</option>
            <option value="false">Inativa</option>
          </Select>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="descricao-modalidade">Descrição</Label>
        <Textarea
          id="descricao-modalidade"
          name="descricao"
          defaultValue={modalidade?.descricao ?? ""}
          className="min-h-20"
        />
      </div>

      <CamposGraduacoesModalidade graduacoes={modalidade.graduacoes} />

      <div className="flex items-center gap-3">
        <BotaoEnviar>Salvar modalidade</BotaoEnviar>
        {estado?.erro && <p className="text-sm text-destructive">{estado.erro}</p>}
      </div>
    </form>
  )
}

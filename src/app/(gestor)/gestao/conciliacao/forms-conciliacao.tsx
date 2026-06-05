"use client"

import { FileUp, Wrench } from "lucide-react"
import { useActionState, useEffect } from "react"
import {
  acaoImportarConciliacao,
  acaoResolverConciliacao,
  type EstadoConciliacao,
} from "@/app/actions/conciliacao"
import { BotaoEnviar } from "@/components/ui/botao-enviar"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"

type AlunoOpcao = { id: string; nome: string; detalhe: string }
type CheckinOpcao = { id: string; rotulo: string }

export function FormImportacaoConciliacao({ aoConcluir }: { aoConcluir?: () => void }) {
  const [estado, acao] = useActionState<EstadoConciliacao, FormData>(
    acaoImportarConciliacao,
    undefined,
  )

  useEffect(() => {
    if (estado?.ok) aoConcluir?.()
  }, [estado?.ok, aoConcluir])

  return (
    <form action={acao} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="plataforma">Plataforma</Label>
        <Select id="plataforma" name="plataforma" defaultValue="WELLHUB">
          <option value="WELLHUB">Wellhub</option>
          <option value="TOTALPASS">TotalPass</option>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="arquivo">CSV ou XLSX</Label>
        <Input
          id="arquivo"
          name="arquivo"
          type="file"
          accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          required
        />
      </div>
      {estado?.erro && <p className="text-sm text-destructive">{estado.erro}</p>}
      <div className="flex justify-end">
        <BotaoEnviar>
          <FileUp className="size-4" /> Importar e conciliar
        </BotaoEnviar>
      </div>
    </form>
  )
}

export function FormResolverConciliacao({
  registroId,
  statusAtual,
  alunos,
  checkins,
  aoConcluir,
}: {
  registroId: string
  statusAtual: string
  alunos: AlunoOpcao[]
  checkins: CheckinOpcao[]
  aoConcluir?: () => void
}) {
  const [estado, acao] = useActionState<EstadoConciliacao, FormData>(
    acaoResolverConciliacao,
    undefined,
  )

  useEffect(() => {
    if (estado?.ok) aoConcluir?.()
  }, [estado?.ok, aoConcluir])

  return (
    <form action={acao} className="space-y-4">
      <input type="hidden" name="registroId" value={registroId} />
      <div className="space-y-1.5">
        <Label htmlFor="status">Status</Label>
        <Select id="status" name="status" defaultValue={statusAtual}>
          <option value="CONCILIADO">Conciliado</option>
          <option value="NAO_ENCONTRADO">Não encontrado</option>
          <option value="ALUNO_NAO_IDENTIFICADO">Aluno não identificado</option>
          <option value="DIVERGENCIA_DATA">Divergência de data</option>
          <option value="DIVERGENCIA_HORARIO">Divergência de horário</option>
          <option value="CHECKIN_INVALIDADO">Check-in invalidado</option>
          <option value="DUPLICADO_PLANILHA">Duplicado na planilha</option>
          <option value="DUPLICADO_SISTEMA">Duplicado no sistema</option>
          <option value="PENDENTE">Pendente</option>
        </Select>
      </div>
      <SelectCampo id="alunoId" rotulo="Aluno" opcoes={alunos} opcional />
      <SelectCampo id="checkinId" rotulo="Check-in" opcoes={checkins} opcional />
      <div className="space-y-1.5">
        <Label htmlFor="observacao">Observação</Label>
        <Textarea
          id="observacao"
          name="observacao"
          placeholder="Justificativa da resolução manual"
        />
      </div>
      {estado?.erro && <p className="text-sm text-destructive">{estado.erro}</p>}
      <div className="flex justify-end">
        <BotaoEnviar>
          <Wrench className="size-4" /> Resolver
        </BotaoEnviar>
      </div>
    </form>
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
  opcoes: { id: string; rotulo?: string; nome?: string; detalhe?: string }[]
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

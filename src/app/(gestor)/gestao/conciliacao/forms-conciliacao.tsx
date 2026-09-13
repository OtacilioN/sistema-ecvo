"use client"

import { FileUp, Wrench } from "lucide-react"
import { useActionState, useEffect, useState } from "react"
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
  const [plataforma, setPlataforma] = useState("WELLHUB")
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
        <Select
          id="plataforma"
          name="plataforma"
          value={plataforma}
          onChange={(event) => setPlataforma(event.target.value)}
        >
          <option value="WELLHUB">Wellhub</option>
          <option value="TOTALPASS">TotalPass</option>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="competencia">Mês de referência</Label>
        <Input id="competencia" name="competencia" type="month" required />
        <p className="text-xs text-muted-foreground">
          Selecione o mês a que os valores dos arquivos se referem.
        </p>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="arquivo">Arquivos CSV ou XLSX</Label>
        <Input
          key={plataforma}
          id="arquivo"
          name="arquivo"
          type="file"
          multiple={plataforma === "WELLHUB"}
          accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          required
        />
        <p className="text-xs text-muted-foreground">
          {plataforma === "TOTALPASS"
            ? "Envie o relatório mensal TotalPass (máximo de 3 MB), com Nome, Documento, Email e Valor líquido total. É permitido um relatório por mês."
            : "Envie até dois arquivos do mesmo mês (máximo de 3 MB no total). Os valores das duas contas Wellhub são somados por aluno. Você também pode enviar a segunda conta depois."}
        </p>
        <p className="text-xs text-muted-foreground">
          O resumo mensal é financeiro: não cria nem valida check-ins ou horas. Relatórios mensais e
          diários da mesma plataforma não podem ser misturados no mesmo mês. Reenvios são
          bloqueados.
        </p>
      </div>
      {estado?.erro && (
        <p role="alert" className="text-sm text-destructive">
          {estado.erro}
        </p>
      )}
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
  resumoMensal = false,
  aoConcluir,
}: {
  registroId: string
  statusAtual: string
  alunos: AlunoOpcao[]
  checkins: CheckinOpcao[]
  resumoMensal?: boolean
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
          <option value="ALUNO_NAO_IDENTIFICADO">Aluno não identificado</option>
          <option value="PENDENTE">Pendente</option>
          {!resumoMensal && (
            <>
              <option value="NAO_ENCONTRADO">Não encontrado</option>
              <option value="DIVERGENCIA_DATA">Divergência de data</option>
              <option value="DIVERGENCIA_HORARIO">Divergência de horário</option>
              <option value="CHECKIN_INVALIDADO">Check-in invalidado</option>
              <option value="DUPLICADO_PLANILHA">Duplicado na planilha</option>
              <option value="DUPLICADO_SISTEMA">Duplicado no sistema</option>
            </>
          )}
        </Select>
      </div>
      <SelectCampo id="alunoId" rotulo="Aluno" opcoes={alunos} opcional />
      {resumoMensal ? (
        <>
          <input type="hidden" name="checkinId" value="" />
          <p className="text-sm text-muted-foreground">
            Este é um resumo financeiro mensal. Vincule o aluno para incluir sua receita na
            consolidação; nenhum check-in ou hora será gerado.
          </p>
        </>
      ) : (
        <SelectCampo id="checkinId" rotulo="Check-in" opcoes={checkins} opcional />
      )}
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

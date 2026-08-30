"use client"

import { FilePlus, LinkIcon, Repeat2, Save, Trash2, WalletCards } from "lucide-react"
import type * as React from "react"
import { useActionState, useEffect, useMemo, useRef, useState } from "react"
import {
  acaoAtualizarPlano,
  acaoAtualizarStatusMensalidade,
  acaoBaixarMensalidade,
  acaoConfigurarTipoCobrancaPix,
  acaoCriarPlano,
  acaoDarBaixaMensalidadeAluno,
  acaoExcluirPlano,
  acaoPagamentoAvulso,
  acaoVincularPlano,
  type EstadoFinanceiro,
} from "@/app/actions/financeiro"
import { BotaoEnviar } from "@/components/ui/botao-enviar"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select } from "@/components/ui/select"
import { formatarData } from "@/lib/utils/datas"
import { formatarBRL } from "@/lib/utils/formato"

type ModalidadeOpcao = { id: string; nome: string }
type PeriodicidadePlano = "MENSAL" | "TRIMESTRAL" | "SEMESTRAL" | "ANUAL"
type AlunoOpcao = {
  id: string
  nome: string
  detalhe: string
  modalidades: ModalidadeOpcao[]
  modalidadeContratadaIds: string[]
}
export type AlunoBaixaMensalidade = {
  id: string
  nome: string
  planoNome: string | null
  planoValor: number | null
  mensalidadeAtual: {
    id: string
    competencia: string
    valor: number
    status: StatusMensalidade
    pagoEm: Date | null
    formaPagamento: string | null
  } | null
  diaVencimento: number
}
type PlanoOpcao = { id: string; nome: string }
export type PlanoEdicao = {
  id: string
  nome: string
  valor: number
  periodicidade: PeriodicidadePlano
  limiteAulas: number | null
  ativo: boolean
  padrao: boolean
}

type StatusMensalidade = "EM_ABERTO" | "PAGA" | "VENCIDA" | "CANCELADA" | "ISENTA"

const ROTULO_STATUS_MENSALIDADE: Record<StatusMensalidade, string> = {
  EM_ABERTO: "Em aberto",
  PAGA: "Paga",
  VENCIDA: "Vencida",
  CANCELADA: "Cancelada",
  ISENTA: "Isenta",
}

export function FormPlano({ aoConcluir }: { aoConcluir?: () => void }) {
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
      <CampoTexto id="limiteAulas" rotulo="Limite de aulas" type="number" min="1" />
      <label className="flex items-start gap-3 sm:col-span-2">
        <input type="checkbox" name="padrao" className="mt-0.5 size-4 accent-primary" />
        <span>
          <span className="block text-sm font-medium">Plano padrão para novas matrículas</span>
          <span className="block text-xs text-muted-foreground">
            Precisa ser mensal e ficará ativo.
          </span>
        </span>
      </label>
      <Erro estado={estado} />
      <div className="flex justify-end sm:col-span-2">
        <BotaoEnviar>
          <FilePlus className="size-4" /> Cadastrar plano
        </BotaoEnviar>
      </div>
    </form>
  )
}

export function FormEditarPlano({
  plano,
  aoConcluir,
}: {
  plano: PlanoEdicao
  aoConcluir?: () => void
}) {
  const [estado, acao] = useActionState<EstadoFinanceiro, FormData>(acaoAtualizarPlano, undefined)

  useEffect(() => {
    if (estado?.ok) aoConcluir?.()
  }, [estado?.ok, aoConcluir])

  return (
    <form action={acao} className="grid gap-4 sm:grid-cols-2">
      <input type="hidden" name="planoId" value={plano.id} />
      <CampoTexto id="nome-plano" nome="nome" rotulo="Nome" defaultValue={plano.nome} required />
      <CampoTexto
        id="valor-plano"
        nome="valor"
        rotulo="Valor"
        type="number"
        min="0"
        step="0.01"
        defaultValue={plano.valor}
        required
      />
      <div className="space-y-1.5">
        <Label htmlFor="periodicidade-plano">Periodicidade</Label>
        <Select id="periodicidade-plano" name="periodicidade" defaultValue={plano.periodicidade}>
          <option value="MENSAL">Mensal</option>
          <option value="TRIMESTRAL">Trimestral</option>
          <option value="SEMESTRAL">Semestral</option>
          <option value="ANUAL">Anual</option>
        </Select>
      </div>
      <label className="flex items-start gap-3 sm:col-span-2">
        <input
          type="checkbox"
          name="padrao"
          defaultChecked={plano.padrao}
          className="mt-0.5 size-4 accent-primary"
        />
        <span>
          <span className="block text-sm font-medium">Plano padrão para novas matrículas</span>
          <span className="block text-xs text-muted-foreground">
            Ao selecionar, o padrão anterior será substituído.
          </span>
        </span>
      </label>
      <CampoTexto
        id="limite-aulas-plano"
        nome="limiteAulas"
        rotulo="Limite de aulas"
        type="number"
        min="1"
        defaultValue={plano.limiteAulas ?? ""}
      />
      <div className="space-y-1.5">
        <Label htmlFor="status-plano">Status</Label>
        <Select id="status-plano" name="ativo" defaultValue={String(plano.ativo)}>
          <option value="true">Ativo</option>
          <option value="false">Inativo</option>
        </Select>
      </div>
      <Erro estado={estado} />
      <div className="flex justify-end sm:col-span-2">
        <BotaoEnviar>
          <Save className="size-4" /> Salvar plano
        </BotaoEnviar>
      </div>
    </form>
  )
}

export function FormExcluirPlano({
  plano,
  planos,
  alunosVinculados,
  aoConcluir,
}: {
  plano: PlanoEdicao
  planos: PlanoOpcao[]
  alunosVinculados: number
  aoConcluir?: () => void
}) {
  const [estado, acao] = useActionState<EstadoFinanceiro, FormData>(acaoExcluirPlano, undefined)
  const planosDestino = planos.filter((item) => item.id !== plano.id)
  const exigeMigracao = alunosVinculados > 0
  const semDestino = exigeMigracao && planosDestino.length === 0

  useEffect(() => {
    if (estado?.ok) aoConcluir?.()
  }, [estado?.ok, aoConcluir])

  return (
    <form action={acao} className="space-y-4">
      <input type="hidden" name="planoId" value={plano.id} />
      <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm">
        <p className="font-medium text-destructive">Esta ação remove o plano da lista.</p>
        <p className="mt-1 text-muted-foreground">
          Mensalidades antigas continuam registradas com seus valores e status.
        </p>
      </div>
      {exigeMigracao && (
        <SelectCampo
          id="planoDestinoId"
          rotulo={`Migrar ${alunosVinculados} aluno(s) para`}
          opcoes={planosDestino}
        />
      )}
      {semDestino && (
        <p className="text-sm text-destructive">
          Cadastre outro plano antes de excluir este, pois há alunos vinculados.
        </p>
      )}
      <Erro estado={estado} />
      <div className="flex justify-end">
        <BotaoEnviar variant="destructive" disabled={semDestino}>
          <Trash2 className="size-4" /> Excluir plano
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
  const [alunoId, setAlunoId] = useState(alunos[0]?.id ?? "")
  const alunoSelecionado = useMemo(
    () => alunos.find((aluno) => aluno.id === alunoId) ?? null,
    [alunos, alunoId],
  )
  const [modalidadeIds, setModalidadeIds] = useState<string[]>(modalidadesPadrao(alunos[0]))

  useEffect(() => {
    if (estado?.ok) aoConcluir?.()
  }, [estado?.ok, aoConcluir])

  useEffect(() => {
    setModalidadeIds(modalidadesPadrao(alunoSelecionado))
  }, [alunoSelecionado])

  function alternarModalidade(id: string, marcado: boolean) {
    setModalidadeIds((atuais) =>
      marcado ? Array.from(new Set([...atuais, id])) : atuais.filter((item) => item !== id),
    )
  }

  return (
    <form action={acao} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="alunoId">Aluno</Label>
        <Select
          id="alunoId"
          name="alunoId"
          required
          value={alunoId}
          onChange={(evento) => setAlunoId(evento.target.value)}
        >
          {alunos.length === 0 && <option value="">Selecione</option>}
          {alunos.map((aluno) => (
            <option key={aluno.id} value={aluno.id}>
              {aluno.nome}
              {aluno.detalhe ? ` · ${aluno.detalhe}` : ""}
            </option>
          ))}
        </Select>
      </div>
      <SelectCampo
        id="planoId"
        rotulo="Plano"
        opcoes={planos.map((p) => ({ ...p, detalhe: "" }))}
      />
      <CampoTexto
        id="diaVencimento"
        rotulo="Vencimento do aluno"
        type="number"
        min="1"
        max="28"
        defaultValue="10"
        required
      />
      <fieldset className="space-y-2 rounded-md border border-border p-3">
        <legend className="px-1 text-sm font-medium text-muted-foreground">
          Modalidades contratadas
        </legend>
        <div className="flex flex-wrap gap-2">
          {alunoSelecionado?.modalidades.map((modalidade) => (
            <label
              key={modalidade.id}
              className="flex cursor-pointer items-center gap-2 rounded-md border border-input px-3 py-2 text-sm has-[:checked]:border-primary has-[:checked]:bg-accent"
            >
              <input
                type="checkbox"
                name="modalidadeIds"
                value={modalidade.id}
                checked={modalidadeIds.includes(modalidade.id)}
                onChange={(evento) => alternarModalidade(modalidade.id, evento.target.checked)}
                className="accent-primary"
              />
              {modalidade.nome}
            </label>
          ))}
          {alunoSelecionado?.modalidades.length === 0 && (
            <p className="text-sm text-muted-foreground">Aluno sem modalidades vinculadas.</p>
          )}
        </div>
      </fieldset>
      <Erro estado={estado} />
      <div className="flex justify-end">
        <BotaoEnviar>
          <LinkIcon className="size-4" /> Vincular plano
        </BotaoEnviar>
      </div>
    </form>
  )
}

export function FormTipoCobrancaPix({
  alunos,
  aoConcluir,
}: {
  alunos: AlunoOpcao[]
  aoConcluir?: () => void
}) {
  const [estado, acao] = useActionState<EstadoFinanceiro, FormData>(
    acaoConfigurarTipoCobrancaPix,
    undefined,
  )

  useEffect(() => {
    if (estado?.ok) aoConcluir?.()
  }, [estado?.ok, aoConcluir])

  return (
    <form action={acao} className="space-y-4">
      <SelectCampo id="alunoId" rotulo="Aluno" opcoes={alunos} />
      <div className="space-y-1.5">
        <Label htmlFor="tipoCobrancaPix">Tipo de cobrança</Label>
        <Select id="tipoCobrancaPix" name="tipoCobrancaPix" defaultValue="MENSAL">
          <option value="MENSAL">PIX mensal — um QR Code por mensalidade</option>
          <option value="AUTOMATICO_SEMESTRAL">PIX Automático — seis mensalidades mensais</option>
        </Select>
      </div>
      <div className="rounded-md border border-border bg-muted/30 p-3 text-sm text-muted-foreground">
        No PIX Automático, o primeiro QR Code paga a mensalidade 1 de 6 e autoriza os cinco débitos
        mensais seguintes. O aluno precisa concluir essa autorização no aplicativo do banco.
      </div>
      <Erro estado={estado} />
      <div className="flex justify-end">
        <BotaoEnviar>
          <Repeat2 className="size-4" /> Configurar cobrança
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

export function FormBaixaMensalidadeAluno({
  aluno,
  competenciaAtual,
  aoConcluir,
}: {
  aluno: AlunoBaixaMensalidade
  competenciaAtual: string
  aoConcluir?: () => void
}) {
  const [estado, acao] = useActionState<EstadoFinanceiro, FormData>(
    acaoDarBaixaMensalidadeAluno,
    undefined,
  )
  const semPlano = !aluno.planoNome || aluno.planoValor === null
  const mensalidadeAtual = aluno.mensalidadeAtual
  const jaPaga = mensalidadeAtual?.status === "PAGA"
  const valorCompetencia = mensalidadeAtual?.valor ?? aluno.planoValor ?? 0

  useEffect(() => {
    if (estado?.ok) aoConcluir?.()
  }, [estado?.ok, aoConcluir])

  return (
    <form action={acao} className="grid gap-4 sm:grid-cols-2">
      <input type="hidden" name="alunoId" value={aluno.id} />
      <input type="hidden" name="competencia" value={competenciaAtual} />

      <div className="rounded-md border border-border bg-muted/30 p-4 sm:col-span-2">
        <p className="text-sm font-medium">{aluno.nome}</p>
        {semPlano ? (
          <p className="mt-1 text-sm text-destructive">
            Este aluno não possui plano de pagamento vinculado.
          </p>
        ) : (
          <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-3">
            <div>
              <dt className="text-muted-foreground">Plano</dt>
              <dd className="font-medium">{aluno.planoNome}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Competência</dt>
              <dd className="font-medium">{competenciaAtual}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Valor</dt>
              <dd className="font-semibold">{formatarBRL(valorCompetencia)}</dd>
            </div>
          </dl>
        )}
      </div>

      {!semPlano && (
        <>
          <div className="rounded-md border border-border p-4 text-sm sm:col-span-2">
            <p className="font-medium">Pagamento da competência</p>
            {mensalidadeAtual ? (
              <dl className="mt-3 grid gap-3 sm:grid-cols-3">
                <div>
                  <dt className="text-muted-foreground">Status</dt>
                  <dd className="font-medium">
                    {ROTULO_STATUS_MENSALIDADE[mensalidadeAtual.status]}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Valor registrado</dt>
                  <dd className="font-medium">{formatarBRL(mensalidadeAtual.valor)}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Pagamento</dt>
                  <dd className="font-medium">
                    {mensalidadeAtual.pagoEm
                      ? formatarData(mensalidadeAtual.pagoEm)
                      : "Ainda não pago"}
                  </dd>
                </div>
                {mensalidadeAtual.formaPagamento && (
                  <div className="sm:col-span-3">
                    <dt className="text-muted-foreground">Forma registrada</dt>
                    <dd className="font-medium">{mensalidadeAtual.formaPagamento}</dd>
                  </div>
                )}
              </dl>
            ) : (
              <p className="mt-2 text-muted-foreground">
                Nenhuma mensalidade registrada para esta competência.
              </p>
            )}
            {jaPaga && (
              <p className="mt-3 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-emerald-800">
                Esta competência já foi paga
                {mensalidadeAtual?.pagoEm ? ` em ${formatarData(mensalidadeAtual.pagoEm)}` : ""}.
                Não é permitido dar baixa novamente.
              </p>
            )}
          </div>
          <CampoTexto
            id="formaPagamento"
            rotulo="Forma de pagamento"
            placeholder="Pix, cartão..."
            disabled={jaPaga}
          />
          <CampoTexto id="observacao" rotulo="Observação" disabled={jaPaga} />
        </>
      )}

      <Erro estado={estado} />
      <div className="flex justify-end sm:col-span-2">
        <BotaoEnviar disabled={semPlano || jaPaga}>
          <WalletCards className="size-4" /> Dar baixa
        </BotaoEnviar>
      </div>
    </form>
  )
}

export function FormPagamentoAvulso({
  alunos,
  alunoIdInicial,
  aoConcluir,
}: {
  alunos: AlunoOpcao[]
  alunoIdInicial?: string
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
      <SelectCampo
        id="alunoId"
        rotulo="Aluno"
        opcoes={alunos}
        opcional
        defaultValue={alunoIdInicial}
      />
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
  defaultValue,
}: {
  id: string
  rotulo: string
  opcoes: { id: string; nome?: string; rotulo?: string; detalhe?: string }[]
  opcional?: boolean
  defaultValue?: string
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{rotulo}</Label>
      <Select id={id} name={id} required={!opcional} defaultValue={defaultValue}>
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

function modalidadesPadrao(aluno?: AlunoOpcao | null): string[] {
  if (!aluno) return []
  if (aluno.modalidadeContratadaIds.length > 0) return aluno.modalidadeContratadaIds
  return aluno.modalidades.map((modalidade) => modalidade.id)
}

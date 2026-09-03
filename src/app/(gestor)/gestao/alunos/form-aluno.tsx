"use client"

import { useActionState, useEffect, useRef, useState } from "react"
import { acaoCriarAluno, type EstadoForm } from "@/app/actions/cadastros"
import { CampoUploadFoto } from "@/components/campo-upload-foto"
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
  { v: "INADIMPLENTE", r: "Inadimplente" },
  { v: "TRANCADO", r: "Trancado" },
  { v: "CANCELADO", r: "Cancelado" },
]

const COBRANCAS_MODALIDADE = [
  { v: "", r: "Plano interno" },
  { v: "WELLHUB", r: "Wellhub" },
  { v: "TOTALPASS", r: "TotalPass" },
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
  competenciaAtual,
  dataHoje,
  diaVencimentoPadrao,
  podeRegistrarPagamento,
  aoConcluir,
}: {
  modalidades: { id: string; nome: string }[]
  planos: Plano[]
  competenciaAtual: string
  dataHoje: string
  diaVencimentoPadrao: number
  podeRegistrarPagamento: boolean
  aoConcluir?: () => void
}) {
  const [estado, acao] = useActionState<EstadoForm, FormData>(acaoCriarAluno, undefined)
  const ref = useRef<HTMLFormElement>(null)
  const [uploadPendente, setUploadPendente] = useState(false)
  const [fotoKey, setFotoKey] = useState(0)
  const [modalidadesSelecionadas, setModalidadesSelecionadas] = useState<Set<string>>(new Set())
  const [planoSelecionadoId, setPlanoSelecionadoId] = useState("")
  const [mensalidadeInicialPaga, setMensalidadeInicialPaga] = useState(false)
  const planoSelecionado = planos.find((plano) => plano.id === planoSelecionadoId)

  useEffect(() => {
    if (estado?.ok) {
      ref.current?.reset()
      setFotoKey((key) => key + 1)
      setModalidadesSelecionadas(new Set())
      setPlanoSelecionadoId("")
      setMensalidadeInicialPaga(false)
      aoConcluir?.()
    }
  }, [estado?.ok, aoConcluir])

  function alternarModalidade(modalidadeId: string, selecionada: boolean) {
    setModalidadesSelecionadas((atuais) => {
      const proximas = new Set(atuais)
      if (selecionada) proximas.add(modalidadeId)
      else proximas.delete(modalidadeId)
      return proximas
    })
  }

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
        <Select
          id="planoId"
          name="planoId"
          value={planoSelecionadoId}
          onChange={(event) => {
            const planoId = event.currentTarget.value
            setPlanoSelecionadoId(planoId)
            if (!planoId) setMensalidadeInicialPaga(false)
          }}
        >
          <option value="">Sem plano</option>
          {planos.map((plano) => (
            <option key={plano.id} value={plano.id}>
              {rotuloPlano(plano)}
            </option>
          ))}
        </Select>
      </div>
      {podeRegistrarPagamento && planoSelecionado && (
        <fieldset className="space-y-3 rounded-md border border-border p-4 sm:col-span-2">
          <legend className="px-1 text-sm font-medium text-muted-foreground">
            Mensalidade inicial
          </legend>
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              name="mensalidadeInicialPaga"
              checked={mensalidadeInicialPaga}
              onChange={(event) => setMensalidadeInicialPaga(event.currentTarget.checked)}
              className="mt-0.5 accent-primary"
            />
            <span>
              <span className="font-medium">A mensalidade deste mês já foi paga</span>
              <span className="mt-1 block text-muted-foreground">
                Ao cadastrar, a competência {rotuloCompetencia(competenciaAtual)} será registrada
                como paga.
              </span>
            </span>
          </label>

          {mensalidadeInicialPaga && (
            <div className="grid gap-4 border-t border-border pt-4 sm:grid-cols-2">
              <input
                type="hidden"
                name="pagamentoInicialCompetenciaEsperada"
                value={competenciaAtual}
              />
              <div className="rounded-md bg-muted/40 p-3 text-sm sm:col-span-2">
                <span className="text-muted-foreground">Valor da mensalidade: </span>
                <span className="font-semibold">{formatarBRL(planoSelecionado.valor)}</span>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pagamentoInicialPagoEm">Data do pagamento</Label>
                <Input
                  id="pagamentoInicialPagoEm"
                  name="pagamentoInicialPagoEm"
                  type="date"
                  max={dataHoje}
                  defaultValue={dataHoje}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pagamentoInicialFormaPagamento">Forma de pagamento</Label>
                <Input
                  id="pagamentoInicialFormaPagamento"
                  name="pagamentoInicialFormaPagamento"
                  placeholder="Pix, cartão, dinheiro..."
                />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="pagamentoInicialObservacao">Observação do pagamento</Label>
                <Input id="pagamentoInicialObservacao" name="pagamentoInicialObservacao" />
              </div>
            </div>
          )}
        </fieldset>
      )}
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
          defaultValue={diaVencimentoPadrao}
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
      <fieldset className="space-y-3 rounded-md border border-border p-4 sm:col-span-2">
        <legend className="px-1 text-sm font-medium text-muted-foreground">Modalidades</legend>
        <div className="grid gap-3">
          {modalidades.map((modalidade) => {
            const selecionada = modalidadesSelecionadas.has(modalidade.id)
            return (
              <div
                key={modalidade.id}
                className="grid gap-3 rounded-md border border-input p-3 sm:grid-cols-[1fr_180px] sm:items-center"
              >
                <label className="flex cursor-pointer items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    name="modalidadeIds"
                    value={modalidade.id}
                    onChange={(event) =>
                      alternarModalidade(modalidade.id, event.currentTarget.checked)
                    }
                  />
                  {modalidade.nome}
                </label>
                {selecionada && (
                  <Select
                    name={`plataformaModalidade:${modalidade.id}`}
                    defaultValue=""
                    aria-label={`Cobrança de ${modalidade.nome}`}
                  >
                    {COBRANCAS_MODALIDADE.map((cobranca) => (
                      <option key={cobranca.v} value={cobranca.v}>
                        {cobranca.r}
                      </option>
                    ))}
                  </Select>
                )}
              </div>
            )
          })}
          {modalidades.length === 0 && (
            <p className="text-sm text-muted-foreground">
              Cadastre uma modalidade antes de cadastrar alunos.
            </p>
          )}
        </div>
      </fieldset>
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

function rotuloCompetencia(competencia: string) {
  const [ano, mes] = competencia.split("-")
  return `${mes}/${ano}`
}

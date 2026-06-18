"use client"

import { useActionState, useEffect, useState } from "react"
import { acaoAtualizarDadosAluno, type EstadoForm } from "@/app/actions/cadastros"
import { CampoUploadFoto } from "@/components/campo-upload-foto"
import { BotaoEnviar } from "@/components/ui/botao-enviar"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { STATUS_ALUNO, type StatusAlunoDominio } from "@/lib/alunos/status"
import { formatarDataInput } from "@/lib/utils/datas"
import { formatarBRL } from "@/lib/utils/formato"

type TipoAluno = "MENSALISTA" | "WELLHUB" | "TOTALPASS" | "AVULSO"
type StatusAluno = StatusAlunoDominio

type Modalidade = { id: string; nome: string }
type Plano = {
  id: string
  nome: string
  valor: number
  periodicidade: string
  ativo: boolean
}

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
  planoId: string | null
  diaVencimento: number
  modalidades: string[]
  cobrancasModalidades: Array<{
    modalidadeId: string
    plataformaExterna: "WELLHUB" | "TOTALPASS" | null
  }>
  responsavel: {
    nome: string
    cpf: string | null
    telefone: string | null
    email: string | null
    grauParentesco: string | null
    responsavelFinanceiro: boolean
  } | null
}

const TIPOS: TipoAluno[] = ["MENSALISTA", "WELLHUB", "TOTALPASS", "AVULSO"]
const ROTULO_STATUS: Record<StatusAluno, string> = {
  ATIVO: "Ativo",
  INADIMPLENTE: "Inadimplente",
  TRANCADO: "Trancado",
  CANCELADO: "Cancelado",
}

const COBRANCAS_MODALIDADE = [
  { v: "", r: "Plano interno" },
  { v: "WELLHUB", r: "Wellhub" },
  { v: "TOTALPASS", r: "TotalPass" },
]

export function FormDadosAluno({
  modalidades,
  planos,
  aluno,
  aoConcluir,
}: {
  modalidades: Modalidade[]
  planos: Plano[]
  aluno: AlunoParaEdicao
  aoConcluir?: () => void
}) {
  const [estado, acao] = useActionState<EstadoForm, FormData>(acaoAtualizarDadosAluno, undefined)
  const [modalidadeIds, setModalidadeIds] = useState<Set<string>>(new Set(aluno.modalidades))
  const cobrancas = new Map(
    aluno.cobrancasModalidades.map((cobranca) => [
      cobranca.modalidadeId,
      cobranca.plataformaExterna ?? "",
    ]),
  )
  const [uploadPendente, setUploadPendente] = useState(false)

  useEffect(() => {
    if (estado?.ok) aoConcluir?.()
  }, [estado?.ok, aoConcluir])

  function alternarModalidade(modalidadeId: string, selecionada: boolean) {
    setModalidadeIds((atuais) => {
      const proximas = new Set(atuais)
      if (selecionada) proximas.add(modalidadeId)
      else proximas.delete(modalidadeId)
      return proximas
    })
  }

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
          {STATUS_ALUNO.map((item) => (
            <option key={item} value={item}>
              {ROTULO_STATUS[item]}
            </option>
          ))}
        </Select>
      </div>
      <div className="space-y-1.5 sm:col-span-2">
        <Label htmlFor="planoId-aluno">Plano de pagamento</Label>
        <Select id="planoId-aluno" name="planoId" defaultValue={aluno.planoId ?? ""}>
          <option value="">Sem plano</option>
          {planos.map((plano) => (
            <option key={plano.id} value={plano.id}>
              {rotuloPlano(plano)}
            </option>
          ))}
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="telefone-aluno">Telefone</Label>
        <Input id="telefone-aluno" name="telefone" defaultValue={aluno?.telefone ?? ""} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="diaVencimento-aluno">Vencimento da mensalidade</Label>
        <Input
          id="diaVencimento-aluno"
          name="diaVencimento"
          type="number"
          min="1"
          max="28"
          defaultValue={aluno.diaVencimento}
        />
      </div>
      <CampoUploadFoto
        id="fotoUrl-aluno"
        entidade="alunos"
        registroId={aluno.id}
        valorInicial={aluno.fotoUrl}
        onPendenteChange={setUploadPendente}
      />
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
        <div className="grid gap-3">
          {modalidades.map((modalidade) => {
            const selecionada = modalidadeIds.has(modalidade.id)
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
                    checked={selecionada}
                    onChange={(event) =>
                      alternarModalidade(modalidade.id, event.currentTarget.checked)
                    }
                  />
                  {modalidade.nome}
                </label>
                {selecionada && (
                  <Select
                    name={`plataformaModalidade:${modalidade.id}`}
                    defaultValue={cobrancas.get(modalidade.id) ?? ""}
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

      <fieldset className="space-y-3 rounded-md border border-border p-4 sm:col-span-2">
        <legend className="px-1 text-sm font-medium text-muted-foreground">
          Responsável (se menor de idade)
        </legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="respNome-aluno">Nome do responsável</Label>
            <Input
              id="respNome-aluno"
              name="respNome"
              defaultValue={aluno.responsavel?.nome ?? ""}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="respCpf-aluno">CPF do responsável</Label>
            <Input id="respCpf-aluno" name="respCpf" defaultValue={aluno.responsavel?.cpf ?? ""} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="respTelefone-aluno">Telefone</Label>
            <Input
              id="respTelefone-aluno"
              name="respTelefone"
              defaultValue={aluno.responsavel?.telefone ?? ""}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="respEmail-aluno">E-mail</Label>
            <Input
              id="respEmail-aluno"
              name="respEmail"
              type="email"
              defaultValue={aluno.responsavel?.email ?? ""}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="respParentesco-aluno">Parentesco</Label>
            <Input
              id="respParentesco-aluno"
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

      <div className="flex items-center gap-3 sm:col-span-2">
        <BotaoEnviar disabled={uploadPendente}>Salvar aluno</BotaoEnviar>
        {estado?.erro && <p className="text-sm text-destructive">{estado.erro}</p>}
      </div>
    </form>
  )
}

function paraDataInput(valor?: Date | null) {
  return valor ? formatarDataInput(valor) : ""
}

function rotuloPlano(plano: Plano) {
  const status = plano.ativo ? "" : " · inativo"
  return `${plano.nome} · ${formatarBRL(plano.valor)} · ${plano.periodicidade}${status}`
}

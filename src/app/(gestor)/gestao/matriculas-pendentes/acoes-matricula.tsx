"use client"

import { ExternalLink, ShieldCheck, UserRoundCheck } from "lucide-react"
import { useActionState, useEffect, useState } from "react"
import { acaoAprovarMatricula } from "@/app/actions/matriculas"
import { BotaoEnviar } from "@/components/ui/botao-enviar"
import { Button } from "@/components/ui/button"
import { Dialog } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select } from "@/components/ui/select"
import { formatarBRL, formatarCPF } from "@/lib/utils/formato"
import type { PlanoMatricula, SolicitacaoPendente } from "./lista-matriculas-pendentes"

export function AcoesMatricula({
  solicitacao,
  planos,
  competenciaAtual,
  dataHoje,
}: {
  solicitacao: SolicitacaoPendente
  planos: PlanoMatricula[]
  competenciaAtual: string
  dataHoje: string
}) {
  const [aberto, setAberto] = useState(false)
  return (
    <>
      <Button type="button" onClick={() => setAberto(true)} className="w-full lg:w-auto">
        <UserRoundCheck className="size-4" /> Analisar
      </Button>
      <Dialog
        aberto={aberto}
        aoFechar={() => setAberto(false)}
        variante="lateral"
        titulo="Aprovar matrícula"
        descricao="Confira os dados e vincule o plano que liberará o aluno."
      >
        <FormAprovacao
          solicitacao={solicitacao}
          planos={planos}
          competenciaAtual={competenciaAtual}
          dataHoje={dataHoje}
          aoConcluir={() => setAberto(false)}
        />
      </Dialog>
    </>
  )
}

function FormAprovacao({
  solicitacao,
  planos,
  competenciaAtual,
  dataHoje,
  aoConcluir,
}: {
  solicitacao: SolicitacaoPendente
  planos: PlanoMatricula[]
  competenciaAtual: string
  dataHoje: string
  aoConcluir: () => void
}) {
  const [estado, acao] = useActionState(acaoAprovarMatricula, undefined)
  const [confirmarPagamento, setConfirmarPagamento] = useState(false)

  useEffect(() => {
    if (estado?.ok) aoConcluir()
  }, [aoConcluir, estado?.ok])

  return (
    <form action={acao} className="space-y-6">
      <input type="hidden" name="solicitacaoId" value={solicitacao.id} />
      <input type="hidden" name="competenciaEsperada" value={competenciaAtual} />

      <section className="space-y-3 rounded-lg border border-border bg-muted/25 p-4">
        <div>
          <p className="font-semibold">{solicitacao.nome}</p>
          <p className="text-sm text-muted-foreground">{solicitacao.email}</p>
        </div>
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <Dado rotulo="Modalidade" valor={solicitacao.modalidade.nome} />
          <Dado rotulo="CPF" valor={solicitacao.cpf ? formatarCPF(solicitacao.cpf) : null} />
          <Dado rotulo="Telefone" valor={solicitacao.telefone} />
          <Dado rotulo="Endereço" valor={solicitacao.endereco} />
          <Dado rotulo="Emergência" valor={solicitacao.contatoEmergencia} />
          <Dado rotulo="Restrições médicas" valor={solicitacao.restricoesMedicas} />
        </dl>
      </section>

      <section className="space-y-3">
        <h3 className="text-sm font-semibold">Plano e vencimento</h3>
        <div className="space-y-1.5">
          <Label htmlFor={`plano-${solicitacao.id}`}>Plano de pagamento</Label>
          <Select id={`plano-${solicitacao.id}`} name="planoId" defaultValue="" required>
            <option value="">Selecione um plano</option>
            {planos.map((plano) => (
              <option key={plano.id} value={plano.id}>
                {plano.nome} · {formatarBRL(plano.valor)} · {plano.periodicidade}
              </option>
            ))}
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`vencimento-${solicitacao.id}`}>Dia de vencimento</Label>
          <Input
            id={`vencimento-${solicitacao.id}`}
            name="diaVencimento"
            type="number"
            min={1}
            max={28}
            defaultValue={10}
            required
          />
        </div>
      </section>

      <section className="space-y-3 rounded-lg border border-border p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold">Comprovante PIX</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              O anexo não dá baixa automaticamente.
            </p>
          </div>
          {solicitacao.comprovantePagamentoUrl ? (
            <Button asChild variant="outline" size="sm">
              <a
                href={`/api/comprovantes-matricula/${solicitacao.id}`}
                target="_blank"
                rel="noreferrer"
              >
                <ExternalLink className="size-4" /> Ver
              </a>
            </Button>
          ) : (
            <span className="text-xs text-muted-foreground">Não anexado</span>
          )}
        </div>

        {solicitacao.comprovantePagamentoUrl && (
          <label className="flex items-start gap-3 border-t border-border pt-3 text-sm">
            <input
              type="checkbox"
              name="comprovanteConfirmado"
              checked={confirmarPagamento}
              onChange={(evento) => setConfirmarPagamento(evento.currentTarget.checked)}
              className="mt-0.5 size-4 accent-primary"
            />
            <span>
              <span className="block font-medium">O comprovante confere</span>
              <span className="mt-1 block text-xs text-muted-foreground">
                Registrar a mensalidade inicial como paga via PIX.
              </span>
            </span>
          </label>
        )}
        {confirmarPagamento && (
          <div className="space-y-1.5">
            <Label htmlFor={`pago-em-${solicitacao.id}`}>Data do pagamento</Label>
            <Input
              id={`pago-em-${solicitacao.id}`}
              name="pagoEm"
              type="date"
              max={dataHoje}
              defaultValue={dataHoje}
              required
            />
          </div>
        )}
      </section>

      <div className="rounded-lg border border-primary/25 bg-primary/5 p-4 text-sm">
        <p className="flex items-center gap-2 font-medium">
          <ShieldCheck className="size-4 text-primary" /> O que acontece ao aprovar
        </p>
        <p className="mt-2 text-muted-foreground">
          A conta do aluno será criada, a modalidade e o plano serão vinculados e a mensalidade
          inicial será gerada. O check-in ainda exigirá o aceite do termo de responsabilidade.
        </p>
      </div>

      {estado?.erro && (
        <p className="text-sm text-destructive" role="alert">
          {estado.erro}
        </p>
      )}
      <BotaoEnviar size="lg" className="w-full">
        <UserRoundCheck className="size-4" /> Aprovar matrícula e liberar aluno
      </BotaoEnviar>
    </form>
  )
}

function Dado({ rotulo, valor }: { rotulo: string; valor: string | null }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{rotulo}</dt>
      <dd className="mt-0.5 break-words">{valor || "—"}</dd>
    </div>
  )
}

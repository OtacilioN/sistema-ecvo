"use client"

import { ExternalLink, ShieldCheck, UserRoundCheck } from "lucide-react"
import { useActionState, useEffect, useState } from "react"
import { acaoAprovarMatricula } from "@/app/actions/matriculas"
import { BotaoEnviar } from "@/components/ui/botao-enviar"
import { Button } from "@/components/ui/button"
import { Dialog } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { formatarBRL, formatarCPF } from "@/lib/utils/formato"
import type { SolicitacaoPendente } from "./lista-matriculas-pendentes"

export function AcoesMatricula({ solicitacao }: { solicitacao: SolicitacaoPendente }) {
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
        descricao="Confira os dados e conclua a aprovação do pagamento já confirmado."
      >
        <FormAprovacao solicitacao={solicitacao} aoConcluir={() => setAberto(false)} />
      </Dialog>
    </>
  )
}

function FormAprovacao({
  solicitacao,
  aoConcluir,
}: {
  solicitacao: SolicitacaoPendente
  aoConcluir: () => void
}) {
  const [estado, acao] = useActionState(acaoAprovarMatricula, undefined)

  useEffect(() => {
    if (estado?.ok) aoConcluir()
  }, [aoConcluir, estado?.ok])

  return (
    <form action={acao} className="space-y-6">
      <input type="hidden" name="solicitacaoId" value={solicitacao.id} />

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
        <div className="rounded-lg border border-success/30 bg-success/5 p-4">
          <p className="font-medium">{solicitacao.plano?.nome ?? "Plano não localizado"}</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {solicitacao.plano
              ? formatarBRL(solicitacao.cobrancasAsaas[0]?.valor ?? solicitacao.plano.valor)
              : "—"}
            {" · pagamento confirmado pelo Asaas"}
          </p>
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
      </section>

      <div className="rounded-lg border border-primary/25 bg-primary/5 p-4 text-sm">
        <p className="flex items-center gap-2 font-medium">
          <ShieldCheck className="size-4 text-primary" /> O que acontece ao aprovar
        </p>
        <p className="mt-2 text-muted-foreground">
          A conta do aluno será criada, a modalidade e o plano padrão serão vinculados e a primeira
          mensalidade ficará registrada como paga pelo Asaas. O comprovante opcional não gera baixa.
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

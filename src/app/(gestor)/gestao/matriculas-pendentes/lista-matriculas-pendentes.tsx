"use client"

import { BadgeCheck, CalendarClock, FileCheck2, Mail, Phone, UserRoundCheck } from "lucide-react"
import { useMemo, useState } from "react"
import { Badge } from "@/components/ui/badge"
import { CampoBusca } from "@/components/ui/campo-busca"
import { Card, CardContent } from "@/components/ui/card"
import { formatarDataHora } from "@/lib/utils/datas"
import { AcoesMatricula } from "./acoes-matricula"

export type SolicitacaoPendente = {
  id: string
  nome: string
  email: string
  cpf: string | null
  telefone: string | null
  dataNascimento: string | null
  endereco: string | null
  contatoEmergencia: string | null
  restricoesMedicas: string | null
  tipoPagamento: "MENSALISTA" | "AULA_AVULSA" | "WELLHUB" | "TOTALPASS"
  beneficioAtivoDeclarado: boolean
  comprovantePagamentoUrl: string | null
  comprovanteContentType: string | null
  comprovanteNomeOriginal: string | null
  criadoEm: string
  modalidade: { id: string; nome: string }
  aulaAvulsa: {
    id: string
    inicio: string
    fim: string
    turma: { nome: string | null; local: string | null }
  } | null
  plano: { id: string; nome: string; valor: number; periodicidade: string } | null
  cobrancasAsaas: Array<{
    asaasPaymentId: string | null
    valor: number
    competencia: string
    recebidaEmAsaas: Date | null
  }>
}

export function ListaMatriculasPendentes({
  solicitacoes,
  diaVencimentoPadrao,
}: {
  solicitacoes: SolicitacaoPendente[]
  diaVencimentoPadrao: number
}) {
  const [busca, setBusca] = useState("")
  const filtradas = useMemo(() => {
    const termo = busca.trim().toLowerCase()
    if (!termo) return solicitacoes
    return solicitacoes.filter((item) =>
      [item.nome, item.email, item.telefone, item.cpf, item.modalidade.nome, item.tipoPagamento]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(termo),
    )
  }, [busca, solicitacoes])

  return (
    <Card>
      <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:items-center sm:justify-between">
        <CampoBusca
          valor={busca}
          aoMudar={setBusca}
          placeholder="Nome, e-mail, CPF ou modalidade…"
        />
        <span className="text-sm text-muted-foreground">
          {filtradas.length} de {solicitacoes.length}
        </span>
      </div>
      <CardContent className="p-0">
        {filtradas.length === 0 ? (
          <div className="flex flex-col items-center px-5 py-14 text-center">
            <span className="flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
              <UserRoundCheck className="size-6" />
            </span>
            <p className="mt-4 font-semibold">
              {solicitacoes.length === 0
                ? "Nenhuma matrícula pendente"
                : "Nenhum resultado encontrado"}
            </p>
            <p className="mt-1 max-w-sm text-sm text-muted-foreground">
              {solicitacoes.length === 0
                ? "Novas solicitações aparecerão aqui para análise."
                : "Tente buscar por outro nome, contato ou modalidade."}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {filtradas.map((item) => (
              <article
                key={item.id}
                className="grid gap-4 p-4 transition-colors hover:bg-muted/30 sm:p-5 lg:grid-cols-[minmax(0,1.35fr)_minmax(180px,0.7fr)_auto] lg:items-center"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="truncate font-semibold">{item.nome}</h2>
                    <Badge variant="warning">Aguardando análise</Badge>
                    <Badge variant="outline">{rotuloTipo(item.tipoPagamento)}</Badge>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                    <span className="inline-flex items-center gap-1">
                      <Mail className="size-3.5" /> {item.email}
                    </span>
                    {item.telefone && (
                      <span className="inline-flex items-center gap-1">
                        <Phone className="size-3.5" /> {item.telefone}
                      </span>
                    )}
                  </div>
                </div>
                <div className="space-y-2 text-sm">
                  <Badge variant="outline">{item.modalidade.nome}</Badge>
                  <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <CalendarClock className="size-3.5" /> Enviada em{" "}
                    {formatarDataHora(new Date(item.criadoEm))}
                  </p>
                  {item.tipoPagamento === "MENSALISTA" ? (
                    <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <FileCheck2 className="size-3.5" />{" "}
                      {item.comprovantePagamentoUrl ? "Comprovante anexado" : "Sem comprovante"}
                    </p>
                  ) : item.tipoPagamento === "AULA_AVULSA" && item.aulaAvulsa ? (
                    <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <CalendarClock className="size-3.5" />
                      {formatarDataHora(new Date(item.aulaAvulsa.inicio))}
                    </p>
                  ) : (
                    <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <BadgeCheck className="size-3.5" /> Benefício ativo declarado
                    </p>
                  )}
                </div>
                <AcoesMatricula solicitacao={item} diaVencimentoPadrao={diaVencimentoPadrao} />
              </article>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function rotuloTipo(tipo: SolicitacaoPendente["tipoPagamento"]) {
  if (tipo === "AULA_AVULSA") return "Aula avulsa"
  if (tipo === "WELLHUB") return "Wellhub"
  if (tipo === "TOTALPASS") return "TotalPass"
  return "Mensalista"
}

import { CheckCircle2, Clock3, QrCode, RefreshCw, ShieldCheck } from "lucide-react"
import type { Metadata } from "next"
import { notFound, redirect } from "next/navigation"
import QRCode from "qrcode"
import {
  acaoGerarPagamentoMatricula,
  acaoReemitirPagamentoMatricula,
} from "@/app/actions/matriculas"
import { AvisoBonusAdimplencia } from "@/components/aviso-bonus-adimplencia"
import { Marca } from "@/components/marca"
import { BotaoEnviar } from "@/components/ui/botao-enviar"
import { Card, CardContent } from "@/components/ui/card"
import {
  obterPagamentoMatriculaPublico,
  pixCobrancaMatriculaDisponivel,
} from "@/lib/services/pagamento-matricula.service"
import { formatarDataHora } from "@/lib/utils/datas"
import { formatarBRL } from "@/lib/utils/formato"
import { AtualizadorPagamento, CopiarPix } from "./atualizador-pagamento"

export const metadata: Metadata = { title: "Pagamento da matrícula" }
export const dynamic = "force-dynamic"

export default async function PagamentoMatriculaPage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  const solicitacao = await obterPagamentoMatriculaPublico(token)
  if (solicitacao?.matriculaFamilia)
    redirect(`/matricula/familia/pagamento/${solicitacao.matriculaFamilia.tokenAcompanhamento}`)
  if (
    !solicitacao?.plano ||
    (solicitacao.tipoPagamento !== "MENSALISTA" && solicitacao.tipoPagamento !== "AULA_AVULSA")
  )
    notFound()
  const aulaAvulsa = solicitacao.tipoPagamento === "AULA_AVULSA"
  const cobranca = solicitacao.cobrancasAsaas[0] ?? null
  const pagamentoConfirmado = cobranca?.status === "RECEBIDA"
  const aprovada = solicitacao.status === "APROVADA"
  const pagamentoEstornado = cobranca?.status === "ESTORNADA"
  const rejeitada = solicitacao.status === "REJEITADA"
  const pixDisponivel = cobranca ? pixCobrancaMatriculaDisponivel(cobranca) : false
  const qrCodeDataUrl =
    pixDisponivel && cobranca?.pixCopiaECola
      ? await QRCode.toDataURL(cobranca.pixCopiaECola, { margin: 1 })
      : null

  return (
    <main className="w-full max-w-2xl py-4">
      <AtualizadorPagamento ativo={!pagamentoConfirmado && !pagamentoEstornado && !rejeitada} />
      <div className="mb-6 flex justify-center">
        <Marca tamanho={56} />
      </div>
      <Card className="overflow-hidden">
        <div className="h-1.5 bg-primary" />
        <CardContent className="space-y-6 py-8 sm:px-8">
          <div className="text-center">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">
              {aulaAvulsa ? "Aula avulsa" : "Primeira mensalidade"}
            </p>
            <h1 className="mt-2 text-2xl font-bold tracking-tight">
              {pagamentoEstornado
                ? "Pagamento estornado"
                : rejeitada
                  ? "Solicitação não aprovada"
                  : pagamentoConfirmado
                    ? "Pagamento confirmado"
                    : "Conclua o pagamento PIX"}
            </h1>
            <p className="mt-3 text-sm text-muted-foreground">
              {aulaAvulsa
                ? solicitacao.aulaAvulsa
                  ? `${solicitacao.aulaAvulsa.turma.modalidade.nome} · ${formatarDataHora(solicitacao.aulaAvulsa.inicio)}`
                  : "Aula avulsa"
                : solicitacao.plano.nome}{" "}
              · {formatarBRL(Number(cobranca?.valor ?? solicitacao.plano.valor))}
            </p>
            {!aulaAvulsa && (
              <AvisoBonusAdimplencia
                valorComBonus={Number(cobranca?.valor ?? solicitacao.plano.valor)}
                valorBase={Number(solicitacao.plano.valorBase ?? solicitacao.plano.valor)}
                className="mt-2"
              />
            )}
          </div>

          {pagamentoEstornado || rejeitada ? (
            <p className="text-center text-sm text-muted-foreground">
              {pagamentoEstornado
                ? "O pagamento foi estornado. Entre em contato com a equipe para mais informações."
                : "A solicitação não foi aprovada. Entre em contato com a equipe para mais informações."}
            </p>
          ) : pagamentoConfirmado ? (
            <div className="space-y-4 text-center">
              <CheckCircle2 className="mx-auto size-14 text-success" />
              <p className="text-sm leading-relaxed text-muted-foreground">
                {aprovada
                  ? aulaAvulsa
                    ? "O Asaas confirmou os R$ 20,00 da aula avulsa. Sua matrícula foi aprovada e o acesso à aula escolhida está liberado."
                    : "O Asaas confirmou a primeira mensalidade e sua matrícula foi aprovada."
                  : solicitacao.descontoAlunoAntigo
                    ? "O Asaas confirmou a primeira mensalidade. Sua matrícula aguarda análise da equipe antes da liberação do acesso."
                    : "O pagamento foi confirmado e a matrícula está sendo processada."}
              </p>
            </div>
          ) : pixDisponivel && qrCodeDataUrl && cobranca?.pixCopiaECola ? (
            <div className="grid gap-5 sm:grid-cols-[210px_1fr] sm:items-center">
              {/* biome-ignore lint/performance/noImgElement: data URL não é otimizada pelo Next Image */}
              <img
                src={qrCodeDataUrl}
                alt={
                  aulaAvulsa ? "QR Code PIX da aula avulsa" : "QR Code PIX da primeira mensalidade"
                }
                width={210}
                height={210}
                className="mx-auto rounded-xl border border-border bg-white p-2"
              />
              <div className="min-w-0 space-y-3">
                <p className="text-sm font-medium">PIX Copia e Cola</p>
                <p className="break-all rounded-md bg-muted p-3 font-mono text-xs">
                  {cobranca.pixCopiaECola}
                </p>
                <div className="flex flex-wrap gap-2">
                  <CopiarPix payload={cobranca.pixCopiaECola} />
                  <form action={acaoGerarPagamentoMatricula}>
                    <input type="hidden" name="token" value={token} />
                    <BotaoEnviar variant="outline">
                      <RefreshCw className="size-4" /> Já paguei, verificar
                    </BotaoEnviar>
                  </form>
                </div>
                <p className="flex items-start gap-2 text-xs text-muted-foreground">
                  <Clock3 className="mt-0.5 size-4 shrink-0" /> Esta página verifica automaticamente
                  a confirmação do Asaas.
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-4 rounded-lg border border-border bg-muted/30 p-5 text-center">
              <QrCode className="mx-auto size-8 text-primary" />
              <p className="text-sm text-muted-foreground">
                {cobranca?.ultimoErro ?? "O QR Code ainda não está disponível."}
              </p>
              <form action={acaoReemitirPagamentoMatricula}>
                <input type="hidden" name="token" value={token} />
                <BotaoEnviar>
                  <RefreshCw className="size-4" /> Atualizar cobrança PIX
                </BotaoEnviar>
              </form>
            </div>
          )}

          {!pagamentoEstornado && !rejeitada && (
            <div className="flex items-start gap-3 rounded-lg border border-border bg-muted/20 p-4 text-sm">
              <ShieldCheck className="mt-0.5 size-5 shrink-0 text-primary" />
              <p className="text-muted-foreground">
                {solicitacao.descontoAlunoAntigo
                  ? "Após a confirmação do pagamento pelo Asaas, a equipe analisa a matrícula antes de liberar o acesso."
                  : "A matrícula é liberada após a confirmação integrada do pagamento pelo Asaas."}
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </main>
  )
}

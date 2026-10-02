import { CheckCircle2, QrCode, RefreshCw } from "lucide-react"
import type { Metadata } from "next"
import { notFound } from "next/navigation"
import QRCode from "qrcode"
import {
  acaoGerarPagamentoMatriculaFamilia,
  acaoReemitirPagamentoMatriculaFamilia,
} from "@/app/actions/matriculas"
import { Marca } from "@/components/marca"
import { BotaoEnviar } from "@/components/ui/botao-enviar"
import { Card, CardContent } from "@/components/ui/card"
import { obterMatriculaFamiliaPublica } from "@/lib/services/matricula-familia.service"
import { pixCobrancaMatriculaDisponivel } from "@/lib/services/pagamento-matricula.service"
import { formatarBRL } from "@/lib/utils/formato"
import { AtualizadorPagamento, CopiarPix } from "../../../pagamento/[token]/atualizador-pagamento"

export const metadata: Metadata = { title: "Pagamento da matrícula plano família" }
export const dynamic = "force-dynamic"

export default async function PagamentoMatriculaFamiliaPage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  const familia = await obterMatriculaFamiliaPublica(token)
  if (!familia || familia.pessoas.length < 2 || familia.pessoas.length > 4) notFound()
  const titular = familia.pessoas.find((pessoa) => pessoa.id === familia.titularSolicitacaoId)
  if (!titular?.plano) notFound()
  const cobranca = titular.cobrancasAsaas[0] ?? null
  const aprovada = familia.pessoas.every((pessoa) => pessoa.status === "APROVADA")
  const estornada = cobranca?.status === "ESTORNADA" || cobranca?.statusAsaas === "REFUNDED"
  const estornoParcial = cobranca?.statusAsaas === "PARTIALLY_REFUNDED"
  const confirmada = aprovada && cobranca?.status === "RECEBIDA" && !estornoParcial
  const pixDisponivel = cobranca ? pixCobrancaMatriculaDisponivel(cobranca) : false
  const imagemQr =
    pixDisponivel && cobranca?.pixCopiaECola
      ? await QRCode.toDataURL(cobranca.pixCopiaECola, { margin: 1 })
      : null
  const total = cobranca
    ? Number(cobranca.valor)
    : Number(titular.plano.valor) * familia.pessoas.length
  const unitario = total / familia.pessoas.length

  return (
    <main className="w-full max-w-2xl py-4">
      <AtualizadorPagamento ativo={!confirmada && !estornada && !estornoParcial} />
      <div className="mb-6 flex justify-center">
        <Marca tamanho={56} />
      </div>
      <Card className="overflow-hidden">
        <div className="h-1.5 bg-primary" />
        <CardContent className="space-y-6 py-8 sm:px-8">
          <div className="text-center">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">
              Matrícula plano família
            </p>
            <h1 className="mt-2 text-2xl font-bold tracking-tight">
              {estornada
                ? "Pagamento estornado"
                : estornoParcial
                  ? "Pagamento em conciliação"
                  : confirmada
                    ? "Matrícula família confirmada"
                    : "Conclua o pagamento PIX"}
            </h1>
            <p className="mt-3 text-sm text-muted-foreground">
              {titular.plano.nome} · {familia.pessoas.length} pessoas × {formatarBRL(unitario)}
            </p>
            <p className="mt-2 text-3xl font-bold tabular-nums">{formatarBRL(total)}</p>
            <p className="mt-2 text-xs text-muted-foreground">
              Um único PIX para todas as pessoas da matrícula.
            </p>
          </div>
          <ul className="divide-y divide-border rounded-lg border border-border px-4">
            {familia.pessoas.map((pessoa) => (
              <li key={pessoa.id} className="flex flex-wrap justify-between gap-2 py-3 text-sm">
                <span>{pessoa.nome}</span>
                <span className="text-muted-foreground">{formatarBRL(unitario)}</span>
              </li>
            ))}
          </ul>
          {estornada || estornoParcial ? (
            <p
              role="status"
              className="rounded-lg border border-border bg-muted/30 p-5 text-center text-sm text-muted-foreground"
            >
              {estornoParcial
                ? "O pagamento teve estorno parcial. Entre em contato com a ECVO para conciliar as mensalidades da família."
                : "O pagamento da família foi estornado. Entre em contato com a ECVO para regularizar as mensalidades."}
            </p>
          ) : confirmada ? (
            <div className="space-y-3 text-center">
              <CheckCircle2 className="mx-auto size-14 text-success" />
              <p className="text-sm text-muted-foreground">
                O Asaas confirmou o pagamento total. Todas as pessoas foram matriculadas e já podem
                acessar suas contas.
              </p>
            </div>
          ) : cobranca?.status === "RECEBIDA" ? (
            <p role="status" className="text-center text-sm text-muted-foreground">
              Pagamento recebido. A matrícula de todas as pessoas está sendo concluída.
            </p>
          ) : pixDisponivel && imagemQr && cobranca?.pixCopiaECola ? (
            <div className="grid gap-5 sm:grid-cols-[210px_1fr] sm:items-center">
              {/* biome-ignore lint/performance/noImgElement: QR Code gerado como data URL */}
              <img
                src={imagemQr}
                alt="QR Code PIX do total da matrícula família"
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
                  <form action={acaoGerarPagamentoMatriculaFamilia}>
                    <input type="hidden" name="token" value={token} />
                    <BotaoEnviar variant="outline">
                      <RefreshCw className="size-4" />
                      Já paguei, verificar
                    </BotaoEnviar>
                  </form>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-4 rounded-lg border border-border bg-muted/30 p-5 text-center">
              <QrCode className="mx-auto size-8 text-primary" />
              <p className="text-sm text-muted-foreground">
                {cobranca?.ultimoErro ?? "O QR Code ainda não está disponível."}
              </p>
              <form action={acaoReemitirPagamentoMatriculaFamilia}>
                <input type="hidden" name="token" value={token} />
                <BotaoEnviar>
                  <RefreshCw className="size-4" />
                  Atualizar cobrança PIX
                </BotaoEnviar>
              </form>
            </div>
          )}
          <p className="text-center text-xs text-muted-foreground">
            Cada pessoa terá seu próprio acesso e vínculo ao plano. A liberação ocorre após a
            confirmação do pagamento total pelo Asaas.
          </p>
        </CardContent>
      </Card>
    </main>
  )
}

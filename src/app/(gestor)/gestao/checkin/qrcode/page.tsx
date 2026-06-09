import { QrCode, RotateCcw } from "lucide-react"
import { headers } from "next/headers"
import Image from "next/image"
import QRCode from "qrcode"
import { acaoRotacionarTokenCheckinAcademia } from "@/app/actions/checkin-qrcode"
import { Marca } from "@/components/marca"
import { Badge } from "@/components/ui/badge"
import { BotaoEnviar } from "@/components/ui/botao-enviar"
import { CabecalhoPagina } from "@/components/ui/cabecalho-pagina"
import { Card, CardContent } from "@/components/ui/card"
import { exigirPapel } from "@/lib/auth/dal"
import {
  mascararTokenCheckin,
  obterOuCriarTokenCheckinAcademia,
} from "@/lib/services/checkin-token.service"
import { formatarDataHora } from "@/lib/utils/datas"
import { AcoesQRCode } from "./acoes-qrcode"

export const dynamic = "force-dynamic"

function primeiroHeader(valor: string | null) {
  return valor?.split(",")[0]?.trim()
}

async function origemDaRequisicao() {
  const lista = await headers()
  const host =
    primeiroHeader(lista.get("x-forwarded-host")) ?? lista.get("host") ?? "localhost:3000"
  const protocolo =
    primeiroHeader(lista.get("x-forwarded-proto")) ??
    (host.startsWith("localhost") ? "http" : "https")

  return `${protocolo}://${host}`
}

export default async function QrCodeCheckinPage() {
  await exigirPapel("GESTOR")
  const token = await obterOuCriarTokenCheckinAcademia()
  const url = `${await origemDaRequisicao()}/aluno/checkin?token=${encodeURIComponent(token.token)}`
  const qrDataUrl = await QRCode.toDataURL(url, {
    errorCorrectionLevel: "H",
    margin: 2,
    width: 900,
  })

  return (
    <div className="space-y-6 print:m-0 print:space-y-0 print:bg-white">
      <style>{`
        @media print {
          @page {
            size: A4;
            margin: 0;
          }
        }
      `}</style>

      <div className="print:hidden">
        <CabecalhoPagina
          titulo="QR de check-in"
          descricao="Código global da academia para check-in dos alunos na entrada."
        >
          <AcoesQRCode qrDataUrl={qrDataUrl} />
          <form action={acaoRotacionarTokenCheckinAcademia}>
            <BotaoEnviar variant="destructive">
              <RotateCcw className="size-4" /> Rotacionar token
            </BotaoEnviar>
          </form>
        </CabecalhoPagina>
      </div>

      <Card className="print:hidden">
        <CardContent className="flex flex-col gap-3 py-4 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary">Token {mascararTokenCheckin(token.token)}</Badge>
            <span>Atualizado em {formatarDataHora(token.atualizadoEm)}</span>
          </div>
          <p className="break-all font-mono text-xs">{url}</p>
        </CardContent>
      </Card>

      <section className="mx-auto flex min-h-[72vh] w-full max-w-3xl flex-col items-center justify-center border border-border bg-white px-6 py-10 text-center shadow-sm print:m-0 print:h-[297mm] print:min-h-0 print:w-[210mm] print:max-w-none print:break-inside-avoid print:border-0 print:p-[16mm] print:shadow-none">
        <div className="mb-8">
          <Marca tamanho={72} className="justify-center" />
        </div>

        <div className="mb-6 flex items-center gap-2 rounded-full border border-border px-4 py-2 text-sm font-medium uppercase tracking-[0.18em] text-muted-foreground">
          <QrCode className="size-4" />
          Entrada ECVO
        </div>

        <h2 className="text-4xl font-black tracking-tight text-foreground sm:text-5xl">
          Faça o check-in
        </h2>
        <p className="mt-3 max-w-xl text-lg text-muted-foreground">
          Leia este QR Code com o celular e confirme a aula liberada no horário.
        </p>

        <div className="my-10 rounded-xl border-8 border-black bg-white p-4 print:my-14">
          <Image
            src={qrDataUrl}
            alt="QR Code global de check-in da ECVO"
            width={520}
            height={520}
            unoptimized
            priority
            className="aspect-square w-[min(72vw,520px)] print:w-[138mm]"
          />
        </div>

        <p className="max-w-lg text-balance text-base font-medium text-foreground">
          Check-in disponível de 30 minutos antes até o fim do horário da aula.
        </p>
      </section>
    </div>
  )
}

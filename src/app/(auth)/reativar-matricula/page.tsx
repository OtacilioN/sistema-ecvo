import { redirect } from "next/navigation"
import QRCode from "qrcode"
import { sair } from "@/app/actions/auth"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { exigirAlunoTrancado } from "@/lib/auth/dal"
import { db } from "@/lib/db"
import { gerarCobrancaPixMensal } from "@/lib/services/asaas.service"
import { prepararMensalidadeReativacao } from "@/lib/services/matricula-trancada.service"
import { formatarBRL } from "@/lib/utils/formato"
import { PagamentoReativacao } from "./pagamento-reativacao"

export const dynamic = "force-dynamic"

export default async function Page() {
  const { alunoId, usuario } = await exigirAlunoTrancado()
  const resultado = await prepararMensalidadeReativacao({ alunoId, autorId: usuario.id })
  let erro: string | undefined
  let pixCopiaECola: string | null = null
  let qrCodeDataUrl: string | null = null
  if (!resultado.ok) {
    erro = resultado.motivo
  } else {
    const existente = await db.cobrancaAsaas.findFirst({
      where: { mensalidadeId: resultado.mensalidade.id, ativa: true },
      orderBy: { geracao: "desc" },
    })
    const qrValido =
      existente?.pixCopiaECola && existente.qrCodeExpiraEm && existente.qrCodeExpiraEm > new Date()
    const cobranca = qrValido
      ? { ok: true as const, cobranca: existente }
      : await gerarCobrancaPixMensal({
          alunoId,
          autorId: usuario.id,
          mensalidadeId: resultado.mensalidade.id,
        })
    // A consulta remota pode ter recebido o pagamento durante esta renderização.
    const aluno = await db.aluno.findUnique({ where: { id: alunoId }, select: { status: true } })
    if (aluno?.status === "ATIVO" || aluno?.status === "INADIMPLENTE") redirect("/aluno")
    if (!cobranca.ok) erro = cobranca.motivo
    else if (
      cobranca.cobranca.pixCopiaECola &&
      cobranca.cobranca.qrCodeExpiraEm &&
      cobranca.cobranca.qrCodeExpiraEm > new Date()
    ) {
      pixCopiaECola = cobranca.cobranca.pixCopiaECola
      qrCodeDataUrl = await QRCode.toDataURL(pixCopiaECola, { margin: 1 })
    }
  }

  return (
    <Card className="w-full max-w-xl">
      <CardHeader>
        <CardTitle>Matrícula trancada</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <p className="text-sm text-muted-foreground">
          {usuario.nome}, sua matrícula está trancada. Para reativar seu acesso, é necessário pagar
          a mensalidade.
        </p>
        {resultado.ok && (
          <div className="rounded-lg bg-muted p-4">
            <p className="font-semibold">
              Mensalidade: {formatarBRL(Number(resultado.mensalidade.valor))}
            </p>
            <p className="text-sm text-muted-foreground">{resultado.plano.nome}</p>
            <p className="mt-2 text-sm">
              Após o recebimento do PIX, sua matrícula e seu acesso serão reativados
              automaticamente.
            </p>
          </div>
        )}
        {erro && (
          <p role="alert" className="text-sm text-destructive">
            {erro}
          </p>
        )}
        <PagamentoReativacao
          mensalidadeId={resultado.ok ? resultado.mensalidade.id : undefined}
          pixCopiaECola={pixCopiaECola}
          qrCodeDataUrl={qrCodeDataUrl}
        />
        <form action={sair}>
          <button type="submit" className="text-sm text-muted-foreground underline">
            Sair da conta
          </button>
        </form>
      </CardContent>
    </Card>
  )
}

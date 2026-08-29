import { mensagemErroAsaasSegura, tokenWebhookValido } from "@/lib/asaas/seguranca"
import {
  processarCobrancasPixAutomaticoPendentes,
  reconciliarPendenciasAsaas,
} from "@/lib/services/asaas.service"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

export async function GET(request: Request) {
  const segredo = process.env.CRON_SECRET
  if (!segredo) {
    return Response.json({ erro: "CRON_SECRET não configurado." }, { status: 500 })
  }
  if (!tokenWebhookValido(request.headers.get("authorization"), `Bearer ${segredo}`)) {
    return Response.json({ erro: "Não autorizado." }, { status: 401 })
  }

  let reconciliacao: Awaited<ReturnType<typeof reconciliarPendenciasAsaas>> | null = null
  let criacao: Awaited<ReturnType<typeof processarCobrancasPixAutomaticoPendentes>> | null = null
  const erros: Array<{ etapa: "RECONCILIACAO" | "CRIACAO"; motivo: string }> = []

  try {
    reconciliacao = await reconciliarPendenciasAsaas()
    if (!reconciliacao.ok) {
      erros.push({ etapa: "RECONCILIACAO", motivo: "Existem itens pendentes de conciliação." })
    }
  } catch (erro) {
    erros.push({ etapa: "RECONCILIACAO", motivo: mensagemErroAsaasSegura(erro) })
  }

  try {
    criacao = await processarCobrancasPixAutomaticoPendentes()
    if (!criacao.ok) {
      erros.push({ etapa: "CRIACAO", motivo: "Existem cobranças que não puderam ser criadas." })
    }
  } catch (erro) {
    erros.push({ etapa: "CRIACAO", motivo: mensagemErroAsaasSegura(erro) })
  }

  return Response.json({ reconciliacao, criacao, erros }, { status: erros.length > 0 ? 500 : 200 })
}

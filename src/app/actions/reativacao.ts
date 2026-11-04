"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { exigirAlunoTrancado } from "@/lib/auth/dal"
import { db } from "@/lib/db"
import {
  gerarCobrancaPixMensal,
  verificarPagamentoReativacaoAsaas,
} from "@/lib/services/asaas.service"
import {
  prepararCobrancaReativacaoAvulsa,
  verificarPagamentoCobrancaReativacao,
} from "@/lib/services/cobranca-reativacao.service"
import { prepararMensalidadeReativacao } from "@/lib/services/matricula-trancada.service"

export type EstadoReativacao = { erro?: string; mensagem?: string } | undefined

export async function acaoPrepararReativacao(
  _: EstadoReativacao,
  _formData: FormData,
): Promise<EstadoReativacao> {
  const { alunoId, usuario } = await exigirAlunoTrancado()
  const resultado = await prepararMensalidadeReativacao({ alunoId, autorId: usuario.id })
  if (!resultado.ok) {
    if (!("exigeCobrancaAvulsa" in resultado && resultado.exigeCobrancaAvulsa))
      return { erro: resultado.motivo }
    const cobranca = await prepararCobrancaReativacaoAvulsa({ alunoId, autorId: usuario.id })
    if (!cobranca.ok) return { erro: cobranca.motivo }
    revalidatePath("/reativar-matricula")
    return { mensagem: "PIX atualizado. A matrícula será reativada após o recebimento." }
  }
  const cobranca = await gerarCobrancaPixMensal({
    alunoId,
    autorId: usuario.id,
    mensalidadeId: resultado.mensalidade.id,
  })
  revalidatePath("/reativar-matricula")
  if (!cobranca.ok) return { erro: cobranca.motivo }
  return { mensagem: "PIX atualizado. A matrícula será reativada após o recebimento." }
}

export async function acaoVerificarReativacao(
  _: EstadoReativacao,
  formData: FormData,
): Promise<EstadoReativacao> {
  const { alunoId } = await exigirAlunoTrancado()
  const mensalidadeId = formData.get("mensalidadeId")
  const cobrancaId = formData.get("cobrancaReativacaoId")
  const resultado =
    typeof cobrancaId === "string" && cobrancaId
      ? await verificarPagamentoCobrancaReativacao({ alunoId, cobrancaId })
      : typeof mensalidadeId === "string" && mensalidadeId
        ? await verificarPagamentoReativacaoAsaas({ alunoId, mensalidadeId })
        : { ok: false as const, motivo: "Cobrança inválida." }
  if (!resultado.ok) return { erro: resultado.motivo }
  const aluno = await db.aluno.findUnique({ where: { id: alunoId }, select: { status: true } })
  revalidatePath("/reativar-matricula")
  revalidatePath("/aluno")
  revalidatePath("/gestao/alunos")
  revalidatePath("/gestao/financeiro")
  if (aluno?.status === "ATIVO" || aluno?.status === "INADIMPLENTE") redirect("/aluno")
  return {
    mensagem: "O pagamento ainda não foi recebido. A confirmação será feita automaticamente.",
  }
}

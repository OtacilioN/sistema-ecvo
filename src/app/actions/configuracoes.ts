"use server"

import { revalidatePath } from "next/cache"
import { exigirPapel } from "@/lib/auth/dal"
import { atualizarConfiguracaoAcademia } from "@/lib/services/configuracao.service"
import { configuracaoAcademiaSchema } from "@/lib/validations/configuracao"

export type EstadoConfiguracao = { erro?: string; ok?: boolean } | undefined

export async function acaoAtualizarConfiguracao(
  _: EstadoConfiguracao,
  formData: FormData,
): Promise<EstadoConfiguracao> {
  const usuario = await exigirPapel("GESTOR")
  const parsed = configuracaoAcademiaSchema.safeParse({
    janelaComparecimentoHoras: formData.get("janelaComparecimentoHoras"),
    prazoCancelamentoHoras: formData.get("prazoCancelamentoHoras"),
    exigirComparecimentoParaCheckin: formData.get("exigirComparecimentoParaCheckin") === "on",
    politicaCheckinSemComparecimento: formData.get("politicaCheckinSemComparecimento"),
    bloqueioInadimplencia: formData.get("bloqueioInadimplencia"),
    listaEsperaAtiva: formData.get("listaEsperaAtiva") === "on",
    rankingHorasAtivo: formData.get("rankingHorasAtivo") === "on",
    notificarComparecimento: formData.get("notificarComparecimento") === "on",
    notificarLembreteTreino: formData.get("notificarLembreteTreino") === "on",
    notificarLembreteAgendamento: formData.get("notificarLembreteAgendamento") === "on",
    notificarCancelamentoAula: formData.get("notificarCancelamentoAula") === "on",
    notificarFinanceiro: formData.get("notificarFinanceiro") === "on",
    notificarGraduacao: formData.get("notificarGraduacao") === "on",
    notificarCheckinInvalidado: formData.get("notificarCheckinInvalidado") === "on",
    notificarAniversario: formData.get("notificarAniversario") === "on",
    valorBaseModalidade: formData.get("valorBaseModalidade"),
  })

  if (!parsed.success) {
    return { erro: parsed.error.issues[0]?.message ?? "Configuração inválida." }
  }

  await atualizarConfiguracaoAcademia({ autorId: usuario.id, dados: parsed.data })
  revalidatePath("/gestao/configuracoes")
  return { ok: true }
}

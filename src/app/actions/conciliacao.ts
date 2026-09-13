"use server"

import { revalidatePath } from "next/cache"
import { exigirPapel } from "@/lib/auth/dal"
import { ErroArquivoConciliacao, lerArquivosConciliacao } from "@/lib/conciliacao/arquivos"
import {
  ErroImportacaoConciliacao,
  importarPlanilhasConciliacao,
  resolverConciliacaoManual,
} from "@/lib/services/conciliacao.service"
import { importarConciliacaoSchema, resolverConciliacaoSchema } from "@/lib/validations/conciliacao"

export type EstadoConciliacao = { erro?: string; ok?: boolean } | undefined

export async function acaoImportarConciliacao(
  _: EstadoConciliacao,
  formData: FormData,
): Promise<EstadoConciliacao> {
  const usuario = await exigirPapel("GESTOR")
  const parsed = importarConciliacaoSchema.safeParse({
    plataforma: formData.get("plataforma"),
    competencia: formData.get("competencia"),
  })
  if (!parsed.success) return { erro: parsed.error.issues[0]?.message ?? "Dados inválidos." }

  try {
    await importarPlanilhasConciliacao({
      ...parsed.data,
      arquivos: await lerArquivosConciliacao(formData),
      autorId: usuario.id,
    })
  } catch (erro) {
    return {
      erro:
        erro instanceof ErroImportacaoConciliacao || erro instanceof ErroArquivoConciliacao
          ? erro.message
          : "Não foi possível importar as planilhas.",
    }
  }
  revalidatePath("/gestao/conciliacao")
  revalidatePath("/gestao/financeiro")
  revalidatePath("/gestao/financeiro/repasses")
  return { ok: true }
}

export async function acaoResolverConciliacao(
  _: EstadoConciliacao,
  formData: FormData,
): Promise<EstadoConciliacao> {
  const usuario = await exigirPapel("GESTOR")
  const parsed = resolverConciliacaoSchema.safeParse({
    registroId: formData.get("registroId"),
    alunoId: formData.get("alunoId"),
    checkinId: formData.get("checkinId"),
    status: formData.get("status"),
    observacao: formData.get("observacao"),
  })
  if (!parsed.success) return { erro: parsed.error.issues[0]?.message ?? "Dados inválidos." }

  try {
    const resultado = await resolverConciliacaoManual({
      ...parsed.data,
      autorId: usuario.id,
    })
    if (!resultado.ok) return { erro: resultado.motivo }
  } catch (erro) {
    return {
      erro:
        erro instanceof ErroImportacaoConciliacao || erro instanceof ErroArquivoConciliacao
          ? erro.message
          : "Não foi possível resolver o registro.",
    }
  }
  revalidatePath("/gestao/conciliacao")
  revalidatePath("/gestao/financeiro")
  revalidatePath("/gestao/financeiro/repasses")
  return { ok: true }
}

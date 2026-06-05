"use server"

import { revalidatePath } from "next/cache"
import { exigirPapel } from "@/lib/auth/dal"
import {
  importarPlanilhaConciliacao,
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
  })
  if (!parsed.success) return { erro: parsed.error.issues[0]?.message ?? "Dados inválidos." }

  const arquivo = formData.get("arquivo")
  if (!(arquivo instanceof File) || arquivo.size === 0) {
    return { erro: "Envie um arquivo CSV ou XLSX." }
  }
  const tipoArquivo = tipoArquivoConciliacao(arquivo.name)
  if (!tipoArquivo) {
    return { erro: "Envie uma planilha CSV ou XLSX." }
  }

  await importarPlanilhaConciliacao({
    plataforma: parsed.data.plataforma,
    arquivo: arquivo.name,
    conteudo:
      tipoArquivo === "csv" ? await arquivo.text() : Buffer.from(await arquivo.arrayBuffer()),
    tipoArquivo,
    autorId: usuario.id,
  })
  revalidatePath("/gestao/conciliacao")
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

  const resultado = await resolverConciliacaoManual({
    ...parsed.data,
    autorId: usuario.id,
  })
  revalidatePath("/gestao/conciliacao")
  if (!resultado.ok) return { erro: resultado.motivo }
  return { ok: true }
}

function tipoArquivoConciliacao(nome: string): "csv" | "xlsx" | null {
  const arquivo = nome.toLowerCase()
  if (arquivo.endsWith(".csv")) return "csv"
  if (arquivo.endsWith(".xlsx")) return "xlsx"
  return null
}

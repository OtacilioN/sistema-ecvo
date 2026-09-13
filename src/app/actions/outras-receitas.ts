"use server"

import { revalidatePath } from "next/cache"
import { exigirPapel } from "@/lib/auth/dal"
import {
  CAMPOS_OUTRAS_RECEITAS,
  outrasReceitasMensaisSchema,
} from "@/lib/financeiro/outras-receitas"
import { salvarOutrasReceitasMensais } from "@/lib/services/outras-receitas.service"

export type EstadoOutrasReceitas = { erro?: string; ok?: boolean } | undefined

export async function acaoSalvarOutrasReceitas(
  _: EstadoOutrasReceitas,
  formData: FormData,
): Promise<EstadoOutrasReceitas> {
  const usuario = await exigirPapel("GESTOR")
  const valores = Object.fromEntries(
    CAMPOS_OUTRAS_RECEITAS.map(({ nome }) => {
      const valor = formData.get(nome)
      return [nome, typeof valor === "string" && valor.trim() !== "" ? Number(valor) : NaN]
    }),
  )
  const parsed = outrasReceitasMensaisSchema.safeParse({
    competencia: formData.get("competencia"),
    ...valores,
  })
  if (!parsed.success) {
    return { erro: parsed.error.issues[0]?.message ?? "Revise as receitas informadas." }
  }

  try {
    await salvarOutrasReceitasMensais(usuario.id, parsed.data)
  } catch {
    return { erro: "Não foi possível salvar as receitas deste mês. Tente novamente." }
  }
  revalidatePath("/gestao/financeiro/repasses")
  revalidatePath("/gestao/financeiro")
  revalidatePath("/gestao/auditoria")
  return { ok: true }
}

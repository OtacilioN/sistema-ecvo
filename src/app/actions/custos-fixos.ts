"use server"

import { revalidatePath } from "next/cache"
import { exigirPapel } from "@/lib/auth/dal"
import { CAMPOS_CUSTOS_FIXOS, custosFixosMensaisSchema } from "@/lib/financeiro/custos-fixos"
import { salvarCustosFixosMensais } from "@/lib/services/custos-fixos.service"

export type EstadoCustosFixos = { erro?: string; ok?: boolean } | undefined

export async function acaoSalvarCustosFixos(
  _: EstadoCustosFixos,
  formData: FormData,
): Promise<EstadoCustosFixos> {
  const usuario = await exigirPapel("GESTOR")
  const valores = Object.fromEntries(
    CAMPOS_CUSTOS_FIXOS.map(({ nome }) => {
      const valor = formData.get(nome)
      return [nome, typeof valor === "string" && valor.trim() !== "" ? Number(valor) : NaN]
    }),
  )
  const parsed = custosFixosMensaisSchema.safeParse({
    competencia: formData.get("competencia"),
    ...valores,
  })
  if (!parsed.success) {
    return { erro: parsed.error.issues[0]?.message ?? "Revise os custos informados." }
  }

  try {
    await salvarCustosFixosMensais(usuario.id, parsed.data)
  } catch {
    return { erro: "Não foi possível salvar os custos deste mês. Tente novamente." }
  }
  revalidatePath("/gestao/financeiro/repasses")
  revalidatePath("/gestao/financeiro")
  revalidatePath("/gestao/auditoria")
  return { ok: true }
}

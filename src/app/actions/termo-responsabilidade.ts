"use server"

import { revalidatePath } from "next/cache"
import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { exigirAluno } from "@/lib/auth/dal"
import { aceitarTermoResponsabilidade } from "@/lib/services/termo-responsabilidade.service"

export type EstadoTermoResponsabilidade = { erro?: string } | undefined

function primeiroHeader(lista: Headers, nomes: string[]) {
  for (const nome of nomes) {
    const valor = lista.get(nome)
    if (valor) return valor
  }
  return null
}

export async function acaoAceitarTermoResponsabilidade(
  _: EstadoTermoResponsabilidade,
  formData: FormData,
): Promise<EstadoTermoResponsabilidade> {
  const { alunoId, usuario } = await exigirAluno()
  const listaHeaders = await headers()
  const declaracoes = formData.getAll("declaracoes").map(String)
  const userAgent = listaHeaders.get("user-agent")
  const ipBruto = primeiroHeader(listaHeaders, [
    "x-forwarded-for",
    "x-real-ip",
    "cf-connecting-ip",
    "true-client-ip",
  ])
  const ip = ipBruto?.split(",")[0]?.trim() || null

  const resultado = await aceitarTermoResponsabilidade({
    alunoId,
    autorId: usuario.id,
    declaracoes,
    ip,
    userAgent,
    metadados: {
      acceptLanguage: listaHeaders.get("accept-language"),
      secChUa: listaHeaders.get("sec-ch-ua"),
      secChUaMobile: listaHeaders.get("sec-ch-ua-mobile"),
      secChUaPlatform: listaHeaders.get("sec-ch-ua-platform"),
    },
  })

  if (!resultado.ok) return { erro: resultado.motivo }

  revalidatePath("/aluno")
  revalidatePath("/aluno/checkin")
  revalidatePath("/gestao/auditoria")
  redirect("/aluno")
}

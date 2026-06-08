"use server"

import { revalidatePath } from "next/cache"
import { exigirPapel, exigirProfessor } from "@/lib/auth/dal"
import {
  registrarAjusteManualHoras,
  registrarLancamentoAvulsoHorasProfessor,
} from "@/lib/services/horas.service"
import {
  ajusteManualHorasSchema,
  lancamentoAvulsoHorasProfessorSchema,
} from "@/lib/validations/horas"

export type EstadoHoras = { erro?: string; ok?: boolean } | undefined

function primeiroErro(issues: { message: string }[]): string {
  return issues[0]?.message ?? "Dados inválidos."
}

export async function acaoAjustarHorasManual(
  _: EstadoHoras,
  formData: FormData,
): Promise<EstadoHoras> {
  const usuario = await exigirPapel("GESTOR")
  const parsed = ajusteManualHorasSchema.safeParse({
    alunoId: formData.get("alunoId"),
    modalidadeId: formData.get("modalidadeId"),
    minutos: formData.get("minutos"),
    motivo: formData.get("motivo"),
  })
  if (!parsed.success) return { erro: primeiroErro(parsed.error.issues) }

  const resultado = await registrarAjusteManualHoras({
    ...parsed.data,
    autorId: usuario.id,
  })
  revalidatePath("/gestao/alunos")
  revalidatePath("/gestao/relatorios")
  revalidatePath("/aluno/horas")
  revalidatePath("/aluno/perfil")
  if (!resultado.ok) return { erro: resultado.motivo }
  return { ok: true }
}

export async function acaoLancarHorasAvulsasProfessor(
  _: EstadoHoras,
  formData: FormData,
): Promise<EstadoHoras> {
  const { usuario, professorId } = await exigirProfessor()
  const parsed = lancamentoAvulsoHorasProfessorSchema.safeParse({
    alunoId: formData.get("alunoId"),
    modalidadeId: formData.get("modalidadeId"),
    minutos: formData.get("minutos"),
    motivo: formData.get("motivo"),
  })
  if (!parsed.success) return { erro: primeiroErro(parsed.error.issues) }

  const resultado = await registrarLancamentoAvulsoHorasProfessor({
    ...parsed.data,
    professorId,
    autorId: usuario.id,
  })
  revalidatePath("/professor/graduacoes")
  revalidatePath("/gestao/alunos")
  revalidatePath("/gestao/relatorios")
  revalidatePath("/gestao/auditoria")
  revalidatePath("/aluno/horas")
  revalidatePath("/aluno/perfil")
  revalidatePath("/aluno/graduacoes")
  if (!resultado.ok) return { erro: resultado.motivo }
  return { ok: true }
}

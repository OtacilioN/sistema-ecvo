"use server"

import { revalidatePath } from "next/cache"
import { exigirPapel } from "@/lib/auth/dal"
import { cancelarAula, criarEvento, definirProfessorDaAula } from "@/lib/services/turma.service"
import { cancelarAulaSchema, eventoSchema, professorAulaSchema } from "@/lib/validations/cadastros"

export type EstadoTurma = { erro?: string; ok?: boolean } | undefined

function primeiroErro(issues: { message: string }[]): string {
  return issues[0]?.message ?? "Dados inválidos."
}

function revalidarTurmas() {
  revalidatePath("/gestao/turmas")
  revalidatePath("/gestao/auditoria")
  revalidatePath("/aluno")
  revalidatePath("/professor/turmas")
}

export async function acaoCriarEvento(_: EstadoTurma, formData: FormData): Promise<EstadoTurma> {
  const usuario = await exigirPapel("GESTOR")
  const parsed = eventoSchema.safeParse({
    modalidadeId: formData.get("modalidadeId"),
    professorId: formData.get("professorId"),
    nome: formData.get("nome"),
    inicio: formData.get("inicio"),
    fim: formData.get("fim"),
    capacidade: formData.get("capacidade"),
    local: formData.get("local"),
  })
  if (!parsed.success) return { erro: primeiroErro(parsed.error.issues) }

  const resultado = await criarEvento({ ...parsed.data, autorId: usuario.id })
  revalidarTurmas()
  if (!resultado.ok) return { erro: resultado.motivo }
  return { ok: true }
}

export async function acaoDefinirProfessorAula(
  _: EstadoTurma,
  formData: FormData,
): Promise<EstadoTurma> {
  const usuario = await exigirPapel("GESTOR")
  const parsed = professorAulaSchema.safeParse({
    aulaId: formData.get("aulaId"),
    professorId: formData.get("professorId"),
    justificativa: formData.get("justificativa"),
  })
  if (!parsed.success) return { erro: primeiroErro(parsed.error.issues) }

  const resultado = await definirProfessorDaAula({
    ...parsed.data,
    autorId: usuario.id,
  })
  revalidarTurmas()
  if (!resultado.ok) return { erro: resultado.motivo }
  return { ok: true }
}

export async function acaoCancelarAula(_: EstadoTurma, formData: FormData): Promise<EstadoTurma> {
  const usuario = await exigirPapel("GESTOR")
  const parsed = cancelarAulaSchema.safeParse({
    aulaId: formData.get("aulaId"),
    justificativa: formData.get("justificativa"),
  })
  if (!parsed.success) return { erro: primeiroErro(parsed.error.issues) }

  const resultado = await cancelarAula({
    ...parsed.data,
    autorId: usuario.id,
  })
  revalidarTurmas()
  revalidatePath("/gestao/notificacoes")
  revalidatePath("/aluno/notificacoes")
  if (!resultado.ok) return { erro: resultado.motivo }
  return { ok: true }
}

"use server"

import { revalidatePath } from "next/cache"
import { exigirAluno, exigirProfessor } from "@/lib/auth/dal"
import {
  criarExameGraduacao,
  inscreverAlunoExame,
  registrarGraduacao,
  registrarResultadoExame,
} from "@/lib/services/graduacao.service"
import {
  criarExameSchema,
  inscreverExameSchema,
  registrarGraduacaoSchema,
  registrarResultadoExameSchema,
} from "@/lib/validations/graduacao"

export type EstadoGraduacao = { erro?: string; ok?: boolean } | undefined

function primeiroErro(issues: { message: string }[]): string {
  return issues[0]?.message ?? "Dados inválidos."
}

export async function acaoRegistrarGraduacao(
  _: EstadoGraduacao,
  formData: FormData,
): Promise<EstadoGraduacao> {
  const { usuario, professorId } = await exigirProfessor()
  const parsed = registrarGraduacaoSchema.safeParse({
    alunoId: formData.get("alunoId"),
    graduacaoId: formData.get("graduacaoId"),
    observacao: formData.get("observacao"),
    anexoUrl: formData.get("anexoUrl"),
  })
  if (!parsed.success) return { erro: primeiroErro(parsed.error.issues) }

  const resultado = await registrarGraduacao({
    ...parsed.data,
    professorId,
    autorId: usuario.id,
  })
  revalidatePath("/professor/graduacoes")
  revalidatePath("/gestao/auditoria")
  if (!resultado.ok) return { erro: resultado.motivo }
  return { ok: true }
}

export async function acaoInscreverExame(
  _: EstadoGraduacao,
  formData: FormData,
): Promise<EstadoGraduacao> {
  const { alunoId } = await exigirAluno()
  const parsed = inscreverExameSchema.safeParse({
    exameId: formData.get("exameId"),
  })
  if (!parsed.success) return { erro: primeiroErro(parsed.error.issues) }

  const resultado = await inscreverAlunoExame({ ...parsed.data, alunoId })
  revalidatePath("/aluno/graduacoes")
  revalidatePath("/professor/graduacoes")
  if (!resultado.ok) return { erro: resultado.motivo }
  return { ok: true }
}

export async function acaoRegistrarResultadoExame(
  _: EstadoGraduacao,
  formData: FormData,
): Promise<EstadoGraduacao> {
  const { usuario, professorId } = await exigirProfessor()
  const parsed = registrarResultadoExameSchema.safeParse({
    inscricaoExameId: formData.get("inscricaoExameId"),
    aprovado: formData.get("aprovado"),
    novaGraduacaoId: formData.get("novaGraduacaoId"),
    resultado: formData.get("resultado"),
  })
  if (!parsed.success) return { erro: primeiroErro(parsed.error.issues) }

  const resultado = await registrarResultadoExame({
    ...parsed.data,
    professorId,
    autorId: usuario.id,
  })
  revalidatePath("/professor/graduacoes")
  revalidatePath("/aluno/graduacoes")
  revalidatePath("/gestao/auditoria")
  if (!resultado.ok) return { erro: resultado.motivo }
  return { ok: true }
}

export async function acaoCriarExame(
  _: EstadoGraduacao,
  formData: FormData,
): Promise<EstadoGraduacao> {
  const { usuario, professorId } = await exigirProfessor()
  const parsed = criarExameSchema.safeParse({
    modalidadeId: formData.get("modalidadeId"),
    data: formData.get("data"),
    descricao: formData.get("descricao"),
    taxa: formData.get("taxa") || undefined,
  })
  if (!parsed.success) return { erro: primeiroErro(parsed.error.issues) }

  const resultado = await criarExameGraduacao({ ...parsed.data, professorId, autorId: usuario.id })
  revalidatePath("/professor/graduacoes")
  revalidatePath("/gestao/auditoria")
  if (!resultado.ok) return { erro: resultado.motivo }
  return { ok: true }
}

"use server"

import { revalidatePath } from "next/cache"
import { exigirProfessor } from "@/lib/auth/dal"
import { solicitarCriacaoContaAsaasProfessor } from "@/lib/services/conta-asaas-professor.service"
import { contaAsaasProfessorSchema } from "@/lib/validations/conta-asaas-professor"

export type EstadoContaAsaasProfessor =
  | { erro?: string; ok?: boolean; resultadoIndeterminado?: boolean }
  | undefined

function primeiroErro(issues: { message: string }[]) {
  return issues[0]?.message ?? "Confira os dados informados."
}

export async function acaoSolicitarCriacaoContaAsaasProfessor(
  _: EstadoContaAsaasProfessor,
  formData: FormData,
): Promise<EstadoContaAsaasProfessor> {
  const { usuario, professorId } = await exigirProfessor()
  const parsed = contaAsaasProfessorSchema.safeParse({
    nomeTitular: formData.get("nomeTitular"),
    emailContaAsaas: formData.get("emailContaAsaas"),
    cpfCnpj: formData.get("cpfCnpj"),
    dataNascimento: formData.get("dataNascimento"),
    celular: formData.get("celular"),
    rendaMensal: formData.get("rendaMensal"),
    logradouro: formData.get("logradouro"),
    numeroEndereco: formData.get("numeroEndereco"),
    complemento: formData.get("complemento"),
    bairro: formData.get("bairro"),
    cep: formData.get("cep"),
    consentimento: formData.get("consentimento"),
  })
  if (!parsed.success) return { erro: primeiroErro(parsed.error.issues) }

  const resultado = await solicitarCriacaoContaAsaasProfessor({
    professorId,
    autorId: usuario.id,
    dados: parsed.data,
  })
  revalidatePath("/professor/perfil")

  if (!resultado.ok) {
    return {
      erro: resultado.motivo,
      resultadoIndeterminado:
        "resultadoIndeterminado" in resultado ? resultado.resultadoIndeterminado : false,
    }
  }
  return { ok: true }
}

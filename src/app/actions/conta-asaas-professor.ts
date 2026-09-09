"use server"

import { revalidatePath } from "next/cache"
import { exigirPapel, exigirProfessor } from "@/lib/auth/dal"
import {
  obterContaAsaasProfessor,
  solicitarCriacaoContaAsaasProfessor,
} from "@/lib/services/conta-asaas-professor.service"
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

export async function acaoSolicitarCriacaoContaAsaasProfessorPeloGestor(
  _: EstadoContaAsaasProfessor,
  formData: FormData,
): Promise<EstadoContaAsaasProfessor> {
  const usuario = await exigirPapel("GESTOR")
  const professorId = formData.get("professorId")
  if (typeof professorId !== "string" || !professorId) {
    return { erro: "Professor inválido." }
  }
  if (formData.get("confirmacao") !== "CONSENTIMENTO_CONFIRMADO") {
    return { erro: "Confirme que o professor autorizou a criação da conta." }
  }

  const conta = await obterContaAsaasProfessor(professorId)
  if (conta?.status !== "RASCUNHO") {
    return { erro: "O professor não possui um rascunho Asaas disponível para solicitação." }
  }

  const parsed = contaAsaasProfessorSchema.safeParse({
    nomeTitular: conta.nomeTitular,
    emailContaAsaas: conta.emailContaAsaas,
    cpfCnpj: conta.cpfCnpj,
    dataNascimento: conta.dataNascimento,
    celular: conta.celular,
    rendaMensal: conta.rendaMensal.toNumber(),
    logradouro: conta.logradouro,
    numeroEndereco: conta.numeroEndereco,
    complemento: conta.complemento,
    bairro: conta.bairro,
    cep: conta.cep,
    consentimento: "on",
  })
  if (!parsed.success) return { erro: primeiroErro(parsed.error.issues) }

  const resultado = await solicitarCriacaoContaAsaasProfessor({
    professorId,
    autorId: usuario.id,
    dados: parsed.data,
  })
  revalidatePath("/gestao/professores")
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

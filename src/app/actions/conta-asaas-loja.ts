"use server"

import { revalidatePath } from "next/cache"
import { exigirLoja, exigirPapel } from "@/lib/auth/dal"
import {
  confirmarAprovacaoContaAsaasLoja,
  solicitarCriacaoContaAsaasLoja,
} from "@/lib/services/conta-asaas-loja.service"
import { contaAsaasLojaSchema } from "@/lib/validations/conta-asaas-loja"

export type EstadoContaAsaasLoja =
  | { erro?: string; ok?: boolean; resultadoIndeterminado?: boolean }
  | undefined

function primeiroErro(issues: { message: string }[]) {
  return issues[0]?.message ?? "Confira os dados informados."
}

export async function acaoSolicitarCriacaoContaAsaasLoja(
  _: EstadoContaAsaasLoja,
  formData: FormData,
): Promise<EstadoContaAsaasLoja> {
  const usuario = await exigirLoja()
  const parsed = contaAsaasLojaSchema.safeParse({
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

  const resultado = await solicitarCriacaoContaAsaasLoja({
    autorId: usuario.id,
    dados: parsed.data,
  })
  revalidatePath("/loja/painel")
  revalidatePath("/gestao/auditoria")
  if (!resultado.ok) {
    return {
      erro: resultado.motivo,
      resultadoIndeterminado:
        "resultadoIndeterminado" in resultado ? resultado.resultadoIndeterminado : false,
    }
  }
  return { ok: true }
}

export async function acaoConfirmarAprovacaoContaAsaasLoja(
  _: EstadoContaAsaasLoja,
  formData: FormData,
): Promise<EstadoContaAsaasLoja> {
  const usuario = await exigirPapel("GESTOR")
  if (formData.get("confirmacao") !== "APROVACAO_ASAAS_CONFIRMADA") {
    return { erro: "Confirme que a aprovação geral consta no painel do Asaas." }
  }
  const resultado = await confirmarAprovacaoContaAsaasLoja({ autorId: usuario.id })
  revalidatePath("/loja/painel")
  revalidatePath("/gestao/auditoria")
  return resultado.ok ? { ok: true } : { erro: resultado.motivo }
}

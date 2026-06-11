"use server"

import { Prisma } from "@prisma/client"
import { revalidatePath } from "next/cache"
import { exigirAluno } from "@/lib/auth/dal"
import { atualizarAluno } from "@/lib/services/aluno.service"
import { meusDadosAlunoSchema } from "@/lib/validations/cadastros"

export type EstadoMeusDadosAluno = { erro?: string; ok?: boolean } | undefined

function primeiroErro(issues: { message: string }[]): string {
  return issues[0]?.message ?? "Dados inválidos."
}

function responsavelDoFormData(formData: FormData) {
  const nome = (formData.get("respNome") as string | null)?.trim()
  if (!nome) return null

  return {
    nome,
    cpf: formData.get("respCpf"),
    telefone: formData.get("respTelefone"),
    email: formData.get("respEmail"),
    grauParentesco: formData.get("respParentesco"),
    responsavelFinanceiro: formData.get("respFinanceiro") === "on",
  }
}

export async function acaoAtualizarMeusDadosAluno(
  _: EstadoMeusDadosAluno,
  formData: FormData,
): Promise<EstadoMeusDadosAluno> {
  const { usuario, alunoId } = await exigirAluno()
  const dataNascimento = formData.get("dataNascimento")
  const parsed = meusDadosAlunoSchema.safeParse({
    nome: formData.get("nome"),
    email: formData.get("email"),
    cpf: formData.get("cpf"),
    telefone: formData.get("telefone"),
    dataNascimento: dataNascimento || undefined,
    endereco: formData.get("endereco"),
    contatoEmergencia: formData.get("contatoEmergencia"),
    restricoesMedicas: formData.get("restricoesMedicas"),
    responsavel: responsavelDoFormData(formData),
  })
  if (!parsed.success) return { erro: primeiroErro(parsed.error.issues) }

  try {
    const resultado = await atualizarAluno(alunoId, {
      autorId: usuario.id,
      nome: parsed.data.nome,
      email: parsed.data.email,
      cpf: parsed.data.cpf,
      telefone: parsed.data.telefone,
      dataNascimento: dataNascimento === "" ? null : parsed.data.dataNascimento,
      endereco: parsed.data.endereco,
      contatoEmergencia: parsed.data.contatoEmergencia,
      restricoesMedicas: parsed.data.restricoesMedicas,
      responsavel: parsed.data.responsavel,
    })
    if (!resultado.ok) return { erro: resultado.motivo }
  } catch (erro) {
    if (erro instanceof Prisma.PrismaClientKnownRequestError && erro.code === "P2002") {
      return { erro: "E-mail ou CPF já cadastrado." }
    }
    return { erro: "Não foi possível salvar os dados." }
  }

  revalidatePath("/aluno/perfil")
  revalidatePath("/gestao/alunos")
  revalidatePath("/gestao/auditoria")
  return { ok: true }
}

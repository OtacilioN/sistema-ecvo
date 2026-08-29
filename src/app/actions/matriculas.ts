"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { exigirPapel } from "@/lib/auth/dal"
import {
  assinaturaArquivoComprovanteValida,
  validarComprovanteMatricula,
} from "@/lib/comprovantes-matricula"
import { aprovarMatricula, solicitarMatricula } from "@/lib/services/matricula.service"
import {
  excluirComprovanteMatriculaSeExistir,
  salvarComprovanteMatricula,
} from "@/lib/storage/blob-comprovantes-matricula"
import { aprovacaoMatriculaSchema, solicitacaoMatriculaSchema } from "@/lib/validations/matricula"

export type EstadoMatricula = { erro?: string; ok?: boolean } | undefined

function primeiroErro(issues: { message: string }[]) {
  return issues[0]?.message ?? "Revise os dados informados."
}

export async function acaoSolicitarMatricula(
  _: EstadoMatricula,
  formData: FormData,
): Promise<EstadoMatricula> {
  const parsed = solicitacaoMatriculaSchema.safeParse({
    nome: formData.get("nome"),
    email: formData.get("email"),
    senha: formData.get("senha"),
    confirmarSenha: formData.get("confirmarSenha"),
    cpf: formData.get("cpf"),
    telefone: formData.get("telefone"),
    dataNascimento: formData.get("dataNascimento"),
    endereco: formData.get("endereco"),
    contatoEmergencia: formData.get("contatoEmergencia"),
    restricoesMedicas: formData.get("restricoesMedicas"),
    modalidadeId: formData.get("modalidadeId"),
    aceiteDados: formData.get("aceiteDados"),
  })
  if (!parsed.success) return { erro: primeiroErro(parsed.error.issues) }

  const valorArquivo = formData.get("comprovante")
  const arquivo = valorArquivo instanceof File && valorArquivo.size > 0 ? valorArquivo : null
  const arquivoValido = validarComprovanteMatricula(arquivo)
  if (!arquivoValido.ok) return { erro: arquivoValido.motivo }
  if (arquivo && !(await assinaturaArquivoComprovanteValida(arquivo))) {
    return { erro: "O conteúdo do arquivo não corresponde ao formato informado." }
  }

  let comprovanteUrl: string | null = null
  let resultado: Awaited<ReturnType<typeof solicitarMatricula>>

  try {
    const comprovante = arquivo ? await salvarComprovanteMatricula(arquivo) : null
    comprovanteUrl = comprovante?.url ?? null
    resultado = await solicitarMatricula({
      ...parsed.data,
      comprovante:
        arquivo && comprovante
          ? {
              url: comprovante.url,
              contentType: arquivo.type,
              nomeOriginal: arquivo.name,
            }
          : null,
    })
  } catch {
    await excluirComprovanteMatriculaSeExistir(comprovanteUrl)
    return { erro: "Não foi possível enviar sua matrícula. Tente novamente em instantes." }
  }

  if (!resultado.ok) {
    await excluirComprovanteMatriculaSeExistir(comprovanteUrl)
    return { erro: resultado.motivo }
  }

  redirect("/matricula/enviada")
}

export async function acaoAprovarMatricula(
  _: EstadoMatricula,
  formData: FormData,
): Promise<EstadoMatricula> {
  const gestor = await exigirPapel("GESTOR")
  const comprovanteConfirmado = formData.get("comprovanteConfirmado") === "on"
  const parsed = aprovacaoMatriculaSchema.safeParse({
    solicitacaoId: formData.get("solicitacaoId"),
    planoId: formData.get("planoId"),
    diaVencimento: formData.get("diaVencimento"),
    comprovanteConfirmado,
    competenciaEsperada: formData.get("competenciaEsperada"),
    pagoEm: comprovanteConfirmado ? formData.get("pagoEm") : null,
  })
  if (!parsed.success) return { erro: primeiroErro(parsed.error.issues) }

  const resultado = await aprovarMatricula({ ...parsed.data, autorId: gestor.id })
  if (!resultado.ok) return { erro: resultado.motivo }

  revalidatePath("/gestao/matriculas-pendentes")
  revalidatePath("/gestao/alunos")
  revalidatePath("/gestao/financeiro")
  revalidatePath("/gestao/auditoria")
  return { ok: true }
}

"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { exigirPapel } from "@/lib/auth/dal"
import {
  assinaturaArquivoComprovanteValida,
  validarComprovanteMatricula,
} from "@/lib/comprovantes-matricula"
import {
  aprovarMatricula,
  rejeitarMatricula,
  solicitarMatricula,
} from "@/lib/services/matricula.service"
import {
  gerarCobrancaMatriculaAsaas,
  reemitirCobrancaMatriculaAsaas,
} from "@/lib/services/pagamento-matricula.service"
import {
  excluirComprovanteMatriculaSeExistir,
  salvarComprovanteMatricula,
} from "@/lib/storage/blob-comprovantes-matricula"
import {
  aprovacaoMatriculaSchema,
  rejeicaoMatriculaSchema,
  solicitacaoMatriculaSchema,
} from "@/lib/validations/matricula"

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
    tipoPagamento: formData.get("tipoPagamento"),
    beneficioAtivoDeclarado: formData.get("beneficioAtivoDeclarado"),
    aceiteDados: formData.get("aceiteDados"),
  })
  if (!parsed.success) return { erro: primeiroErro(parsed.error.issues) }

  const valorArquivo =
    parsed.data.tipoPagamento === "MENSALISTA" ? formData.get("comprovante") : null
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

  if (parsed.data.tipoPagamento === "MENSALISTA") {
    await gerarCobrancaMatriculaAsaas(resultado.solicitacao.tokenAcompanhamento)
    redirect(`/matricula/pagamento/${resultado.solicitacao.tokenAcompanhamento}`)
  }
  redirect(`/matricula/enviada?tipoPagamento=${parsed.data.tipoPagamento.toLowerCase()}`)
}

export async function acaoGerarPagamentoMatricula(formData: FormData) {
  const token = formData.get("token")
  if (typeof token !== "string" || token.length < 10) return
  await gerarCobrancaMatriculaAsaas(token, { verificar: true })
  revalidatePath(`/matricula/pagamento/${token}`)
}

export async function acaoReemitirPagamentoMatricula(formData: FormData) {
  const token = formData.get("token")
  if (typeof token !== "string" || token.length < 10) return
  await reemitirCobrancaMatriculaAsaas(token)
  revalidatePath(`/matricula/pagamento/${token}`)
}

export async function acaoAprovarMatricula(
  _: EstadoMatricula,
  formData: FormData,
): Promise<EstadoMatricula> {
  const gestor = await exigirPapel("GESTOR")
  const parsed = aprovacaoMatriculaSchema.safeParse({
    solicitacaoId: formData.get("solicitacaoId"),
    diaVencimento: formData.get("diaVencimento") ?? undefined,
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

export async function acaoRejeitarMatricula(
  _: EstadoMatricula,
  formData: FormData,
): Promise<EstadoMatricula> {
  const gestor = await exigirPapel("GESTOR")
  const parsed = rejeicaoMatriculaSchema.safeParse({
    solicitacaoId: formData.get("solicitacaoId"),
    justificativa: formData.get("justificativa"),
  })
  if (!parsed.success) return { erro: primeiroErro(parsed.error.issues) }

  const resultado = await rejeitarMatricula({ ...parsed.data, autorId: gestor.id })
  if (!resultado.ok) return { erro: resultado.motivo }

  revalidatePath("/gestao/matriculas-pendentes")
  revalidatePath("/gestao/auditoria")
  return { ok: true }
}

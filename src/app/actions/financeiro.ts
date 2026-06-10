"use server"

import { revalidatePath } from "next/cache"
import { exigirPapel } from "@/lib/auth/dal"
import {
  atualizarPlano,
  atualizarStatusMensalidade,
  baixarMensalidade,
  criarPlano,
  darBaixaMensalidadeAluno,
  excluirPlano,
  registrarPagamentoAvulso,
  vincularPlanoMensalista,
} from "@/lib/services/financeiro.service"
import {
  baixaMensalidadeAlunoSchema,
  baixarMensalidadeSchema,
  pagamentoAvulsoSchema,
  planoEdicaoSchema,
  planoExclusaoSchema,
  planoSchema,
  statusMensalidadeSchema,
  vinculoPlanoSchema,
} from "@/lib/validations/financeiro"

export type EstadoFinanceiro = { erro?: string; ok?: boolean } | undefined

function primeiroErro(issues: { message: string }[]): string {
  return issues[0]?.message ?? "Dados inválidos."
}

export async function acaoCriarPlano(
  _: EstadoFinanceiro,
  formData: FormData,
): Promise<EstadoFinanceiro> {
  const usuario = await exigirPapel("GESTOR")
  const parsed = planoSchema.safeParse({
    nome: formData.get("nome"),
    valor: formData.get("valor"),
    periodicidade: formData.get("periodicidade"),
    limiteAulas: formData.get("limiteAulas") || undefined,
  })
  if (!parsed.success) return { erro: primeiroErro(parsed.error.issues) }

  await criarPlano({ ...parsed.data, autorId: usuario.id })
  revalidatePath("/gestao/financeiro")
  revalidatePath("/gestao/auditoria")
  return { ok: true }
}

export async function acaoAtualizarPlano(
  _: EstadoFinanceiro,
  formData: FormData,
): Promise<EstadoFinanceiro> {
  const usuario = await exigirPapel("GESTOR")
  const parsed = planoEdicaoSchema.safeParse({
    planoId: formData.get("planoId"),
    nome: formData.get("nome"),
    valor: formData.get("valor"),
    periodicidade: formData.get("periodicidade"),
    limiteAulas: formData.get("limiteAulas") || undefined,
    ativo: formData.get("ativo"),
  })
  if (!parsed.success) return { erro: primeiroErro(parsed.error.issues) }

  const resultado = await atualizarPlano({ ...parsed.data, autorId: usuario.id })
  revalidatePath("/gestao/financeiro")
  revalidatePath("/gestao/auditoria")
  revalidatePath("/aluno/financeiro")
  revalidatePath("/aluno/perfil")
  if (!resultado.ok) return { erro: resultado.motivo }
  return { ok: true }
}

export async function acaoExcluirPlano(
  _: EstadoFinanceiro,
  formData: FormData,
): Promise<EstadoFinanceiro> {
  const usuario = await exigirPapel("GESTOR")
  const parsed = planoExclusaoSchema.safeParse({
    planoId: formData.get("planoId"),
    planoDestinoId: formData.get("planoDestinoId"),
  })
  if (!parsed.success) return { erro: primeiroErro(parsed.error.issues) }

  const resultado = await excluirPlano({ ...parsed.data, autorId: usuario.id })
  revalidatePath("/gestao/financeiro")
  revalidatePath("/gestao/alunos")
  revalidatePath("/gestao/auditoria")
  revalidatePath("/aluno/financeiro")
  revalidatePath("/aluno/perfil")
  if (!resultado.ok) return { erro: resultado.motivo }
  return { ok: true }
}

export async function acaoVincularPlano(
  _: EstadoFinanceiro,
  formData: FormData,
): Promise<EstadoFinanceiro> {
  const usuario = await exigirPapel("GESTOR")
  const parsed = vinculoPlanoSchema.safeParse({
    alunoId: formData.get("alunoId"),
    planoId: formData.get("planoId"),
    diaVencimento: formData.get("diaVencimento"),
    modalidadeIds: formData.getAll("modalidadeIds"),
  })
  if (!parsed.success) return { erro: primeiroErro(parsed.error.issues) }

  const resultado = await vincularPlanoMensalista({ ...parsed.data, autorId: usuario.id })
  revalidatePath("/gestao/financeiro")
  revalidatePath("/gestao/financeiro/repasses")
  revalidatePath("/gestao/alunos")
  revalidatePath("/gestao/auditoria")
  revalidatePath("/aluno/financeiro")
  revalidatePath("/aluno/perfil")
  if (!resultado.ok) return { erro: resultado.motivo }
  return { ok: true }
}

export async function acaoBaixarMensalidade(
  _: EstadoFinanceiro,
  formData: FormData,
): Promise<EstadoFinanceiro> {
  const usuario = await exigirPapel("GESTOR")
  const parsed = baixarMensalidadeSchema.safeParse({
    mensalidadeId: formData.get("mensalidadeId"),
    formaPagamento: formData.get("formaPagamento"),
    observacao: formData.get("observacao"),
  })
  if (!parsed.success) return { erro: primeiroErro(parsed.error.issues) }

  const resultado = await baixarMensalidade({ ...parsed.data, autorId: usuario.id })
  revalidatePath("/gestao/financeiro")
  revalidatePath("/gestao/auditoria")
  revalidatePath("/aluno/financeiro")
  revalidatePath("/aluno/perfil")
  if (!resultado.ok) return { erro: resultado.motivo }
  return { ok: true }
}

export async function acaoDarBaixaMensalidadeAluno(
  _: EstadoFinanceiro,
  formData: FormData,
): Promise<EstadoFinanceiro> {
  const usuario = await exigirPapel("GESTOR")
  const parsed = baixaMensalidadeAlunoSchema.safeParse({
    alunoId: formData.get("alunoId"),
    competencia: formData.get("competencia"),
    formaPagamento: formData.get("formaPagamento"),
    observacao: formData.get("observacao"),
  })
  if (!parsed.success) return { erro: primeiroErro(parsed.error.issues) }

  const resultado = await darBaixaMensalidadeAluno({ ...parsed.data, autorId: usuario.id })
  revalidatePath("/gestao/financeiro")
  revalidatePath("/gestao/alunos")
  revalidatePath("/gestao/auditoria")
  revalidatePath("/aluno/financeiro")
  revalidatePath("/aluno/perfil")
  if (!resultado.ok) return { erro: resultado.motivo }
  return { ok: true }
}

export async function acaoAtualizarStatusMensalidade(
  _: EstadoFinanceiro,
  formData: FormData,
): Promise<EstadoFinanceiro> {
  const usuario = await exigirPapel("GESTOR")
  const parsed = statusMensalidadeSchema.safeParse({
    mensalidadeId: formData.get("mensalidadeId"),
    status: formData.get("status"),
    formaPagamento: formData.get("formaPagamento"),
    observacao: formData.get("observacao"),
  })
  if (!parsed.success) return { erro: primeiroErro(parsed.error.issues) }

  const resultado = await atualizarStatusMensalidade({ ...parsed.data, autorId: usuario.id })
  revalidatePath("/gestao/financeiro")
  revalidatePath("/gestao/auditoria")
  revalidatePath("/aluno/financeiro")
  revalidatePath("/aluno/perfil")
  if (!resultado.ok) return { erro: resultado.motivo }
  return { ok: true }
}

export async function acaoPagamentoAvulso(
  _: EstadoFinanceiro,
  formData: FormData,
): Promise<EstadoFinanceiro> {
  const usuario = await exigirPapel("GESTOR")
  const parsed = pagamentoAvulsoSchema.safeParse({
    alunoId: formData.get("alunoId"),
    tipo: formData.get("tipo"),
    valor: formData.get("valor"),
    descricao: formData.get("descricao"),
    formaPagamento: formData.get("formaPagamento"),
  })
  if (!parsed.success) return { erro: primeiroErro(parsed.error.issues) }

  const resultado = await registrarPagamentoAvulso({ ...parsed.data, autorId: usuario.id })
  revalidatePath("/gestao/financeiro")
  revalidatePath("/gestao/auditoria")
  revalidatePath("/aluno/financeiro")
  if (!resultado.ok) return { erro: resultado.motivo }
  return { ok: true }
}

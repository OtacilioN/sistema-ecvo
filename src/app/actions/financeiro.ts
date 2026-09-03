"use server"

import { revalidatePath } from "next/cache"
import { exigirAluno, exigirPapel } from "@/lib/auth/dal"
import {
  cancelarCobrancaAsaasPendente,
  cancelarPixAutomatico,
  configurarTipoCobrancaPix,
  gerarCobrancaPixMensal,
} from "@/lib/services/asaas.service"
import {
  baixarMensalidadeManual,
  darBaixaMensalidadeAlunoManual,
} from "@/lib/services/baixa-manual.service"
import {
  atualizarPlano,
  atualizarStatusMensalidade,
  criarPlano,
  excluirPlano,
  registrarPagamentoAvulso,
  vincularPlanoMensalista,
} from "@/lib/services/financeiro.service"
import { gerarCobrancaComplementoAulaAvulsaAsaas } from "@/lib/services/pagamento-matricula.service"
import {
  cancelarCobrancaAsaasSchema,
  gerarCobrancaPixSchema,
  tipoCobrancaPixSchema,
} from "@/lib/validations/asaas"
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
    padrao: formData.get("padrao"),
  })
  if (!parsed.success) return { erro: primeiroErro(parsed.error.issues) }

  const resultado = await criarPlano({ ...parsed.data, autorId: usuario.id })
  if (!resultado.ok) return { erro: resultado.motivo }
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
    padrao: formData.get("padrao"),
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

  const resultado = await baixarMensalidadeManual({ ...parsed.data, autorId: usuario.id })
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

  const resultado = await darBaixaMensalidadeAlunoManual({
    ...parsed.data,
    autorId: usuario.id,
  })
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

export async function acaoConfigurarTipoCobrancaPix(
  _: EstadoFinanceiro,
  formData: FormData,
): Promise<EstadoFinanceiro> {
  const usuario = await exigirPapel("GESTOR")
  const parsed = tipoCobrancaPixSchema.safeParse({
    alunoId: formData.get("alunoId"),
    tipoCobrancaPix: formData.get("tipoCobrancaPix"),
  })
  if (!parsed.success) return { erro: primeiroErro(parsed.error.issues) }

  const resultado = await configurarTipoCobrancaPix({ ...parsed.data, autorId: usuario.id })
  revalidatePath("/gestao/financeiro")
  revalidatePath("/gestao/auditoria")
  revalidatePath("/aluno/financeiro")
  if (!resultado.ok) return { erro: resultado.motivo }
  return { ok: true }
}

export async function acaoGerarCobrancaPixAluno(
  _: EstadoFinanceiro,
  formData: FormData,
): Promise<EstadoFinanceiro> {
  const { alunoId, usuario } = await exigirAluno()
  const parsed = gerarCobrancaPixSchema.safeParse({ mensalidadeId: formData.get("mensalidadeId") })
  if (!parsed.success) return { erro: primeiroErro(parsed.error.issues) }

  const resultado = await gerarCobrancaPixMensal({
    alunoId,
    mensalidadeId: parsed.data.mensalidadeId,
    autorId: usuario.id,
  })
  revalidatePath("/aluno/financeiro")
  revalidatePath("/gestao/financeiro")
  if (!resultado.ok) return { erro: resultado.motivo }
  return { ok: true }
}

export async function acaoFecharMensalidadeAulaAvulsa(
  _: EstadoFinanceiro,
  _formData: FormData,
): Promise<EstadoFinanceiro> {
  const { alunoId } = await exigirAluno()
  const resultado = await gerarCobrancaComplementoAulaAvulsaAsaas(alunoId)
  revalidatePath("/aluno/financeiro")
  revalidatePath("/gestao/financeiro")
  revalidatePath("/gestao/auditoria")
  if (!resultado.ok) return { erro: resultado.motivo }
  return { ok: true }
}

export async function acaoVerificarComplementoAulaAvulsa(
  _: EstadoFinanceiro,
  _formData: FormData,
): Promise<EstadoFinanceiro> {
  const { alunoId } = await exigirAluno()
  const resultado = await gerarCobrancaComplementoAulaAvulsaAsaas(alunoId, { verificar: true })
  revalidatePath("/aluno/financeiro")
  revalidatePath("/aluno")
  revalidatePath("/aluno/checkin")
  revalidatePath("/gestao/financeiro")
  revalidatePath("/gestao/auditoria")
  if (!resultado.ok) return { erro: resultado.motivo }
  return { ok: true }
}

export async function acaoAtivarPixAutomaticoAluno(
  _: EstadoFinanceiro,
  _formData: FormData,
): Promise<EstadoFinanceiro> {
  const { alunoId, usuario } = await exigirAluno()
  const resultado = await configurarTipoCobrancaPix({
    alunoId,
    tipoCobrancaPix: "AUTOMATICO_SEMESTRAL",
    autorId: usuario.id,
  })
  revalidatePath("/aluno/financeiro")
  revalidatePath("/gestao/financeiro")
  revalidatePath("/gestao/auditoria")
  if (!resultado.ok) return { erro: resultado.motivo }
  return { ok: true }
}

export async function acaoCancelarPixAutomaticoAluno(
  _: EstadoFinanceiro,
  _formData: FormData,
): Promise<EstadoFinanceiro> {
  const { alunoId, usuario } = await exigirAluno()
  const resultado = await cancelarPixAutomatico({ alunoId, autorId: usuario.id })
  revalidatePath("/aluno/financeiro")
  revalidatePath("/gestao/financeiro")
  revalidatePath("/gestao/auditoria")
  if (!resultado.ok) return { erro: resultado.motivo }
  return { ok: true }
}

export async function acaoCancelarCobrancaAsaas(
  _: EstadoFinanceiro,
  formData: FormData,
): Promise<EstadoFinanceiro> {
  const usuario = await exigirPapel("GESTOR")
  const parsed = cancelarCobrancaAsaasSchema.safeParse({ cobrancaId: formData.get("cobrancaId") })
  if (!parsed.success) return { erro: primeiroErro(parsed.error.issues) }

  const resultado = await cancelarCobrancaAsaasPendente({
    cobrancaId: parsed.data.cobrancaId,
    autorId: usuario.id,
  })
  revalidatePath("/gestao/financeiro")
  revalidatePath("/gestao/auditoria")
  revalidatePath("/aluno/financeiro")
  if (!resultado.ok) return { erro: resultado.motivo }
  return { ok: true }
}

"use server"

import { revalidatePath } from "next/cache"
import { exigirPapel } from "@/lib/auth/dal"
import {
  atualizarAluno,
  atualizarStatusTipoAluno,
  criarAluno,
  criarDocumentoAluno,
  excluirAluno,
} from "@/lib/services/aluno.service"
import { criarGestor } from "@/lib/services/gestor.service"
import { criarGraduacaoModalidade } from "@/lib/services/graduacao.service"
import {
  atualizarDadosModalidade,
  atualizarRegrasModalidade,
  criarModalidade,
  excluirModalidade,
} from "@/lib/services/modalidade.service"
import {
  atualizarProfessor,
  atualizarStatusProfessor,
  criarProfessor,
  excluirProfessor,
} from "@/lib/services/professor.service"
import { atualizarDadosTurmaRecorrente, criarTurmasRecorrentes } from "@/lib/services/turma.service"
import {
  alunoSchema,
  dadosAlunoSchema,
  dadosModalidadeSchema,
  dadosProfessorSchema,
  dadosTurmaSchema,
  documentoAlunoSchema,
  excluirAlunoSchema,
  excluirModalidadeSchema,
  excluirProfessorSchema,
  gestorSchema,
  graduacaoModalidadeSchema,
  graduacoesCatalogoSchema,
  modalidadeSchema,
  professorSchema,
  regrasModalidadeSchema,
  statusProfessorSchema,
  statusTipoAlunoSchema,
  turmaRecorrenteSchema,
} from "@/lib/validations/cadastros"

export type EstadoForm = { erro?: string; ok?: boolean } | undefined

function primeiroErro(issues: { message: string }[]): string {
  return issues[0]?.message ?? "Dados inválidos."
}

function graduacoesDoFormData(formData: FormData) {
  const ids = formData.getAll("graduacaoId")
  const nomes = formData.getAll("graduacaoNome")
  const ordens = formData.getAll("graduacaoOrdem")
  const minHoras = formData.getAll("graduacaoMinHoras")
  const minFrequencias = formData.getAll("graduacaoMinFrequencia")
  const minTempoNoGrauDias = formData.getAll("graduacaoMinTempoNoGrauDias")
  const removerIds = new Set(formData.getAll("graduacaoRemover").map(String))

  return nomes.map((nome, index) => {
    const id = String(ids[index] ?? "")
    return {
      id,
      nome,
      ordem: ordens[index] ?? index + 1,
      minHoras: minHoras[index],
      minFrequencia: minFrequencias[index],
      minTempoNoGrauDias: minTempoNoGrauDias[index],
      remover: Boolean(id && removerIds.has(id)),
    }
  })
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

export async function acaoCriarModalidade(_: EstadoForm, formData: FormData): Promise<EstadoForm> {
  const usuario = await exigirPapel("GESTOR")
  const parsed = modalidadeSchema.safeParse({
    nome: formData.get("nome"),
    descricao: formData.get("descricao"),
    duracaoPadraoMin: formData.get("duracaoPadraoMin"),
  })
  if (!parsed.success) return { erro: primeiroErro(parsed.error.issues) }

  const graduacoes = graduacoesCatalogoSchema.safeParse(graduacoesDoFormData(formData))
  if (!graduacoes.success) return { erro: primeiroErro(graduacoes.error.issues) }

  try {
    await criarModalidade({ ...parsed.data, graduacoes: graduacoes.data, autorId: usuario.id })
  } catch {
    return { erro: "Não foi possível criar (nome já existe?)." }
  }
  revalidatePath("/gestao/modalidades")
  revalidatePath("/gestao/auditoria")
  return { ok: true }
}

export async function acaoAtualizarDadosModalidade(
  _: EstadoForm,
  formData: FormData,
): Promise<EstadoForm> {
  const usuario = await exigirPapel("GESTOR")
  const parsed = dadosModalidadeSchema.safeParse({
    modalidadeId: formData.get("modalidadeId"),
    nome: formData.get("nome"),
    descricao: formData.get("descricao"),
    duracaoPadraoMin: formData.get("duracaoPadraoMin"),
    ativa: formData.get("ativa"),
  })
  if (!parsed.success) return { erro: primeiroErro(parsed.error.issues) }

  const graduacoes = graduacoesCatalogoSchema.safeParse(graduacoesDoFormData(formData))
  if (!graduacoes.success) return { erro: primeiroErro(graduacoes.error.issues) }

  try {
    const resultado = await atualizarDadosModalidade({
      ...parsed.data,
      graduacoes: graduacoes.data,
      autorId: usuario.id,
    })
    if (!resultado.ok) return { erro: resultado.motivo }
  } catch (erro) {
    if (erro instanceof Error && erro.message.includes("não pode ser removida")) {
      return { erro: erro.message }
    }
    return { erro: "Não foi possível atualizar (nome já existe?)." }
  }

  revalidatePath("/gestao/modalidades")
  revalidatePath("/gestao/auditoria")
  revalidatePath("/gestao/turmas")
  revalidatePath("/professor/graduacoes")
  revalidatePath("/aluno/graduacoes")
  revalidatePath("/aluno/perfil")
  return { ok: true }
}

export async function acaoExcluirModalidade(
  _: EstadoForm,
  formData: FormData,
): Promise<EstadoForm> {
  const usuario = await exigirPapel("GESTOR")
  const parsed = excluirModalidadeSchema.safeParse({
    modalidadeId: formData.get("modalidadeId"),
  })
  if (!parsed.success) return { erro: primeiroErro(parsed.error.issues) }

  const resultado = await excluirModalidade({ ...parsed.data, autorId: usuario.id })
  if (!resultado.ok) return { erro: resultado.motivo }

  revalidatePath("/gestao/modalidades")
  revalidatePath("/gestao/auditoria")
  revalidatePath("/gestao/turmas")
  return { ok: true }
}

export async function acaoAtualizarRegrasModalidade(
  _: EstadoForm,
  formData: FormData,
): Promise<EstadoForm> {
  const usuario = await exigirPapel("GESTOR")
  const parsed = regrasModalidadeSchema.safeParse({
    modalidadeId: formData.get("modalidadeId"),
    janelaComparecimentoHoras: formData.get("janelaComparecimentoHoras"),
    prazoCancelamentoHoras: formData.get("prazoCancelamentoHoras"),
    exigirComparecimentoParaCheckin: formData.get("exigirComparecimentoParaCheckin"),
    politicaCheckinSemComparecimento: formData.get("politicaCheckinSemComparecimento"),
    listaEsperaAtiva: formData.get("listaEsperaAtiva"),
  })
  if (!parsed.success) return { erro: primeiroErro(parsed.error.issues) }

  const resultado = await atualizarRegrasModalidade({ ...parsed.data, autorId: usuario.id })
  if (!resultado.ok) return { erro: resultado.motivo }

  revalidatePath("/gestao/modalidades")
  revalidatePath("/gestao/auditoria")
  revalidatePath("/aluno")
  return { ok: true }
}

export async function acaoCriarGraduacaoModalidade(
  _: EstadoForm,
  formData: FormData,
): Promise<EstadoForm> {
  const usuario = await exigirPapel("GESTOR")
  const parsed = graduacaoModalidadeSchema.safeParse({
    modalidadeId: formData.get("modalidadeId"),
    nome: formData.get("nome"),
    ordem: formData.get("ordem"),
    minHoras: formData.get("minHoras"),
    minFrequencia: formData.get("minFrequencia"),
    minTempoNoGrauDias: formData.get("minTempoNoGrauDias"),
  })
  if (!parsed.success) return { erro: primeiroErro(parsed.error.issues) }

  try {
    const resultado = await criarGraduacaoModalidade({ ...parsed.data, autorId: usuario.id })
    if (!resultado.ok) return { erro: resultado.motivo }
  } catch {
    return { erro: "Não foi possível criar (graduação já existe nesta modalidade?)." }
  }
  revalidatePath("/gestao/modalidades")
  revalidatePath("/gestao/auditoria")
  revalidatePath("/professor/graduacoes")
  revalidatePath("/aluno/graduacoes")
  return { ok: true }
}

export async function acaoCriarProfessor(_: EstadoForm, formData: FormData): Promise<EstadoForm> {
  const usuario = await exigirPapel("GESTOR")
  const parsed = professorSchema.safeParse({
    nome: formData.get("nome"),
    email: formData.get("email"),
    senha: formData.get("senha"),
    cpf: formData.get("cpf"),
    telefone: formData.get("telefone"),
    fotoUrl: formData.get("fotoUrl"),
    observacoes: formData.get("observacoes"),
    modalidadeIds: formData.getAll("modalidadeIds"),
  })
  if (!parsed.success) return { erro: primeiroErro(parsed.error.issues) }

  try {
    await criarProfessor({ ...parsed.data, autorId: usuario.id })
  } catch {
    return { erro: "Não foi possível criar (e-mail/CPF já cadastrado?)." }
  }
  revalidatePath("/gestao/professores")
  revalidatePath("/gestao/auditoria")
  return { ok: true }
}

export async function acaoAtualizarDadosProfessor(
  _: EstadoForm,
  formData: FormData,
): Promise<EstadoForm> {
  const usuario = await exigirPapel("GESTOR")
  const parsed = dadosProfessorSchema.safeParse({
    professorId: formData.get("professorId"),
    nome: formData.get("nome"),
    cpf: formData.get("cpf"),
    telefone: formData.get("telefone"),
    fotoUrl: formData.get("fotoUrl"),
    observacoes: formData.get("observacoes"),
    modalidadeIds: formData.getAll("modalidadeIds"),
  })
  if (!parsed.success) return { erro: primeiroErro(parsed.error.issues) }

  const resultado = await atualizarProfessor(parsed.data.professorId, {
    autorId: usuario.id,
    nome: parsed.data.nome,
    cpf: parsed.data.cpf,
    telefone: parsed.data.telefone,
    fotoUrl: parsed.data.fotoUrl,
    observacoes: parsed.data.observacoes,
    modalidadeIds: parsed.data.modalidadeIds,
  })
  if (!resultado.ok) return { erro: resultado.motivo }

  revalidatePath("/gestao/professores")
  revalidatePath("/gestao/auditoria")
  revalidatePath("/professor")
  return { ok: true }
}

export async function acaoExcluirProfessor(_: EstadoForm, formData: FormData): Promise<EstadoForm> {
  const usuario = await exigirPapel("GESTOR")
  const parsed = excluirProfessorSchema.safeParse({ professorId: formData.get("professorId") })
  if (!parsed.success) return { erro: primeiroErro(parsed.error.issues) }

  const resultado = await excluirProfessor({ ...parsed.data, autorId: usuario.id })
  if (!resultado.ok) return { erro: resultado.motivo }

  revalidatePath("/gestao/professores")
  revalidatePath("/gestao/auditoria")
  return { ok: true }
}

export async function acaoCriarGestor(_: EstadoForm, formData: FormData): Promise<EstadoForm> {
  const usuario = await exigirPapel("GESTOR")
  const parsed = gestorSchema.safeParse({
    nome: formData.get("nome"),
    email: formData.get("email"),
    senha: formData.get("senha"),
  })
  if (!parsed.success) return { erro: primeiroErro(parsed.error.issues) }

  try {
    await criarGestor({ ...parsed.data, autorId: usuario.id })
  } catch {
    return { erro: "Não foi possível criar (e-mail já cadastrado?)." }
  }
  revalidatePath("/gestao/gestores")
  revalidatePath("/gestao/auditoria")
  return { ok: true }
}

export async function acaoAtualizarStatusProfessor(
  _: EstadoForm,
  formData: FormData,
): Promise<EstadoForm> {
  const usuario = await exigirPapel("GESTOR")
  const parsed = statusProfessorSchema.safeParse({
    professorId: formData.get("professorId"),
    ativo: formData.get("ativo"),
  })
  if (!parsed.success) return { erro: primeiroErro(parsed.error.issues) }

  const resultado = await atualizarStatusProfessor({ ...parsed.data, autorId: usuario.id })
  if (!resultado.ok) return { erro: resultado.motivo }

  revalidatePath("/gestao/professores")
  revalidatePath("/gestao/auditoria")
  revalidatePath("/professor")
  return { ok: true }
}

export async function acaoCriarAluno(_: EstadoForm, formData: FormData): Promise<EstadoForm> {
  const usuario = await exigirPapel("GESTOR")
  const responsavel = responsavelDoFormData(formData)
  const parsed = alunoSchema.safeParse({
    nome: formData.get("nome"),
    email: formData.get("email"),
    senha: formData.get("senha"),
    tipo: formData.get("tipo"),
    status: formData.get("status") || undefined,
    cpf: formData.get("cpf"),
    telefone: formData.get("telefone"),
    fotoUrl: formData.get("fotoUrl"),
    dataNascimento: formData.get("dataNascimento") || undefined,
    dataInicio: formData.get("dataInicio") || undefined,
    endereco: formData.get("endereco"),
    contatoEmergencia: formData.get("contatoEmergencia"),
    restricoesMedicas: formData.get("restricoesMedicas"),
    observacoesTecnicas: formData.get("observacoesTecnicas"),
    observacoesAdmin: formData.get("observacoesAdmin"),
    idExterno: formData.get("idExterno"),
    modalidadeIds: formData.getAll("modalidadeIds"),
    responsavel: responsavel ?? undefined,
  })
  if (!parsed.success) return { erro: primeiroErro(parsed.error.issues) }

  try {
    await criarAluno({ ...parsed.data, autorId: usuario.id })
  } catch {
    return { erro: "Não foi possível criar (e-mail/CPF já cadastrado?)." }
  }
  revalidatePath("/gestao/alunos")
  revalidatePath("/gestao/auditoria")
  return { ok: true }
}

export async function acaoAtualizarDadosAluno(
  _: EstadoForm,
  formData: FormData,
): Promise<EstadoForm> {
  const usuario = await exigirPapel("GESTOR")
  const parsed = dadosAlunoSchema.safeParse({
    alunoId: formData.get("alunoId"),
    nome: formData.get("nome"),
    tipo: formData.get("tipo"),
    status: formData.get("status"),
    cpf: formData.get("cpf"),
    telefone: formData.get("telefone"),
    fotoUrl: formData.get("fotoUrl"),
    dataNascimento: formData.get("dataNascimento") || undefined,
    dataInicio: formData.get("dataInicio") || undefined,
    endereco: formData.get("endereco"),
    contatoEmergencia: formData.get("contatoEmergencia"),
    restricoesMedicas: formData.get("restricoesMedicas"),
    observacoesTecnicas: formData.get("observacoesTecnicas"),
    observacoesAdmin: formData.get("observacoesAdmin"),
    idExterno: formData.get("idExterno"),
    modalidadeIds: formData.getAll("modalidadeIds"),
    responsavel: responsavelDoFormData(formData),
  })
  if (!parsed.success) return { erro: primeiroErro(parsed.error.issues) }

  const resultado = await atualizarAluno(parsed.data.alunoId, {
    autorId: usuario.id,
    nome: parsed.data.nome,
    tipo: parsed.data.tipo,
    status: parsed.data.status,
    cpf: parsed.data.cpf,
    telefone: parsed.data.telefone,
    fotoUrl: parsed.data.fotoUrl,
    dataNascimento: parsed.data.dataNascimento,
    dataInicio: parsed.data.dataInicio,
    endereco: parsed.data.endereco,
    contatoEmergencia: parsed.data.contatoEmergencia,
    restricoesMedicas: parsed.data.restricoesMedicas,
    observacoesTecnicas: parsed.data.observacoesTecnicas,
    observacoesAdmin: parsed.data.observacoesAdmin,
    idExterno: parsed.data.idExterno,
    modalidadeIds: parsed.data.modalidadeIds,
    responsavel: parsed.data.responsavel,
  })
  if (!resultado.ok) return { erro: resultado.motivo }

  revalidatePath("/gestao/alunos")
  revalidatePath("/gestao/auditoria")
  revalidatePath("/aluno/perfil")
  return { ok: true }
}

export async function acaoExcluirAluno(_: EstadoForm, formData: FormData): Promise<EstadoForm> {
  const usuario = await exigirPapel("GESTOR")
  const parsed = excluirAlunoSchema.safeParse({ alunoId: formData.get("alunoId") })
  if (!parsed.success) return { erro: primeiroErro(parsed.error.issues) }

  const resultado = await excluirAluno({ ...parsed.data, autorId: usuario.id })
  if (!resultado.ok) return { erro: resultado.motivo }

  revalidatePath("/gestao/alunos")
  revalidatePath("/gestao/auditoria")
  revalidatePath("/aluno/perfil")
  return { ok: true }
}

export async function acaoCriarDocumentoAluno(
  _: EstadoForm,
  formData: FormData,
): Promise<EstadoForm> {
  const usuario = await exigirPapel("GESTOR")
  const parsed = documentoAlunoSchema.safeParse({
    alunoId: formData.get("alunoId"),
    titulo: formData.get("titulo"),
    categoria: formData.get("categoria"),
    url: formData.get("url"),
    observacao: formData.get("observacao"),
  })
  if (!parsed.success) return { erro: primeiroErro(parsed.error.issues) }

  const resultado = await criarDocumentoAluno({ ...parsed.data, autorId: usuario.id })
  if (!resultado.ok) return { erro: resultado.motivo }

  revalidatePath("/gestao/alunos")
  revalidatePath("/gestao/auditoria")
  revalidatePath("/aluno/perfil")
  return { ok: true }
}

export async function acaoAtualizarStatusTipoAluno(
  _: EstadoForm,
  formData: FormData,
): Promise<EstadoForm> {
  const usuario = await exigirPapel("GESTOR")
  const parsed = statusTipoAlunoSchema.safeParse({
    alunoId: formData.get("alunoId"),
    tipo: formData.get("tipo"),
    status: formData.get("status"),
  })
  if (!parsed.success) return { erro: primeiroErro(parsed.error.issues) }

  const resultado = await atualizarStatusTipoAluno({ ...parsed.data, autorId: usuario.id })
  if (!resultado.ok) return { erro: resultado.motivo }

  revalidatePath("/gestao/alunos")
  revalidatePath("/gestao/auditoria")
  revalidatePath("/aluno/perfil")
  return { ok: true }
}

export async function acaoCriarTurma(_: EstadoForm, formData: FormData): Promise<EstadoForm> {
  const usuario = await exigirPapel("GESTOR")
  const parsed = turmaRecorrenteSchema.safeParse({
    modalidadeId: formData.get("modalidadeId"),
    professorId: formData.get("professorId"),
    nome: formData.get("nome"),
    diasSemana: formData.getAll("diasSemana"),
    horaInicio: formData.get("horaInicio"),
    horaFim: formData.get("horaFim"),
    capacidade: formData.get("capacidade"),
    local: formData.get("local"),
    nivel: formData.get("nivel"),
  })
  if (!parsed.success) return { erro: primeiroErro(parsed.error.issues) }

  try {
    const resultado = await criarTurmasRecorrentes({ ...parsed.data, autorId: usuario.id })
    if (!resultado.ok) return { erro: resultado.motivo }
  } catch {
    return { erro: "Não foi possível criar a turma." }
  }
  revalidatePath("/gestao/turmas")
  revalidatePath("/gestao/auditoria")
  return { ok: true }
}

export async function acaoAtualizarDadosTurma(
  _: EstadoForm,
  formData: FormData,
): Promise<EstadoForm> {
  const usuario = await exigirPapel("GESTOR")
  const parsed = dadosTurmaSchema.safeParse({
    turmaId: formData.get("turmaId"),
    modalidadeId: formData.get("modalidadeId"),
    professorId: formData.get("professorId"),
    nome: formData.get("nome"),
    diasSemana: formData.getAll("diasSemana"),
    horaInicio: formData.get("horaInicio"),
    horaFim: formData.get("horaFim"),
    capacidade: formData.get("capacidade"),
    local: formData.get("local"),
    nivel: formData.get("nivel"),
    ativa: formData.get("ativa"),
  })
  if (!parsed.success) return { erro: primeiroErro(parsed.error.issues) }

  const resultado = await atualizarDadosTurmaRecorrente({ ...parsed.data, autorId: usuario.id })
  if (!resultado.ok) return { erro: resultado.motivo }

  revalidatePath("/gestao/turmas")
  revalidatePath("/gestao/auditoria")
  revalidatePath("/professor/turmas")
  return { ok: true }
}

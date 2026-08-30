import "server-only"
import { Prisma } from "@prisma/client"
import { gerarHashSenha } from "@/lib/auth/senha"
import { db } from "@/lib/db"
import { registrarLog } from "@/lib/services/auditoria.service"
import {
  obterOuCriarMensalidadeNaTransacao,
  registrarMensalidadeInicialPaga,
} from "@/lib/services/financeiro.service"
import { chaveCompetencia } from "@/lib/utils/datas"
import type {
  AprovacaoMatriculaInput,
  SolicitacaoMatriculaInput,
} from "@/lib/validations/matricula"

type DadosComprovante = {
  url: string
  contentType: string
  nomeOriginal: string
}

export function listarOpcoesPublicasMatricula() {
  return db.modalidade.findMany({
    where: { ativa: true },
    orderBy: { nome: "asc" },
    select: {
      id: true,
      nome: true,
      descricao: true,
      turmas: {
        where: {
          ativa: true,
          ehEvento: false,
          horaInicio: { not: null },
          horaFim: { not: null },
        },
        orderBy: [{ horaInicio: "asc" }, { criadoEm: "asc" }],
        select: {
          id: true,
          nome: true,
          diaSemana: true,
          diasSemana: true,
          horaInicio: true,
          horaFim: true,
          local: true,
          nivel: true,
          professor: { select: { usuario: { select: { nome: true } } } },
        },
      },
    },
  })
}

export async function solicitarMatricula(
  params: SolicitacaoMatriculaInput & { comprovante?: DadosComprovante | null },
) {
  const existente = await db.usuario.findUnique({
    where: { email: params.email },
    select: { id: true },
  })
  if (existente) {
    return { ok: false as const, motivo: "Este e-mail já possui cadastro. Use a tela de acesso." }
  }

  const senhaHash = await gerarHashSenha(params.senha)

  try {
    const solicitacao = await db.$transaction(async (tx) => {
      const modalidade = await tx.modalidade.findFirst({
        where: { id: params.modalidadeId, ativa: true },
        select: { id: true, nome: true },
      })
      if (!modalidade) throw new ErroMatricula("A modalidade selecionada não está disponível.")

      const criada = await tx.solicitacaoMatricula.create({
        data: {
          nome: params.nome,
          email: params.email,
          senhaHash,
          cpf: params.cpf,
          telefone: params.telefone,
          dataNascimento: params.dataNascimento,
          endereco: params.endereco,
          contatoEmergencia: params.contatoEmergencia,
          restricoesMedicas: params.restricoesMedicas,
          modalidadeId: modalidade.id,
          comprovantePagamentoUrl: params.comprovante?.url ?? null,
          comprovanteContentType: params.comprovante?.contentType ?? null,
          comprovanteNomeOriginal: params.comprovante?.nomeOriginal ?? null,
        },
      })

      await registrarLog(
        {
          autorId: null,
          acao: "MATRICULA_SOLICITADA",
          entidade: "SolicitacaoMatricula",
          entidadeId: criada.id,
          valorNovo: {
            modalidadeId: modalidade.id,
            modalidadeNome: modalidade.nome,
            comprovanteInformado: Boolean(params.comprovante),
          },
        },
        tx,
      )

      return criada
    })

    return { ok: true as const, solicitacao }
  } catch (erro) {
    if (erro instanceof ErroMatricula) return { ok: false as const, motivo: erro.message }
    if (erro instanceof Prisma.PrismaClientKnownRequestError && erro.code === "P2002") {
      return {
        ok: false as const,
        motivo: "Já existe uma matrícula ou cadastro com este e-mail ou CPF.",
      }
    }
    throw erro
  }
}

export function listarMatriculasPendentes() {
  return db.solicitacaoMatricula.findMany({
    where: { status: "PENDENTE" },
    orderBy: { criadoEm: "asc" },
    select: {
      id: true,
      nome: true,
      email: true,
      cpf: true,
      telefone: true,
      dataNascimento: true,
      endereco: true,
      contatoEmergencia: true,
      restricoesMedicas: true,
      comprovantePagamentoUrl: true,
      comprovanteContentType: true,
      comprovanteNomeOriginal: true,
      criadoEm: true,
      modalidade: { select: { id: true, nome: true } },
    },
  })
}

export async function aprovarMatricula(
  params: AprovacaoMatriculaInput & { autorId: string; agora?: Date },
) {
  const agora = params.agora ?? new Date()
  if (params.competenciaEsperada !== chaveCompetencia(agora)) {
    return {
      ok: false as const,
      motivo: "A competência mudou. Atualize a página e analise a matrícula novamente.",
    }
  }
  try {
    return await db.$transaction(async (tx) => {
      const solicitacao = await tx.solicitacaoMatricula.findUnique({
        where: { id: params.solicitacaoId },
        include: { modalidade: { select: { id: true, nome: true, ativa: true } } },
      })
      if (solicitacao?.status !== "PENDENTE") {
        return { ok: false as const, motivo: "Esta matrícula já foi analisada ou não existe." }
      }
      if (!solicitacao.senhaHash) {
        return { ok: false as const, motivo: "Esta solicitação não possui credenciais válidas." }
      }
      if (!solicitacao.modalidade.ativa) {
        return { ok: false as const, motivo: "A modalidade solicitada está inativa." }
      }
      if (params.comprovanteConfirmado && !solicitacao.comprovantePagamentoUrl) {
        return { ok: false as const, motivo: "Esta matrícula não possui comprovante anexado." }
      }

      const plano = await tx.plano.findFirst({
        where: { id: params.planoId, ativo: true },
        select: { id: true, nome: true },
      })
      if (!plano) return { ok: false as const, motivo: "Selecione um plano ativo." }

      const reservada = await tx.solicitacaoMatricula.updateMany({
        where: { id: solicitacao.id, status: "PENDENTE" },
        data: { status: "APROVADA" },
      })
      if (reservada.count !== 1) {
        return { ok: false as const, motivo: "Esta matrícula acabou de ser analisada." }
      }

      const usuario = await tx.usuario.create({
        data: {
          nome: solicitacao.nome,
          email: solicitacao.email,
          senhaHash: solicitacao.senhaHash,
          dataNascimento: solicitacao.dataNascimento,
          papel: "ALUNO",
          aluno: {
            create: {
              tipo: "MENSALISTA",
              status: "ATIVO",
              cpf: solicitacao.cpf,
              telefone: solicitacao.telefone,
              dataNascimento: solicitacao.dataNascimento,
              endereco: solicitacao.endereco,
              dataInicio: agora,
              contatoEmergencia: solicitacao.contatoEmergencia,
              restricoesMedicas: solicitacao.restricoesMedicas,
              planoId: plano.id,
              diaVencimento: params.diaVencimento,
              modalidades: { connect: { id: solicitacao.modalidade.id } },
              modalidadesPlano: {
                create: {
                  modalidadeId: solicitacao.modalidade.id,
                  plataformaExterna: null,
                },
              },
            },
          },
        },
        include: { aluno: true },
      })
      if (!usuario.aluno) throw new ErroMatricula("Não foi possível criar o aluno.")

      const mensalidade = params.comprovanteConfirmado
        ? await registrarMensalidadeInicialPaga(tx, {
            alunoId: usuario.aluno.id,
            competenciaEsperada: params.competenciaEsperada,
            pagoEm: params.pagoEm!,
            formaPagamento: "PIX",
            observacao: "Comprovante PIX confirmado na aprovação da matrícula.",
            autorId: params.autorId,
            agora,
          })
        : await obterOuCriarMensalidadeNaTransacao(tx, {
            alunoId: usuario.aluno.id,
            competencia: params.competenciaEsperada,
            autorId: params.autorId,
          })
      if (!mensalidade.ok) throw new ErroMatricula(mensalidade.motivo)

      await tx.solicitacaoMatricula.update({
        where: { id: solicitacao.id },
        data: {
          status: "APROVADA",
          alunoId: usuario.aluno.id,
          planoAprovadoId: plano.id,
          analisadoPorId: params.autorId,
          analisadoEm: agora,
          senhaHash: null,
        },
      })

      await registrarLog(
        {
          autorId: params.autorId,
          acao: "ALUNO_CRIADO",
          entidade: "Aluno",
          entidadeId: usuario.aluno.id,
          valorNovo: {
            origem: "SOLICITACAO_MATRICULA",
            usuarioId: usuario.id,
            tipo: "MENSALISTA",
            status: "ATIVO",
            planoId: plano.id,
            modalidadeIds: [solicitacao.modalidade.id],
          },
        },
        tx,
      )
      await registrarLog(
        {
          autorId: params.autorId,
          acao: "MATRICULA_APROVADA",
          entidade: "SolicitacaoMatricula",
          entidadeId: solicitacao.id,
          valorAntigo: { status: "PENDENTE" },
          valorNovo: {
            status: "APROVADA",
            alunoId: usuario.aluno.id,
            planoId: plano.id,
            modalidadeId: solicitacao.modalidade.id,
            diaVencimento: params.diaVencimento,
            comprovanteConfirmado: params.comprovanteConfirmado,
          },
        },
        tx,
      )

      return { ok: true as const, alunoId: usuario.aluno.id }
    })
  } catch (erro) {
    if (erro instanceof ErroMatricula) return { ok: false as const, motivo: erro.message }
    if (erro instanceof Prisma.PrismaClientKnownRequestError && erro.code === "P2002") {
      return {
        ok: false as const,
        motivo: "Já existe um aluno com o e-mail ou CPF desta solicitação.",
      }
    }
    throw erro
  }
}

class ErroMatricula extends Error {}

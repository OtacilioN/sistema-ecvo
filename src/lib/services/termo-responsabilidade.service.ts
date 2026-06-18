import "server-only"
import type { Prisma } from "@prisma/client"
import { db } from "@/lib/db"
import {
  DECLARACAO_RESPONSAVEL_MENOR_ID,
  DECLARACOES_TERMO_IDS,
  menorDeIdade,
  TERMO_RESPONSABILIDADE_CIDADE,
  TERMO_RESPONSABILIDADE_VERSAO,
} from "@/lib/termo-responsabilidade"
import { registrarLog } from "./auditoria.service"

export const MENSAGEM_TERMO_RESPONSABILIDADE_PENDENTE =
  "Aceite o termo de responsabilidade para agendar aulas e fazer check-in."

export function todasDeclaracoesDoTermoAceitas(params: {
  declaracoes: string[]
  menorDeIdade: boolean
}) {
  const obrigatorias = params.menorDeIdade
    ? [...DECLARACOES_TERMO_IDS, DECLARACAO_RESPONSAVEL_MENOR_ID]
    : DECLARACOES_TERMO_IDS
  return obrigatorias.every((id) => params.declaracoes.includes(id))
}

export async function termoResponsabilidadeAtualAceito(alunoId: string) {
  const aceite = await db.aceiteTermoResponsabilidade.findUnique({
    where: {
      alunoId_termoVersao: {
        alunoId,
        termoVersao: TERMO_RESPONSABILIDADE_VERSAO,
      },
    },
    select: { id: true },
  })
  return Boolean(aceite)
}

export async function aceitarTermoResponsabilidade(params: {
  alunoId: string
  autorId: string
  declaracoes: string[]
  ip?: string | null
  userAgent?: string | null
  metadados?: Prisma.InputJsonObject
}) {
  const aluno = await db.aluno.findUnique({
    where: { id: params.alunoId },
    select: {
      id: true,
      cpf: true,
      dataNascimento: true,
      usuario: { select: { dataNascimento: true, nome: true } },
      responsavel: { select: { nome: true, cpf: true, email: true, telefone: true } },
    },
  })
  if (!aluno) return { ok: false as const, motivo: "Aluno não encontrado." }

  const ehMenor = menorDeIdade(aluno.dataNascimento ?? aluno.usuario.dataNascimento)
  if (
    !todasDeclaracoesDoTermoAceitas({
      declaracoes: params.declaracoes,
      menorDeIdade: ehMenor,
    })
  ) {
    return { ok: false as const, motivo: "Marque todos os aceites obrigatórios." }
  }

  const declaracoesAceitas = params.declaracoes.reduce<Record<string, boolean>>(
    (acc, declaracao) => {
      acc[declaracao] = true
      return acc
    },
    {},
  )

  const aceite = await db.$transaction(async (tx) => {
    const salvo = await tx.aceiteTermoResponsabilidade.upsert({
      where: {
        alunoId_termoVersao: {
          alunoId: params.alunoId,
          termoVersao: TERMO_RESPONSABILIDADE_VERSAO,
        },
      },
      create: {
        alunoId: params.alunoId,
        termoVersao: TERMO_RESPONSABILIDADE_VERSAO,
        nomeAluno: aluno.usuario.nome,
        cpfAluno: aluno.cpf,
        cidade: TERMO_RESPONSABILIDADE_CIDADE,
        menorDeIdade: ehMenor,
        declaracoesAceitas,
        ip: params.ip,
        userAgent: params.userAgent,
        metadados: params.metadados,
      },
      update: {
        nomeAluno: aluno.usuario.nome,
        cpfAluno: aluno.cpf,
        cidade: TERMO_RESPONSABILIDADE_CIDADE,
        menorDeIdade: ehMenor,
        declaracoesAceitas,
        ip: params.ip,
        userAgent: params.userAgent,
        metadados: params.metadados,
        aceitoEm: new Date(),
      },
    })

    await registrarLog(
      {
        autorId: params.autorId,
        acao: "TERMO_RESPONSABILIDADE_ACEITO",
        entidade: "AceiteTermoResponsabilidade",
        entidadeId: salvo.id,
        valorNovo: {
          alunoId: params.alunoId,
          termoVersao: TERMO_RESPONSABILIDADE_VERSAO,
          nomeAluno: aluno.usuario.nome,
          cpfAluno: aluno.cpf,
          cidade: TERMO_RESPONSABILIDADE_CIDADE,
          menorDeIdade: ehMenor,
          responsavel: ehMenor ? aluno.responsavel : null,
          declaracoesAceitas,
          ip: params.ip,
          userAgent: params.userAgent,
          metadados: params.metadados,
        },
      },
      tx,
    )

    return salvo
  })

  return { ok: true as const, aceiteId: aceite.id }
}

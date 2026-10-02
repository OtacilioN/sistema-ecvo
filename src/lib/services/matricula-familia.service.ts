import "server-only"
import { Prisma } from "@prisma/client"
import { gerarHashSenha } from "@/lib/auth/senha"
import { db } from "@/lib/db"
import { registrarLog } from "@/lib/services/auditoria.service"
import { solicitacaoMatriculaFamiliaSchema } from "@/lib/validations/matricula-familia"

class ErroMatriculaFamilia extends Error {}

export function obterPlanoFamilia(cliente: Prisma.TransactionClient = db) {
  return cliente.plano.findFirst({
    where: { familia: true, ativo: true, periodicidade: "MENSAL" },
    select: { id: true, nome: true, valor: true, periodicidade: true },
  })
}

export async function solicitarMatriculaFamilia(entrada: unknown) {
  const validacao = solicitacaoMatriculaFamiliaSchema.safeParse(entrada)
  if (!validacao.success) {
    return {
      ok: false as const,
      motivo: validacao.error.issues[0]?.message ?? "Revise os dados do plano família.",
    }
  }
  const { pessoas } = validacao.data
  const hashes = await Promise.all(pessoas.map((pessoa) => gerarHashSenha(pessoa.senha)))

  try {
    return await db.$transaction(async (tx) => {
      const emails = pessoas.map((pessoa) => pessoa.email)
      const cpfs = pessoas.map((pessoa) => pessoa.cpf)
      const [usuario, aluno, solicitacaoExistente, plano] = await Promise.all([
        tx.usuario.findFirst({
          where: { OR: emails.map((email) => ({ email: { equals: email, mode: "insensitive" } })) },
          select: { id: true },
        }),
        tx.aluno.findFirst({ where: { cpf: { in: cpfs } }, select: { id: true } }),
        tx.solicitacaoMatricula.findFirst({
          where: {
            OR: [
              ...emails.map((email) => ({
                email: { equals: email, mode: "insensitive" as const },
              })),
              { cpf: { in: cpfs } },
            ],
          },
          select: { id: true },
        }),
        obterPlanoFamilia(tx),
      ])
      if (usuario || aluno || solicitacaoExistente) {
        throw new ErroMatriculaFamilia(
          "Já existe uma matrícula ou cadastro com um dos e-mails ou CPFs informados.",
        )
      }
      if (!plano || Number(plano.valor) <= 0) {
        throw new ErroMatriculaFamilia("O plano família não está configurado ou disponível.")
      }
      const modalidadeIds = [...new Set(pessoas.flatMap((pessoa) => pessoa.modalidadeIds))]
      const modalidades = await tx.modalidade.findMany({
        where: { id: { in: modalidadeIds }, ativa: true },
        select: { id: true },
      })
      if (modalidades.length !== modalidadeIds.length) {
        throw new ErroMatriculaFamilia("Uma das modalidades selecionadas não está disponível.")
      }

      const matriculaFamilia = await tx.matriculaFamilia.create({
        data: {},
        select: { id: true, tokenAcompanhamento: true, criadoEm: true },
      })
      const solicitacoes = []
      for (const [indice, pessoa] of pessoas.entries()) {
        const criada = await tx.solicitacaoMatricula.create({
          data: {
            nome: pessoa.nome,
            email: pessoa.email,
            senhaHash: hashes[indice],
            cpf: pessoa.cpf,
            telefone: pessoa.telefone,
            dataNascimento: pessoa.dataNascimento,
            endereco: pessoa.endereco,
            contatoEmergencia: pessoa.contatoEmergencia,
            restricoesMedicas: pessoa.restricoesMedicas,
            tipoPagamento: "MENSALISTA",
            beneficioAtivoDeclarado: false,
            modalidadePrincipalId: pessoa.modalidadeIds[0],
            modalidades: {
              create: pessoa.modalidadeIds.map((modalidadeId) => ({ modalidadeId })),
            },
            planoId: plano.id,
            matriculaFamiliaId: matriculaFamilia.id,
          },
        })
        solicitacoes.push(criada)
        await registrarLog(
          {
            autorId: null,
            acao: "MATRICULA_SOLICITADA",
            entidade: "SolicitacaoMatricula",
            entidadeId: criada.id,
            valorNovo: {
              matriculaFamiliaId: matriculaFamilia.id,
              modalidadeIds: pessoa.modalidadeIds,
              tipoPagamento: "MENSALISTA",
              planoId: plano.id,
              planoNome: plano.nome,
              valorPlano: Number(plano.valor),
            },
          },
          tx,
        )
      }
      await tx.matriculaFamilia.update({
        where: { id: matriculaFamilia.id },
        data: { titularSolicitacaoId: solicitacoes[0].id },
      })
      const valorUnitario = Number(plano.valor)
      const valorTotal = (Math.round(valorUnitario * 100) * pessoas.length) / 100
      await registrarLog(
        {
          autorId: null,
          acao: "MATRICULA_SOLICITADA",
          entidade: "MatriculaFamilia",
          entidadeId: matriculaFamilia.id,
          valorNovo: {
            solicitacaoIds: solicitacoes.map((solicitacao) => solicitacao.id),
            titularSolicitacaoId: solicitacoes[0].id,
            quantidadePessoas: pessoas.length,
            planoId: plano.id,
            valorUnitario,
            valorTotal,
          },
        },
        tx,
      )
      return { ok: true as const, matriculaFamilia, solicitacoes, valorUnitario, valorTotal }
    })
  } catch (erro) {
    if (erro instanceof ErroMatriculaFamilia) return { ok: false as const, motivo: erro.message }
    if (erro instanceof Prisma.PrismaClientKnownRequestError && erro.code === "P2002") {
      return {
        ok: false as const,
        motivo: "Já existe uma matrícula ou cadastro com um dos e-mails ou CPFs informados.",
      }
    }
    throw erro
  }
}

export function obterMatriculaFamiliaPublica(token: string) {
  return db.matriculaFamilia.findUnique({
    where: { tokenAcompanhamento: token },
    select: {
      id: true,
      tokenAcompanhamento: true,
      titularSolicitacaoId: true,
      criadoEm: true,
      pessoas: {
        orderBy: [{ criadoEm: "asc" }, { id: "asc" }],
        select: {
          id: true,
          nome: true,
          tokenAcompanhamento: true,
          status: true,
          plano: { select: { id: true, nome: true, valor: true } },
          modalidadePrincipal: { select: { id: true, nome: true } },
          cobrancasAsaas: {
            orderBy: [{ ativa: "desc" }, { geracao: "desc" }],
            take: 1,
            select: {
              id: true,
              status: true,
              statusAsaas: true,
              ultimoErro: true,
              valor: true,
              vencimentoAsaas: true,
              pixCopiaECola: true,
              qrCodeExpiraEm: true,
              invoiceUrl: true,
              recebidaEmAsaas: true,
              criadoEm: true,
            },
          },
        },
      },
    },
  })
}

export type MatriculaFamiliaPublica = NonNullable<
  Awaited<ReturnType<typeof obterMatriculaFamiliaPublica>>
>

import "server-only"
import { Prisma } from "@prisma/client"
import { z } from "zod"
import { db } from "@/lib/db"
import { competenciaCustosFixosSchema } from "@/lib/financeiro/custos-fixos"
import { registrarLog } from "@/lib/services/auditoria.service"

const identificador = z.string().trim().min(1)
const exclusaoSchema = z.object({
  competencia: competenciaCustosFixosSchema,
  plataforma: z.enum(["WELLHUB", "TOTALPASS"]),
  alunoId: identificador,
  modalidadeId: identificador,
  professorId: identificador,
  justificativa: z.string().trim().min(1).max(2000),
})

export type ExclusaoRepasseExternoMensalInput = z.infer<typeof exclusaoSchema>

function escopoExclusao({ justificativa: _, ...escopo }: ExclusaoRepasseExternoMensalInput) {
  return escopo
}

export async function cadastrarExclusoesRepasseExternoMensal(
  autorId: string,
  dados: ExclusaoRepasseExternoMensalInput[],
) {
  identificador.parse(autorId)
  const exclusoes = z.array(exclusaoSchema).min(1).max(100).parse(dados)
  const chaves = exclusoes.map((item) => JSON.stringify(escopoExclusao(item)))
  if (new Set(chaves).size !== chaves.length) {
    throw new Error("Não repita a mesma exclusão no lote.")
  }

  return db.$transaction(
    async (tx) => {
      const gestor = await tx.usuario.findFirst({
        where: { id: autorId, papel: "GESTOR", ativo: true },
        select: { id: true },
      })
      if (!gestor) throw new Error("Somente gestor ativo pode excluir repasses externos.")

      // Ordem estável evita deadlocks entre lotes; protege também escopos ainda não criados.
      for (const chave of [...chaves].sort()) {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('ExclusaoRepasseExternoMensal'), hashtext(${chave}))`
      }

      const preparados = []
      for (const exclusao of exclusoes) {
        const existente = await tx.exclusaoRepasseExternoMensal.findUnique({
          where: {
            competencia_plataforma_alunoId_modalidadeId_professorId: escopoExclusao(exclusao),
          },
        })
        if (existente) {
          if (existente.justificativa !== exclusao.justificativa) {
            throw new Error("A exclusão já existe com outra justificativa; confira a auditoria.")
          }
          preparados.push({ exclusao, existente })
          continue
        }

        const aluno = await tx.aluno.findUnique({
          where: { id: exclusao.alunoId },
          select: {
            tipo: true,
            modalidades: { select: { id: true } },
            modalidadesPlano: { select: { modalidadeId: true, plataformaExterna: true } },
          },
        })
        const modalidadeVinculada =
          aluno &&
          (aluno.modalidadesPlano.length > 0
            ? aluno.modalidadesPlano.some(
                (item) =>
                  item.modalidadeId === exclusao.modalidadeId &&
                  item.plataformaExterna === exclusao.plataforma,
              )
            : aluno.tipo === exclusao.plataforma &&
              aluno.modalidades.some((item) => item.id === exclusao.modalidadeId))
        if (!modalidadeVinculada) {
          throw new Error("Aluno sem vínculo com a modalidade e plataforma informadas.")
        }

        const modalidade = await tx.modalidade.findUnique({
          where: { id: exclusao.modalidadeId },
          select: {
            turmas: {
              where: { ativa: true, professorId: { not: null } },
              select: { professorId: true },
            },
          },
        })
        const professores = new Set(modalidade?.turmas.map((turma) => turma.professorId))
        if (professores.size !== 1 || !professores.has(exclusao.professorId)) {
          throw new Error("Professor não corresponde ao destinatário único da modalidade.")
        }

        const receita = await tx.registroImportado.findFirst({
          where: {
            alunoId: exclusao.alunoId,
            statusConciliacao: "CONCILIADO",
            valorRepasse: { not: null },
            importacao: {
              resumoMensal: true,
              competencia: exclusao.competencia,
              plataforma: exclusao.plataforma,
            },
          },
          select: { id: true },
        })
        if (!receita) throw new Error("Não há receita mensal conciliada no escopo informado.")
        preparados.push({ exclusao, existente: null })
      }

      const registros = []
      for (const { exclusao, existente } of preparados) {
        if (existente) {
          registros.push(existente)
          continue
        }
        const registro = await tx.exclusaoRepasseExternoMensal.create({
          data: { ...exclusao, criadoPorId: autorId },
        })
        await registrarLog(
          {
            autorId,
            acao: "CONFIGURACAO",
            entidade: "ExclusaoRepasseExternoMensal",
            entidadeId: registro.id,
            valorNovo: { ...exclusao, criadoPorId: autorId },
            justificativa: exclusao.justificativa,
          },
          tx,
        )
        registros.push(registro)
      }
      return registros
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted },
  )
}

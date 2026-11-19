import "server-only"
import type { Prisma } from "@prisma/client"
import { z } from "zod"
import { db } from "@/lib/db"
import { vencimentoDaCompetencia } from "@/lib/financeiro/vencimento"
import { registrarLog } from "@/lib/services/auditoria.service"
import { montarRepasseSnapshotMensalidade } from "@/lib/services/financeiro.service"
import { chaveCompetencia, fimExclusivoDoDiaAcademia, inicioDoDiaAcademia } from "@/lib/utils/datas"

const pagamentoSchema = z.object({
  alunoId: z.string().min(1),
  autorId: z.string().min(1),
  competencia: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
  valor: z.number().positive().max(99999999.99).multipleOf(0.01),
  pagoEm: z.date(),
  formaPagamento: z.enum(["MANUAL", "PIX", "DINHEIRO", "CARTAO", "TRANSFERENCIA", "OUTRO"]),
  observacao: z.string().trim().min(1).max(2000),
})

/** Registra o recebimento e libera a matrícula juntos, sem gerar cobrança no provedor. */
export async function destrancarAlunoComPagamentoManual(
  params: Omit<z.infer<typeof pagamentoSchema>, "formaPagamento"> & {
    formaPagamento: string
    agora?: Date
  },
) {
  const parsed = pagamentoSchema.safeParse(params)
  if (!parsed.success) return { ok: false as const, motivo: "Informe os dados do pagamento." }
  const dados = parsed.data
  const agora = params.agora ?? new Date()
  if (dados.competencia !== chaveCompetencia(agora))
    return {
      ok: false as const,
      motivo: "A competência mudou. Atualize a página e tente novamente.",
    }
  if (
    dados.pagoEm >= fimExclusivoDoDiaAcademia(agora) ||
    chaveCompetencia(dados.pagoEm) !== dados.competencia
  )
    return {
      ok: false as const,
      motivo: "Informe uma data de pagamento deste mês, até hoje.",
    }

  return db.$transaction(async (tx) => {
    const autor = await tx.usuario.findUnique({
      where: { id: dados.autorId },
      select: { papel: true, ativo: true },
    })
    if (!autor?.ativo || autor.papel !== "GESTOR")
      return { ok: false as const, motivo: "Somente a gestão pode registrar este pagamento." }

    // Mesmas travas da reativação online e do trancamento: mensalidades antes do aluno.
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`reativacao:${dados.alunoId}`}))::text`
    await tx.$queryRaw`SELECT "id" FROM "Mensalidade" WHERE "alunoId" = ${dados.alunoId} ORDER BY "id" FOR UPDATE`
    await tx.$queryRaw`SELECT "id" FROM "Aluno" WHERE "id" = ${dados.alunoId} FOR UPDATE`
    const aluno = await tx.aluno.findUnique({
      where: { id: dados.alunoId },
      include: {
        usuario: { select: { ativo: true } },
        plano: true,
        modalidadesPlano: {
          include: {
            modalidade: {
              select: {
                id: true,
                nome: true,
                valorRepasseProfessor: true,
                turmas: {
                  where: { ativa: true, professorId: { not: null } },
                  orderBy: { criadoEm: "asc" },
                  select: {
                    professorId: true,
                    professor: { select: { usuario: { select: { nome: true } } } },
                  },
                },
              },
            },
          },
        },
      },
    })
    if (aluno?.status !== "TRANCADO")
      return { ok: false as const, motivo: "A matrícula não está trancada. Atualize a página." }
    if (!aluno.usuario.ativo)
      return {
        ok: false as const,
        motivo: "O acesso do usuário está desativado. Revise o cadastro.",
      }
    const plano = aluno.plano
    if (aluno.tipo !== "MENSALISTA" || !plano?.ativo || plano.periodicidade !== "MENSAL")
      return {
        ok: false as const,
        motivo: "Vincule um plano mensal ativo ao aluno antes de destrancar.",
      }
    if (plano.familia)
      return {
        ok: false as const,
        motivo: "O plano família exige a conciliação do pagamento coletivo.",
      }
    const modalidades = aluno.modalidadesPlano.filter((item) => !item.plataformaExterna)
    if (!modalidades.length)
      return {
        ok: false as const,
        motivo: "Vincule as modalidades contratadas antes de destrancar.",
      }

    const isencao = await tx.operacaoIsencaoTrancamento.findFirst({
      where: { alunoId: aluno.id, status: { in: ["PENDENTE", "PROCESSANDO"] } },
      select: { id: true },
    })
    if (isencao)
      return { ok: false as const, motivo: "Aguarde a conclusão da isenção do trancamento." }
    const contrato = await tx.contratoPixAutomatico.findFirst({
      where: {
        alunoId: aluno.id,
        status: { in: ["CRIANDO", "PENDENTE_AUTORIZACAO", "ATIVO", "CANCELANDO", "ERRO"] },
      },
      select: { id: true },
    })
    const cobrancaReativacao = await tx.cobrancaReativacaoAsaas.findFirst({
      where: {
        alunoId: aluno.id,
        OR: [
          { ativa: true },
          { competencia: dados.competencia, status: "RECEBIDA" },
          { estornoParcialPendenteEm: { not: null } },
        ],
      },
      select: { id: true },
    })
    if (contrato || cobrancaReativacao)
      return {
        ok: false as const,
        motivo:
          "Concilie ou cancele a cobrança de reativação e o Pix Automático antes de registrar o pagamento manual.",
      }
    const mensalidade = await tx.mensalidade.findUnique({
      where: { alunoId_competencia: { alunoId: aluno.id, competencia: dados.competencia } },
      include: {
        cobrancasAsaas: {
          where: {
            OR: [
              { ativa: true },
              { status: "RECEBIDA" },
              { estornoParcialPendenteEm: { not: null } },
            ],
          },
          select: { id: true },
        },
        cobrancaMatriculaAsaas: { select: { id: true } },
      },
    })
    if (mensalidade?.status === "PAGA")
      return {
        ok: false as const,
        motivo: "A competência já foi paga. Concilie o pagamento antes de destrancar.",
      }
    if (
      mensalidade &&
      (mensalidade.cobrancasAsaas.length ||
        mensalidade.cobrancaMatriculaAsaas ||
        mensalidade.cobrancaQuitacaoAsaasId ||
        mensalidade.contratoPixAutomaticoId)
    )
      return {
        ok: false as const,
        motivo:
          "Concilie as cobranças Asaas desta competência antes de registrar o pagamento manual.",
      }
    const pendencia = await tx.mensalidade.findFirst({
      where: {
        alunoId: aluno.id,
        competencia: { not: dados.competencia },
        status: { in: ["EM_ABERTO", "VENCIDA"] },
        OR: [
          { competencia: { lt: dados.competencia } },
          { vencimento: { lt: inicioDoDiaAcademia(agora) } },
          { status: "VENCIDA" },
        ],
      },
      select: { id: true },
    })
    if (pendencia)
      return {
        ok: false as const,
        motivo:
          "Regularize as mensalidades anteriores ou vencidas antes de destrancar, para evitar um novo bloqueio automático.",
      }

    // A gestão pode substituir a isenção atual por um recebimento real, auditando ambos.
    const mesmoPlano = mensalidade?.planoId === plano.id
    const registro = {
      planoId: plano.id,
      status: "PAGA" as const,
      valor: dados.valor,
      valorBase: (mesmoPlano ? mensalidade?.valorBase : null) ?? plano.valorBase ?? plano.valor,
      valorComDesconto: (mesmoPlano ? mensalidade?.valorComDesconto : null) ?? plano.valor,
      pagoEm: dados.pagoEm,
      formaPagamento: dados.formaPagamento,
      observacao: dados.observacao,
      reativacaoMatricula: true,
      reativadaEm: agora,
      repasseSnapshot:
        mesmoPlano && mensalidade?.repasseSnapshot
          ? (mensalidade.repasseSnapshot as Prisma.InputJsonValue)
          : (montarRepasseSnapshotMensalidade({
              modalidadesPlano: modalidades,
            }) as unknown as Prisma.InputJsonValue),
    }
    const paga = mensalidade
      ? await tx.mensalidade.update({ where: { id: mensalidade.id }, data: registro })
      : await tx.mensalidade.create({
          data: {
            ...registro,
            alunoId: aluno.id,
            competencia: dados.competencia,
            vencimento: vencimentoDaCompetencia(
              dados.competencia,
              aluno.diaVencimento,
              aluno.vencimentoMesSeguinte,
            ),
          },
        })
    await tx.aluno.update({ where: { id: aluno.id }, data: { status: "ATIVO" } })
    await registrarLog(
      {
        autorId: dados.autorId,
        acao: "PAGAMENTO",
        entidade: "Mensalidade",
        entidadeId: paga.id,
        valorAntigo: mensalidade
          ? {
              status: mensalidade.status,
              valor: Number(mensalidade.valor),
              competencia: mensalidade.competencia,
              planoId: mensalidade.planoId,
            }
          : undefined,
        valorNovo: {
          alunoId: aluno.id,
          competencia: dados.competencia,
          status: "PAGA",
          valor: dados.valor,
          pagoEm: dados.pagoEm.toISOString(),
          formaPagamento: dados.formaPagamento,
          reativacaoMatricula: true,
        },
        justificativa: dados.observacao,
      },
      tx,
    )
    await registrarLog(
      {
        autorId: dados.autorId,
        acao: "STATUS_ALUNO",
        entidade: "Aluno",
        entidadeId: aluno.id,
        valorAntigo: { status: "TRANCADO" },
        valorNovo: {
          status: "ATIVO",
          mensalidadeId: paga.id,
          motivo: "PAGAMENTO_MANUAL_DESTRANCAMENTO",
        },
        justificativa: dados.observacao,
      },
      tx,
    )
    return { ok: true as const, mensalidadeId: paga.id }
  })
}

import "server-only"
import type { Mensalidade, Prisma } from "@prisma/client"
import { STATUS_ALUNO_OPERACIONAIS } from "@/lib/alunos/status"
import { VALOR_MENSALIDADE_AULA_AVULSA } from "@/lib/aula-avulsa"
import { db } from "@/lib/db"
import { registrarLog } from "@/lib/services/auditoria.service"
import {
  lerRepasseSnapshotMensalidade,
  montarRepasseSnapshotMensalidade,
  vencimentoDaCompetencia,
} from "@/lib/services/financeiro.service"
import { chaveCompetencia, formatarDataInput } from "@/lib/utils/datas"

/** Também executado na autenticação, para proteger sessões abertas antes do vencimento. */
export async function trancarAvulsosExpirados(params: { alunoId?: string; agora?: Date } = {}) {
  const agora = params.agora ?? new Date()
  const acessos = await db.acessoAulaAvulsa.findMany({
    where: {
      ...(params.alunoId ? { alunoId: params.alunoId } : {}),
      status: { in: ["ATIVO", "USADO"] },
      prazoConversao: { lte: agora },
      aluno: { tipo: "AVULSO", planoId: null, status: { in: [...STATUS_ALUNO_OPERACIONAIS] } },
    },
    select: { id: true, alunoId: true },
    orderBy: { id: "asc" },
  })
  let trancados = 0
  for (const acesso of acessos) {
    const mudou = await db.$transaction(async (tx) => {
      // Mesma ordem de locks da conversão do complemento: acesso, depois aluno.
      await tx.$queryRaw`SELECT "id" FROM "AcessoAulaAvulsa" WHERE "id" = ${acesso.id} FOR UPDATE`
      await tx.$queryRaw`SELECT "id" FROM "Aluno" WHERE "id" = ${acesso.alunoId} FOR UPDATE`
      const atual = await tx.aluno.findUnique({
        where: { id: acesso.alunoId },
        select: { status: true },
      })
      const resultado = await tx.aluno.updateMany({
        where: {
          id: acesso.alunoId,
          tipo: "AVULSO",
          planoId: null,
          status: { in: [...STATUS_ALUNO_OPERACIONAIS] },
          acessosAulaAvulsa: {
            some: {
              id: acesso.id,
              status: { in: ["ATIVO", "USADO"] },
              prazoConversao: { lte: agora },
            },
          },
        },
        data: { status: "TRANCADO" },
      })
      if (!resultado.count) return false
      await registrarLog(
        {
          autorId: null,
          acao: "STATUS_ALUNO",
          entidade: "Aluno",
          entidadeId: acesso.alunoId,
          valorAntigo: { status: atual?.status ?? "ATIVO" },
          valorNovo: { status: "TRANCADO", acessoAulaAvulsaId: acesso.id },
          justificativa:
            "Prazo do complemento da aula avulsa encerrado sem conversão em mensalista.",
        },
        tx,
      )
      return true
    })
    if (mudou) trancados++
  }
  return { trancados }
}

const modalidadeParaRepasse = {
  id: true,
  nome: true,
  valorRepasseProfessor: true,
  turmas: {
    where: { ativa: true, professorId: { not: null } },
    orderBy: { criadoEm: "asc" },
    select: { professorId: true, professor: { select: { usuario: { select: { nome: true } } } } },
  },
} satisfies Prisma.ModalidadeSelect

/** Reserva uma mensalidade, sem liberar o aluno nem contratar o plano antes do recebimento. */
export async function prepararMensalidadeReativacao(params: {
  alunoId: string
  autorId: string
  agora?: Date
}) {
  const agora = params.agora ?? new Date()
  const competencia = chaveCompetencia(agora)
  return db.$transaction(async (tx) => {
    // Serializa visitas simultâneas sem inverter os locks de mensalidade/aluno do webhook.
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`reativacao:${params.alunoId}`}))::text`
    const aluno = await tx.aluno.findUnique({
      where: { id: params.alunoId },
      include: {
        plano: true,
        modalidadesPlano: { include: { modalidade: { select: modalidadeParaRepasse } } },
        solicitacaoMatricula: {
          select: { plano: true, modalidadePrincipal: { select: modalidadeParaRepasse } },
        },
      },
    })
    if (aluno?.status !== "TRANCADO") {
      return { ok: false as const, motivo: "A matrícula não está trancada." }
    }
    const planoOriginalAvulso = aluno.solicitacaoMatricula?.plano
    const plano =
      aluno.plano ??
      (aluno.tipo === "AVULSO" &&
      planoOriginalAvulso?.ativo &&
      planoOriginalAvulso.periodicidade === "MENSAL" &&
      Number(planoOriginalAvulso.valor) === VALOR_MENSALIDADE_AULA_AVULSA
        ? planoOriginalAvulso
        : null) ??
      (aluno.tipo === "AVULSO"
        ? await tx.plano.findFirst({
            where: {
              ativo: true,
              periodicidade: "MENSAL",
              valor: VALOR_MENSALIDADE_AULA_AVULSA,
            },
            orderBy: [{ padrao: "desc" }, { criadoEm: "asc" }],
          })
        : null)
    if (!plano?.ativo || plano.periodicidade !== "MENSAL") {
      return {
        ok: false as const,
        motivo: "O plano mensal para reativação não está disponível. Procure a gestão.",
      }
    }
    const modalidades = aluno.plano
      ? aluno.modalidadesPlano.filter((item) => !item.plataformaExterna)
      : aluno.solicitacaoMatricula
        ? [{ modalidade: aluno.solicitacaoMatricula.modalidadePrincipal, plataformaExterna: null }]
        : []
    if (!modalidades.length) {
      return {
        ok: false as const,
        motivo: "Nenhuma modalidade está vinculada à mensalidade. Procure a gestão.",
      }
    }
    const existente = await tx.mensalidade.findUnique({
      where: { alunoId_competencia: { alunoId: aluno.id, competencia } },
    })
    if (
      existente &&
      (existente.planoId !== plano.id ||
        Number(existente.valor) !== Number(plano.valor) ||
        !["EM_ABERTO", "VENCIDA"].includes(existente.status) ||
        existente.contratoPixAutomaticoId)
    ) {
      return {
        ok: false as const,
        motivo: "A mensalidade deste mês requer revisão da gestão para reativar a matrícula.",
      }
    }
    if (existente?.reativacaoMatricula) return { ok: true as const, mensalidade: existente, plano }
    const repasseSnapshot = montarRepasseSnapshotMensalidade({ modalidadesPlano: modalidades })
    const mensalidade = existente
      ? await tx.mensalidade.update({
          where: { id: existente.id },
          data: { reativacaoMatricula: true, reativadaEm: null },
        })
      : await tx.mensalidade.create({
          data: {
            alunoId: aluno.id,
            planoId: plano.id,
            competencia,
            valor: plano.valor,
            vencimento: vencimentoDaCompetencia(
              competencia,
              Number(formatarDataInput(agora).slice(-2)),
            ),
            reativacaoMatricula: true,
            repasseSnapshot: repasseSnapshot as unknown as Prisma.InputJsonValue,
            observacao: "Reativação da matrícula; sem crédito da aula avulsa.",
          },
        })
    await registrarLog(
      {
        autorId: params.autorId,
        acao: "PAGAMENTO",
        entidade: "Mensalidade",
        entidadeId: mensalidade.id,
        valorNovo: {
          reativacaoMatricula: true,
          competencia,
          valor: Number(mensalidade.valor),
          planoId: plano.id,
        },
        justificativa:
          "Mensalidade preparada para reativação; matrícula permanece trancada até o recebimento.",
      },
      tx,
    )
    return { ok: true as const, mensalidade, plano }
  })
}

/** Chamado exclusivamente após a baixa validada de um PAYMENT_RECEIVED, na mesma transação. */
export async function efetivarReativacaoMatricula(
  tx: Prisma.TransactionClient,
  mensalidade: Pick<
    Mensalidade,
    | "id"
    | "alunoId"
    | "planoId"
    | "valor"
    | "repasseSnapshot"
    | "reativacaoMatricula"
    | "reativadaEm"
  >,
  recebidaEm: Date,
) {
  if (!mensalidade.reativacaoMatricula || mensalidade.reativadaEm) return
  await tx.$queryRaw`SELECT "id" FROM "Aluno" WHERE "id" = ${mensalidade.alunoId} FOR UPDATE`
  const aluno = await tx.aluno.findUnique({ where: { id: mensalidade.alunoId } })
  if (aluno?.status !== "TRANCADO") return
  if (aluno.planoId && aluno.planoId !== mensalidade.planoId) {
    throw new Error("O plano foi alterado durante a reativação. Conciliação necessária.")
  }
  const modalidadeIds = [
    ...new Set(
      lerRepasseSnapshotMensalidade(mensalidade.repasseSnapshot)
        .filter((item) => !item.plataformaExterna && item.modalidadeId)
        .map((item) => item.modalidadeId!),
    ),
  ]
  if (!mensalidade.planoId || !modalidadeIds.length) {
    throw new Error("A mensalidade de reativação não possui plano ou modalidade.")
  }
  if (!aluno.planoId) {
    for (const modalidadeId of modalidadeIds) {
      await tx.alunoPlanoModalidade.upsert({
        where: { alunoId_modalidadeId: { alunoId: aluno.id, modalidadeId } },
        update: { plataformaExterna: null },
        create: { alunoId: aluno.id, modalidadeId, plataformaExterna: null },
      })
    }
  }
  await tx.aluno.update({
    where: { id: aluno.id },
    data: {
      status: "ATIVO",
      tipo: aluno.tipo === "AVULSO" ? "MENSALISTA" : aluno.tipo,
      planoId: mensalidade.planoId,
      ...(aluno.planoId
        ? {}
        : { diaVencimento: Math.min(28, Number(formatarDataInput(recebidaEm).slice(-2))) }),
    },
  })
  await tx.mensalidade.update({ where: { id: mensalidade.id }, data: { reativadaEm: recebidaEm } })
  await registrarLog(
    {
      autorId: null,
      acao: "STATUS_ALUNO",
      entidade: "Aluno",
      entidadeId: aluno.id,
      valorAntigo: { status: "TRANCADO", tipo: aluno.tipo, planoId: aluno.planoId },
      valorNovo: {
        status: "ATIVO",
        tipo: aluno.tipo === "AVULSO" ? "MENSALISTA" : aluno.tipo,
        planoId: mensalidade.planoId,
        mensalidadeId: mensalidade.id,
      },
      justificativa: "Matrícula reativada após recebimento da mensalidade pelo Asaas.",
    },
    tx,
  )
}

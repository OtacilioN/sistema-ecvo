import "server-only"
import { randomUUID } from "node:crypto"
import type { Prisma } from "@prisma/client"
import {
  type CobrancaAsaas as CobrancaRemotaAsaas,
  criarCobrancaAsaas,
  excluirCobrancaAsaas,
  listarCobrancasAsaas,
  obterCobrancaAsaas,
  obterQrCodePixAsaas,
} from "@/lib/asaas/client"
import { interpretarDataAsaas } from "@/lib/asaas/datas"
import { eventoPagamentoParaStatusAsaas } from "@/lib/asaas/estado"
import { mensagemErroAsaasSegura } from "@/lib/asaas/seguranca"
import { db } from "@/lib/db"
import { garantirClienteAsaas, processarWebhookAsaas } from "@/lib/services/asaas.service"
import { registrarLog } from "@/lib/services/auditoria.service"
import { isencaoAtualDoTrancamento } from "@/lib/services/elegibilidade-reativacao.service"
import { montarRepasseSnapshotMensalidade } from "@/lib/services/financeiro.service"
import {
  payloadSplitAsaas,
  persistirSplitsRemotos,
  prepararSplitsPagamento,
} from "@/lib/services/split-asaas.service"
import { chaveCompetencia, dataCivilParaDate, formatarDataInput } from "@/lib/utils/datas"

/** A cobrança é separada da mensalidade isenta e não altera sua competência nem status. */
export async function prepararCobrancaReativacaoAvulsa(params: {
  alunoId: string
  autorId: string | null
}) {
  const cliente = await garantirClienteAsaas(params.alunoId, params.autorId)
  if (!cliente.ok) return cliente
  const reserva = await db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "Aluno" WHERE "id" = ${params.alunoId} FOR UPDATE`
    const aluno = await tx.aluno.findUnique({
      where: { id: params.alunoId },
      include: {
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
      return { ok: false as const, motivo: "A matrícula não está trancada." }
    const mensalidadeIsenta = await tx.mensalidade.findUnique({
      where: { alunoId_competencia: { alunoId: aluno.id, competencia: chaveCompetencia() } },
      select: { id: true, alunoId: true, status: true, atualizadoEm: true },
    })
    if (mensalidadeIsenta?.status !== "ISENTA")
      return {
        ok: false as const,
        motivo: "A mensalidade atual requer o fluxo normal de reativação.",
      }
    if (!(await isencaoAtualDoTrancamento(tx, mensalidadeIsenta)))
      return {
        ok: false as const,
        motivo: "A isenção deste mês requer revisão da gestão para reativação.",
      }
    if (
      await tx.operacaoIsencaoTrancamento.findFirst({
        where: { alunoId: aluno.id, status: { in: ["PENDENTE", "PROCESSANDO"] } },
        select: { id: true },
      })
    )
      return {
        ok: false as const,
        motivo: "A isenção ainda está sendo processada. Tente novamente em instantes.",
      }
    if (
      !aluno.plano?.ativo ||
      aluno.plano.periodicidade !== "MENSAL" ||
      Number(aluno.plano.valor) <= 0
    )
      return { ok: false as const, motivo: "O plano mensal não está disponível. Procure a gestão." }
    const modalidades = aluno.modalidadesPlano.filter((item) => !item.plataformaExterna)
    if (!modalidades.length)
      return {
        ok: false as const,
        motivo: "Nenhuma modalidade interna está vinculada. Procure a gestão.",
      }
    const existente = await tx.cobrancaReativacaoAsaas.findFirst({
      where: { alunoId: aluno.id, ativa: true },
      include: { splits: true },
    })
    if (existente) {
      if (existente.status === "CANCELANDO" || existente.operacaoPendente === "CANCELAR")
        return { ok: false as const, motivo: "O cancelamento da cobrança está em processamento." }
      if (
        ["PENDENTE", "VENCIDA"].includes(existente.status) &&
        existente.asaasPaymentId &&
        existente.pixCopiaECola &&
        existente.qrCodeExpiraEm &&
        existente.qrCodeExpiraEm > new Date()
      )
        return {
          ok: true as const,
          proprietaria: false as const,
          nova: false as const,
          cobranca: existente,
        }
      if (existente.status === "CRIANDO" && Date.now() - existente.atualizadoEm.getTime() < 120000)
        return {
          ok: false as const,
          motivo: "A cobrança está sendo processada. Tente novamente em instantes.",
        }
      const retomada = await tx.cobrancaReativacaoAsaas.update({
        where: { id: existente.id },
        data: { status: "CRIANDO", operacaoPendente: "EMITIR", ultimoErro: null },
        include: { splits: true },
      })
      return {
        ok: true as const,
        proprietaria: true as const,
        nova: false as const,
        cobranca: retomada,
      }
    }
    const id = randomUUID()
    const snapshot = montarRepasseSnapshotMensalidade({ modalidadesPlano: modalidades })
    const cobranca = await tx.cobrancaReativacaoAsaas.create({
      data: {
        id,
        alunoId: aluno.id,
        planoId: aluno.plano.id,
        planoNome: aluno.plano.nome,
        competencia: chaveCompetencia(),
        valor: aluno.plano.valor,
        repasseSnapshot: snapshot as unknown as Prisma.InputJsonValue,
        vencimentoAsaas: dataCivilParaDate(formatarDataInput(new Date())),
        asaasCustomerId: cliente.customerId,
        operacaoPendente: "EMITIR",
        externalReference: `ecvo-reativacao:${id}`,
      },
    })
    const splits = await prepararSplitsPagamento(tx, {
      cobrancaReativacaoAsaasId: id,
      repasseSnapshot: cobranca.repasseSnapshot,
      valorCobranca: cobranca.valor,
      externalReferenceCobranca: cobranca.externalReference,
    })
    await registrarLog(
      {
        autorId: params.autorId,
        acao: "PAGAMENTO",
        entidade: "CobrancaReativacaoAsaas",
        entidadeId: id,
        valorNovo: {
          status: "CRIANDO",
          valor: Number(cobranca.valor),
          alunoId: aluno.id,
          competencia: cobranca.competencia,
        },
      },
      tx,
    )
    return {
      ok: true as const,
      proprietaria: true as const,
      nova: true as const,
      cobranca: { ...cobranca, splits },
    }
  })
  if (!reserva.ok) return reserva
  const atual = reserva.cobranca
  if (!reserva.proprietaria)
    return { ok: true as const, cobranca: atual, plano: { nome: atual.planoNome } }
  try {
    const encontradas = await listarCobrancasAsaas({
      externalReference: atual.externalReference,
      limit: 2,
    })
    if (encontradas.data.length > 1)
      throw new Error("Mais de uma cobrança corresponde à reativação; concilie com a gestão.")
    if (!atual.asaasPaymentId && !encontradas.data[0] && !reserva.nova)
      throw new Error(
        "Resultado anterior da cobrança incerto; concilie com a gestão antes de emitir outra.",
      )
    const remota = atual.asaasPaymentId
      ? await obterCobrancaAsaas(atual.asaasPaymentId)
      : encontradas.data[0]
        ? await obterCobrancaAsaas(encontradas.data[0].id)
        : await criarCobrancaAsaas({
            customer: cliente.customerId,
            billingType: "PIX",
            value: Number(atual.valor),
            dueDate: formatarDataInput(atual.vencimentoAsaas),
            description: `Reativação da matrícula - ${atual.competencia}`,
            externalReference: atual.externalReference,
            split: payloadSplitAsaas(atual.splits),
          })
    if (
      remota.customer !== atual.asaasCustomerId ||
      remota.externalReference !== atual.externalReference ||
      remota.billingType !== "PIX" ||
      Math.abs(remota.value - Number(atual.valor)) > 0.001 ||
      remota.dueDate !== formatarDataInput(atual.vencimentoAsaas)
    )
      throw new Error("Cobrança divergente; procure a gestão para conciliação.")
    if (remota.status !== "PENDING" && remota.status !== "OVERDUE") {
      if (eventoPagamentoParaStatusAsaas(remota.status))
        await processarWebhookAsaas({
          id: `consulta-reativacao-avulsa:${remota.id}:${remota.status}`,
          event: eventoPagamentoParaStatusAsaas(remota.status)!,
          payment: { id: remota.id },
        })
      return { ok: false as const, motivo: "A cobrança está sendo conciliada. Atualize a página." }
    }
    const qr = await obterQrCodePixAsaas(remota.id)
    const resultado = await db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "CobrancaReativacaoAsaas" WHERE "id" = ${atual.id} FOR UPDATE`
      const registro = await tx.cobrancaReativacaoAsaas.findUniqueOrThrow({
        where: { id: atual.id },
        include: { splits: true },
      })
      const splits = await persistirSplitsRemotos(tx, registro.splits, remota)
      if (!splits.ok) throw new Error(splits.motivo)
      if (!registro.ativa || registro.status !== "CRIANDO")
        throw new Error("A cobrança mudou durante o processamento; concilie com a gestão.")
      return tx.cobrancaReativacaoAsaas.update({
        where: { id: atual.id },
        data: {
          asaasPaymentId: remota.id,
          status: remota.status === "OVERDUE" ? "VENCIDA" : "PENDENTE",
          statusAsaas: remota.status,
          operacaoPendente: null,
          pixCopiaECola: qr.payload,
          qrCodeExpiraEm: interpretarDataAsaas(qr.expirationDate),
          ultimoErro: null,
        },
      })
    })
    return { ok: true as const, cobranca: resultado, plano: { nome: resultado.planoNome } }
  } catch (erro) {
    const motivo = mensagemErroAsaasSegura(erro)
    await db.cobrancaReativacaoAsaas.updateMany({
      where: { id: atual.id, status: "CRIANDO" },
      data: { status: "ERRO", ultimoErro: motivo },
    })
    return { ok: false as const, motivo }
  }
}

export async function verificarPagamentoCobrancaReativacao(params: {
  alunoId: string
  cobrancaId: string
}) {
  const cobranca = await db.cobrancaReativacaoAsaas.findFirst({
    where: { id: params.cobrancaId, alunoId: params.alunoId },
    select: { asaasPaymentId: true },
  })
  if (!cobranca?.asaasPaymentId) return { ok: false as const, motivo: "Cobrança não encontrada." }
  try {
    const remota = await obterCobrancaAsaas(cobranca.asaasPaymentId)
    if (remota.status === "PENDING") return { ok: true as const }
    const evento = eventoPagamentoParaStatusAsaas(remota.status)
    if (!evento)
      return { ok: false as const, motivo: "A cobrança requer conciliação com a gestão." }
    return await processarWebhookAsaas({
      id: `consulta-reativacao-avulsa:${remota.id}:${remota.status}`,
      event: evento,
      payment: { id: remota.id },
    })
  } catch (erro) {
    return { ok: false as const, motivo: mensagemErroAsaasSegura(erro) }
  }
}

/** Chamado pelo processador autenticado de webhook, na mesma transação de deduplicação. */
export async function aplicarPagamentoCobrancaReativacao(
  tx: Prisma.TransactionClient,
  webhook: import("@/lib/validations/asaas").WebhookAsaas,
) {
  const pagamento = webhook.payment
  if (!pagamento) return null
  const candidata = await tx.cobrancaReativacaoAsaas.findFirst({
    where: {
      OR: [
        { asaasPaymentId: pagamento.id },
        ...(pagamento.externalReference
          ? [{ externalReference: pagamento.externalReference }]
          : []),
      ],
    },
    select: { id: true },
  })
  if (!candidata) return null
  await tx.$queryRaw`SELECT "id" FROM "CobrancaReativacaoAsaas" WHERE "id" = ${candidata.id} FOR UPDATE`
  const cobranca = await tx.cobrancaReativacaoAsaas.findUniqueOrThrow({
    where: { id: candidata.id },
    include: { splits: true },
  })
  if (
    (cobranca.asaasPaymentId && cobranca.asaasPaymentId !== pagamento.id) ||
    !cobranca.asaasCustomerId ||
    pagamento.customer !== cobranca.asaasCustomerId ||
    pagamento.externalReference !== cobranca.externalReference ||
    pagamento.billingType !== "PIX" ||
    pagamento.value === undefined ||
    Math.abs(pagamento.value - Number(cobranca.valor)) > 0.001 ||
    pagamento.dueDate !== formatarDataInput(cobranca.vencimentoAsaas)
  ) {
    return {
      ok: false as const,
      motivo: "Dados da cobrança de reativação divergentes; conciliação necessária.",
    }
  }
  const remota = { split: pagamento.split }
  const splits = await persistirSplitsRemotos(tx, cobranca.splits, remota)
  if (!splits.ok) return { ok: false as const, motivo: splits.motivo }
  if (webhook.event === "PAYMENT_RECEIVED" && cobranca.status !== "RECEBIDA") {
    if (cobranca.status === "ESTORNADA") return { ok: true as const }
    await tx.$queryRaw`SELECT "id" FROM "Aluno" WHERE "id" = ${cobranca.alunoId} FOR UPDATE`
    const aluno = await tx.aluno.findUnique({
      where: { id: cobranca.alunoId },
      select: { status: true, planoId: true },
    })
    const isencaoPendente = await tx.operacaoIsencaoTrancamento.findFirst({
      where: { alunoId: cobranca.alunoId, status: { in: ["PENDENTE", "PROCESSANDO"] } },
      select: { id: true },
    })
    if (isencaoPendente)
      return {
        ok: false as const,
        motivo: "Isenção ainda em processamento; o recebimento será conciliado novamente.",
      }
    const podeReativar =
      cobranca.ativa &&
      cobranca.status !== "CANCELADA" &&
      aluno?.status === "TRANCADO" &&
      aluno.planoId === cobranca.planoId
    const recebidaEm =
      interpretarDataAsaas(pagamento.paymentDate ?? webhook.dateCreated) ?? new Date()
    if (Number.isNaN(recebidaEm.getTime()))
      return { ok: false as const, motivo: "Data de pagamento inválida." }
    const { calcularTaxaAsaas } = await import("@/lib/financeiro/taxa-asaas")
    await tx.cobrancaReativacaoAsaas.update({
      where: { id: cobranca.id },
      data: {
        asaasPaymentId: pagamento.id,
        status: "RECEBIDA",
        operacaoPendente: null,
        ativa: false,
        statusAsaas: pagamento.status,
        recebidaEmAsaas: recebidaEm,
        taxaAsaas: calcularTaxaAsaas(Number(cobranca.valor)),
        pixCopiaECola: null,
        qrCodeExpiraEm: null,
        ultimoErro: podeReativar
          ? null
          : "Pagamento recebido após alteração da matrícula; concilie o acesso.",
      },
    })
    if (podeReativar) {
      await tx.aluno.update({ where: { id: cobranca.alunoId }, data: { status: "ATIVO" } })
      await registrarLog(
        {
          autorId: null,
          acao: "STATUS_ALUNO",
          entidade: "Aluno",
          entidadeId: cobranca.alunoId,
          valorAntigo: { status: "TRANCADO" },
          valorNovo: { status: "ATIVO", cobrancaReativacaoId: cobranca.id },
          justificativa: "Matrícula reativada após recebimento da cobrança separada pelo Asaas.",
        },
        tx,
      )
    } else {
      const gestores = await tx.usuario.findMany({
        where: { papel: "GESTOR", ativo: true },
        select: { id: true },
      })
      if (gestores.length)
        await tx.notificacao.createMany({
          data: gestores.map((gestor) => ({
            usuarioId: gestor.id,
            tipo: "FINANCEIRO" as const,
            titulo: "Pagamento de reativação requer conciliação",
            mensagem: `A matrícula mudou após a emissão da cobrança de reativação ${cobranca.competencia}; revise o acesso.`,
            chaveDeduplicacao: `reativacao-divergente:${cobranca.id}:${gestor.id}`,
          })),
          skipDuplicates: true,
        })
    }
  } else if (webhook.event === "PAYMENT_PARTIALLY_REFUNDED") {
    await tx.cobrancaReativacaoAsaas.update({
      where: { id: cobranca.id },
      data: {
        estornoParcialPendenteEm: new Date(),
        statusAsaas: pagamento.status,
        status: cobranca.status === "RECEBIDA" ? "RECEBIDA" : "ERRO",
        ativa: false,
        operacaoPendente: null,
        ultimoErro: "Estorno parcial exige conciliação manual.",
      },
    })
  } else if (webhook.event === "PAYMENT_REFUNDED") {
    await tx.cobrancaReativacaoAsaas.update({
      where: { id: cobranca.id },
      data: {
        status: "ESTORNADA",
        operacaoPendente: null,
        ativa: false,
        statusAsaas: pagamento.status,
        pixCopiaECola: null,
        qrCodeExpiraEm: null,
        estornoParcialPendenteEm: null,
        ultimoErro: "Estorno total exige conciliação manual do acesso.",
      },
    })
  } else if (
    webhook.event === "PAYMENT_OVERDUE" &&
    ["PENDENTE", "CRIANDO", "ERRO"].includes(cobranca.status)
  ) {
    await tx.cobrancaReativacaoAsaas.update({
      where: { id: cobranca.id },
      data: { status: "VENCIDA", asaasPaymentId: pagamento.id, statusAsaas: pagamento.status },
    })
  } else if (webhook.event === "PAYMENT_DELETED" && cobranca.status !== "RECEBIDA") {
    await tx.cobrancaReativacaoAsaas.update({
      where: { id: cobranca.id },
      data: {
        status: "CANCELADA",
        operacaoPendente: null,
        ativa: false,
        statusAsaas: pagamento.status,
        pixCopiaECola: null,
        qrCodeExpiraEm: null,
      },
    })
  }
  if (
    ["PAYMENT_RECEIVED", "PAYMENT_REFUNDED", "PAYMENT_PARTIALLY_REFUNDED"].includes(webhook.event)
  ) {
    await registrarLog(
      {
        autorId: null,
        acao: "PAGAMENTO",
        entidade: "CobrancaReativacaoAsaas",
        entidadeId: cobranca.id,
        valorAntigo: { status: cobranca.status, valor: Number(cobranca.valor) },
        valorNovo: {
          evento: webhook.event,
          pagamentoId: pagamento.id,
          valorEstornado: pagamento.refundedValue ?? null,
        },
        justificativa: `Evento Asaas ${webhook.id}.`,
      },
      tx,
    )
  }
  if (["PAYMENT_REFUNDED", "PAYMENT_PARTIALLY_REFUNDED"].includes(webhook.event)) {
    const gestores = await tx.usuario.findMany({
      where: { papel: "GESTOR", ativo: true },
      select: { id: true },
    })
    if (gestores.length)
      await tx.notificacao.createMany({
        data: gestores.map((gestor) => ({
          usuarioId: gestor.id,
          tipo: "FINANCEIRO" as const,
          titulo: "Estorno de reativação requer conciliação",
          mensagem: `Revise o estorno e o acesso do aluno na cobrança de reativação ${cobranca.competencia}.`,
          chaveDeduplicacao: `estorno-reativacao:${webhook.id}:${gestor.id}`,
        })),
        skipDuplicates: true,
      })
  }
  return { ok: true as const }
}

/** Fecha no provedor antes de permitir troca manual do estado da matrícula. */
export async function cancelarCobrancaReativacaoAvulsa(params: {
  alunoId: string
  autorId: string | null
}) {
  const cobranca = await db.cobrancaReativacaoAsaas.findFirst({
    where: { alunoId: params.alunoId, ativa: true },
  })
  if (!cobranca) return { ok: true as const, cancelada: false as const }
  if (
    ["CRIANDO", "CANCELANDO"].includes(cobranca.status) &&
    Date.now() - cobranca.atualizadoEm.getTime() < 120_000
  )
    return {
      ok: false as const,
      motivo:
        "A cobrança de reativação está em processamento; aguarde a conciliação antes de alterar a matrícula.",
    }
  const reserva = await db.cobrancaReativacaoAsaas.updateMany({
    where: {
      id: cobranca.id,
      ativa: true,
      status: cobranca.status,
      atualizadoEm: cobranca.atualizadoEm,
    },
    data: { status: "CANCELANDO", operacaoPendente: "CANCELAR", ultimoErro: null },
  })
  if (!reserva.count)
    return { ok: false as const, motivo: "A cobrança de reativação mudou; tente novamente." }
  try {
    let remota: CobrancaRemotaAsaas | undefined
    if (cobranca.asaasPaymentId) {
      remota = await obterCobrancaAsaas(cobranca.asaasPaymentId)
    } else {
      const encontradas = await listarCobrancasAsaas({
        externalReference: cobranca.externalReference,
        limit: 2,
      })
      if (encontradas.data.length > 1)
        throw new Error("Mais de uma cobrança corresponde à referência; conciliação necessária.")
      remota = encontradas.data[0]
      if (!remota)
        throw new Error(
          "Cobrança remota ainda não identificada; concilie antes de alterar a matrícula.",
        )
    }
    if (
      remota.customer !== cobranca.asaasCustomerId ||
      remota.externalReference !== cobranca.externalReference ||
      remota.billingType !== "PIX" ||
      Math.abs(remota.value - Number(cobranca.valor)) > 0.001 ||
      remota.dueDate !== formatarDataInput(cobranca.vencimentoAsaas)
    )
      throw new Error("Cobrança de reativação divergente; conciliação necessária.")
    if (["RECEIVED", "CONFIRMED", "REFUNDED", "PARTIALLY_REFUNDED"].includes(remota.status)) {
      const evento = eventoPagamentoParaStatusAsaas(remota.status)
      if (evento)
        await processarWebhookAsaas({
          id: `conciliacao-cancelar-reativacao:${remota.id}:${remota.status}`,
          event: evento,
          payment: { id: remota.id },
        })
      await db.cobrancaReativacaoAsaas.updateMany({
        where: { id: cobranca.id, status: "CANCELANDO" },
        data: {
          status: "ERRO",
          ultimoErro:
            "Pagamento ou estorno remoto requer conciliação antes de alterar a matrícula.",
        },
      })
      return {
        ok: false as const,
        motivo:
          "A cobrança já foi paga ou está em conciliação; verifique o estado do aluno antes de alterar a matrícula.",
      }
    }
    if (!["PENDING", "OVERDUE", "DELETED"].includes(remota.status))
      throw new Error(
        "A cobrança não está disponível para cancelamento automático; concilie com a gestão.",
      )
    if (remota.status !== "DELETED") {
      const excluida = await excluirCobrancaAsaas(remota.id)
      if (!excluida.deleted || excluida.id !== remota.id)
        throw new Error("O Asaas não confirmou o cancelamento da cobrança.")
    }
    return await db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "CobrancaReativacaoAsaas" WHERE "id" = ${cobranca.id} FOR UPDATE`
      const atual = await tx.cobrancaReativacaoAsaas.findUniqueOrThrow({
        where: { id: cobranca.id },
      })
      if (atual.status === "CANCELADA" && !atual.ativa)
        return { ok: true as const, cancelada: true as const }
      if (atual.status !== "CANCELANDO")
        return {
          ok: false as const,
          motivo: "A cobrança mudou durante o cancelamento; concilie antes de alterar a matrícula.",
        }
      await tx.cobrancaReativacaoAsaas.update({
        where: { id: atual.id },
        data: {
          status: "CANCELADA",
          operacaoPendente: null,
          asaasPaymentId: atual.asaasPaymentId ?? remota.id,
          ativa: false,
          statusAsaas: "DELETED",
          pixCopiaECola: null,
          qrCodeExpiraEm: null,
          ultimoErro: null,
        },
      })
      await registrarLog(
        {
          autorId: params.autorId,
          acao: "PAGAMENTO",
          entidade: "CobrancaReativacaoAsaas",
          entidadeId: atual.id,
          valorAntigo: { status: cobranca.status, ativa: true },
          valorNovo: { status: "CANCELADA", ativa: false },
          justificativa: "Cobrança de reativação cancelada antes de alteração manual da matrícula.",
        },
        tx,
      )
      return { ok: true as const, cancelada: true as const }
    })
  } catch (erro) {
    const motivo = mensagemErroAsaasSegura(erro)
    await db.cobrancaReativacaoAsaas.updateMany({
      where: { id: cobranca.id, status: "CANCELANDO" },
      data: { status: "ERRO", ultimoErro: motivo },
    })
    return { ok: false as const, motivo }
  }
}

/** Retoma operações abandonadas e consulta pagamentos sem depender da visita do aluno. */
export async function reconciliarCobrancasReativacao(params: { limite?: number } = {}) {
  const limite = Math.max(1, Math.min(params.limite ?? 20, 25))
  const limiteReserva = new Date(Date.now() - 120_000)
  const limiteConsulta = new Date(Date.now() - 15 * 60_000)
  const cobrancas = await db.cobrancaReativacaoAsaas.findMany({
    where: {
      ativa: true,
      OR: [
        {
          status: { in: ["PENDENTE", "VENCIDA"] },
          asaasPaymentId: { not: null },
          atualizadoEm: { lt: limiteConsulta },
        },
        { status: { in: ["CRIANDO", "CANCELANDO"] }, atualizadoEm: { lt: limiteReserva } },
        {
          status: "ERRO",
          operacaoPendente: { in: ["EMITIR", "CANCELAR"] },
          atualizadoEm: { lt: limiteConsulta },
        },
      ],
    },
    orderBy: { atualizadoEm: "asc" },
    take: limite,
    select: { id: true, alunoId: true, status: true, asaasPaymentId: true, operacaoPendente: true },
  })
  let concluidas = 0
  let falhas = 0
  let processadas = 0
  const inicio = Date.now()
  for (const cobranca of cobrancas) {
    if (Date.now() - inicio >= 20_000) break
    processadas++
    try {
      const resultado =
        cobranca.status === "CANCELANDO" || cobranca.operacaoPendente === "CANCELAR"
          ? await cancelarCobrancaReativacaoAvulsa({ alunoId: cobranca.alunoId, autorId: null })
          : cobranca.status === "CRIANDO" || cobranca.operacaoPendente === "EMITIR"
            ? await prepararCobrancaReativacaoAvulsa({ alunoId: cobranca.alunoId, autorId: null })
            : await verificarPagamentoCobrancaReativacao({
                alunoId: cobranca.alunoId,
                cobrancaId: cobranca.id,
              })
      if (resultado.ok) {
        concluidas++
        if (["PENDENTE", "VENCIDA"].includes(cobranca.status)) {
          await db.cobrancaReativacaoAsaas.updateMany({
            where: { id: cobranca.id, ativa: true, status: { in: ["PENDENTE", "VENCIDA"] } },
            data: { atualizadoEm: new Date() },
          })
        }
      } else {
        falhas++
        if (["PENDENTE", "VENCIDA"].includes(cobranca.status)) {
          await db.cobrancaReativacaoAsaas.updateMany({
            where: { id: cobranca.id, ativa: true, status: { in: ["PENDENTE", "VENCIDA"] } },
            data: { atualizadoEm: new Date() },
          })
        }
      }
    } catch {
      falhas++
    }
  }
  return { processadas, concluidas, falhas }
}

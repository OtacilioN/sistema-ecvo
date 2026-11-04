import "server-only"
import { randomUUID } from "node:crypto"
import type { Prisma } from "@prisma/client"
import { db } from "@/lib/db"
import {
  cancelarCobrancaAsaasAntesDeBaixaManual,
  cancelarPixAutomatico,
} from "@/lib/services/asaas.service"
import { registrarLog } from "@/lib/services/auditoria.service"

class FalhaIsencao extends Error {}

const LEASE_MS = 5 * 60_000
const RETENTATIVA_MS = 15 * 60_000
const STATUS_CONTRATO_ABERTO = [
  "CRIANDO",
  "PENDENTE_AUTORIZACAO",
  "ATIVO",
  "CANCELANDO",
  "ERRO",
] as const

/** A intenção e o conjunto de mensalidades são gravados na transação do trancamento. */
export async function agendarIsencaoTrancamento(
  tx: Prisma.TransactionClient,
  alunoId: string,
  autorId: string | null,
) {
  const mensalidades = await tx.mensalidade.findMany({
    where: { alunoId, status: { in: ["EM_ABERTO", "VENCIDA"] } },
    select: { id: true },
    orderBy: { id: "asc" },
  })
  return tx.operacaoIsencaoTrancamento.create({
    data: { alunoId, autorId, mensalidadeIds: mensalidades.map((mensalidade) => mensalidade.id) },
    select: { id: true },
  })
}

/** Usar para bloquear reativação e emissão de cobrança enquanto a operação não terminou. */
export async function isencaoTrancamentoPendente(
  cliente: Prisma.TransactionClient | typeof db,
  alunoId: string,
) {
  return Boolean(
    await cliente.operacaoIsencaoTrancamento.findFirst({
      where: { alunoId, status: { in: ["PENDENTE", "PROCESSANDO"] } },
      select: { id: true },
    }),
  )
}

async function renovarLease(id: string, token: string) {
  const resultado = await db.operacaoIsencaoTrancamento.updateMany({
    where: { id, status: "PROCESSANDO", leaseToken: token, leaseAte: { gt: new Date() } },
    data: { leaseAte: new Date(Date.now() + LEASE_MS) },
  })
  if (!resultado.count)
    throw new FalhaIsencao("A operação de isenção perdeu a reserva de processamento.")
}

async function executarOperacao(id: string, token: string) {
  const operacao = await db.operacaoIsencaoTrancamento.findUniqueOrThrow({ where: { id } })
  const mensalidadeIds = Array.isArray(operacao.mensalidadeIds)
    ? operacao.mensalidadeIds.filter((item): item is string => typeof item === "string")
    : []
  if (
    !Array.isArray(operacao.mensalidadeIds) ||
    mensalidadeIds.length !== operacao.mensalidadeIds.length
  ) {
    throw new FalhaIsencao("A lista de mensalidades da operação é inválida.")
  }

  const aluno = await db.aluno.findUnique({
    where: { id: operacao.alunoId },
    select: { status: true },
  })
  if (aluno?.status !== "TRANCADO")
    throw new FalhaIsencao("Matrícula alterada durante a isenção; revisão necessária.")

  // Uma autorização pode debitar ciclos futuros mesmo sem cobrança local ativa.
  const contrato = await db.contratoPixAutomatico.findFirst({
    where: { alunoId: operacao.alunoId, status: { in: [...STATUS_CONTRATO_ABERTO] } },
    select: { id: true, status: true },
  })
  if (contrato) {
    if (contrato.status === "CRIANDO")
      throw new FalhaIsencao("Contratação do Pix Automático em andamento; aguarde a conciliação.")
    const compartilhada = await db.cobrancaAsaas.findFirst({
      where: {
        contratoPixAutomaticoId: contrato.id,
        ativa: true,
        cobrancaFamiliaId: { not: null },
      },
      select: { id: true },
    })
    if (compartilhada) throw new FalhaIsencao("Cobrança compartilhada exige conciliação manual.")
    const cobrancaEmCriacao = await db.cobrancaAsaas.findFirst({
      where: { contratoPixAutomaticoId: contrato.id, ativa: true, status: "CRIANDO" },
      select: { id: true },
    })
    if (cobrancaEmCriacao)
      throw new FalhaIsencao("Emissão de cobrança em andamento; aguarde a reconciliação.")
    await renovarLease(id, token)
    const resultado = await cancelarPixAutomatico({
      alunoId: operacao.alunoId,
      autorId: operacao.autorId,
    })
    if (!resultado.ok) throw new FalhaIsencao(resultado.motivo)
  }
  if (
    await db.contratoPixAutomatico.findFirst({
      where: { alunoId: operacao.alunoId, status: { in: [...STATUS_CONTRATO_ABERTO] } },
      select: { id: true },
    })
  )
    throw new FalhaIsencao("Ainda existe Pix Automático em andamento; conciliação necessária.")

  for (const mensalidadeId of mensalidadeIds) {
    await renovarLease(id, token)
    const mensalidade = await db.mensalidade.findUnique({
      where: { id: mensalidadeId },
      select: { alunoId: true, status: true },
    })
    if (!mensalidade || mensalidade.alunoId !== operacao.alunoId)
      throw new FalhaIsencao("Mensalidade não encontrada para isenção.")
    if (!["EM_ABERTO", "VENCIDA"].includes(mensalidade.status)) continue

    const divergente = await db.cobrancaAsaas.findFirst({
      where: {
        mensalidadeId,
        OR: [{ status: "RECEBIDA" }, { estornoParcialPendenteEm: { not: null } }],
      },
      select: { id: true },
    })
    if (divergente)
      throw new FalhaIsencao("Pagamento ou estorno pendente exige conciliação manual.")

    const cobrancas = await db.cobrancaAsaas.findMany({
      where: { mensalidadeId, ativa: true },
      select: { id: true, status: true, cobrancaFamiliaId: true },
    })
    for (const cobranca of cobrancas) {
      if (cobranca.cobrancaFamiliaId)
        throw new FalhaIsencao("Cobrança compartilhada exige conciliação manual.")
      if (cobranca.status === "RECEBIDA")
        throw new FalhaIsencao("Pagamento confirmado exige conciliação.")
      if (cobranca.status === "CRIANDO")
        throw new FalhaIsencao("Emissão de cobrança em andamento; aguarde a reconciliação.")
      await renovarLease(id, token)
      const resultado = await cancelarCobrancaAsaasAntesDeBaixaManual({
        cobrancaId: cobranca.id,
        autorId: operacao.autorId,
      })
      if (!resultado.ok) throw new FalhaIsencao(resultado.motivo)
    }

    await db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "Mensalidade" WHERE "id" = ${mensalidadeId} FOR UPDATE`
      await tx.$queryRaw`SELECT "id" FROM "Aluno" WHERE "id" = ${operacao.alunoId} FOR UPDATE`
      const reserva = await tx.operacaoIsencaoTrancamento.findFirst({
        where: { id, status: "PROCESSANDO", leaseToken: token, leaseAte: { gt: new Date() } },
        select: { id: true },
      })
      const atual = await tx.mensalidade.findUnique({
        where: { id: mensalidadeId },
        include: {
          aluno: { select: { status: true } },
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
        },
      })
      if (!reserva || !atual || atual.aluno.status !== "TRANCADO")
        throw new FalhaIsencao("Operação ou matrícula alterada durante a isenção.")
      if (!["EM_ABERTO", "VENCIDA"].includes(atual.status)) return
      if (atual.cobrancasAsaas.length)
        throw new FalhaIsencao("Há cobrança ativa; isenção aguardando conciliação.")
      const alterada = await tx.mensalidade.updateMany({
        where: { id: atual.id, status: atual.status, atualizadoEm: atual.atualizadoEm },
        data: {
          status: "ISENTA",
          pagoEm: null,
          formaPagamento: null,
          cobrancaQuitacaoAsaasId: null,
          reativacaoMatricula: false,
        },
      })
      if (!alterada.count) throw new FalhaIsencao("Mensalidade alterada durante a isenção.")
      const isenta = await tx.mensalidade.findUniqueOrThrow({
        where: { id: atual.id },
        select: { atualizadoEm: true },
      })
      await registrarLog(
        {
          autorId: operacao.autorId,
          acao: "PAGAMENTO",
          entidade: "Mensalidade",
          entidadeId: atual.id,
          valorAntigo: {
            status: atual.status,
            competencia: atual.competencia,
            valor: Number(atual.valor),
          },
          valorNovo: {
            status: "ISENTA",
            competencia: atual.competencia,
            valor: Number(atual.valor),
            operacaoId: id,
            atualizadoEm: isenta.atualizadoEm.toISOString(),
          },
          justificativa: "Isenção automática após trancamento da matrícula.",
        },
        tx,
      )
    })
  }

  await renovarLease(id, token)
  const concluida = await db.operacaoIsencaoTrancamento.updateMany({
    where: { id, status: "PROCESSANDO", leaseToken: token },
    data: {
      status: "CONCLUIDA",
      leaseToken: null,
      leaseAte: null,
      ultimoErro: null,
      concluidoEm: new Date(),
    },
  })
  if (!concluida.count)
    throw new FalhaIsencao("A operação de isenção perdeu a reserva de processamento.")
}

/** Processamento em lotes, seguro para retomar após falhas ou interrupção. */
export async function processarIsencoesTrancamento(
  opcoes: { operacaoId?: string; limite?: number } = {},
) {
  const agora = new Date()
  const candidatas = await db.operacaoIsencaoTrancamento.findMany({
    where: {
      ...(opcoes.operacaoId ? { id: opcoes.operacaoId } : {}),
      status: { in: ["PENDENTE", "PROCESSANDO"] },
      OR: [{ leaseAte: null }, { leaseAte: { lte: agora } }],
    },
    select: { id: true },
    orderBy: { criadoEm: "asc" },
    take: Math.max(1, Math.min(opcoes.limite ?? 10, 25)),
  })
  let concluidas = 0
  let falhas = 0
  for (const candidata of candidatas) {
    const token = randomUUID()
    const reservada = await db.operacaoIsencaoTrancamento.updateMany({
      where: {
        id: candidata.id,
        status: { in: ["PENDENTE", "PROCESSANDO"] },
        OR: [{ leaseAte: null }, { leaseAte: { lte: new Date() } }],
      },
      data: {
        status: "PROCESSANDO",
        leaseToken: token,
        leaseAte: new Date(Date.now() + LEASE_MS),
        tentativas: { increment: 1 },
      },
    })
    if (!reservada.count) continue
    try {
      await executarOperacao(candidata.id, token)
      concluidas++
    } catch (erro) {
      falhas++
      await db.$transaction(async (tx) => {
        const pendente = await tx.operacaoIsencaoTrancamento.updateMany({
          where: { id: candidata.id, status: "PROCESSANDO", leaseToken: token },
          data: {
            status: "PENDENTE",
            leaseToken: null,
            leaseAte: new Date(Date.now() + RETENTATIVA_MS),
            ultimoErro:
              erro instanceof FalhaIsencao
                ? erro.message.slice(0, 300)
                : "Não foi possível concluir a isenção.",
          },
        })
        if (!pendente.count) return
        const gestores = await tx.usuario.findMany({
          where: { papel: "GESTOR", ativo: true },
          select: { id: true },
        })
        if (gestores.length) {
          await tx.notificacao.createMany({
            data: gestores.map((gestor) => ({
              usuarioId: gestor.id,
              tipo: "FINANCEIRO" as const,
              titulo: "Isenção pendente de conferência",
              mensagem:
                "Uma isenção após trancamento está pendente de processamento ou conciliação.",
              chaveDeduplicacao: `isencao-trancamento:${candidata.id}:${gestor.id}`,
            })),
            skipDuplicates: true,
          })
        }
      })
    }
  }
  // Uma execução concorrente pode ter adquirido a reserva antes desta chamada.
  // Não anuncie conclusão ao gestor enquanto a operação solicitada segue aberta.
  const operacaoSolicitada = opcoes.operacaoId
    ? await db.operacaoIsencaoTrancamento.findUnique({
        where: { id: opcoes.operacaoId },
        select: { status: true },
      })
    : null
  return {
    ok: falhas === 0 && (!opcoes.operacaoId || operacaoSolicitada?.status === "CONCLUIDA"),
    concluidas,
    falhas,
  }
}

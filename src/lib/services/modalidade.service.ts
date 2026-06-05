import "server-only"
import type { PoliticaCheckinSemComparecimento, Prisma } from "@prisma/client"
import { db } from "@/lib/db"
import { registrarLog } from "@/lib/services/auditoria.service"

// Serviço de MODALIDADES (RF-008/009).

type GraduacaoCatalogo = {
  id?: string | null
  nome: string
  ordem: number
  minHoras: number | null
  minFrequencia: number | null
  minTempoNoGrauDias: number | null
  remover?: boolean
}

export function listarModalidades(opts?: { apenasAtivas?: boolean }) {
  return db.modalidade.findMany({
    where: opts?.apenasAtivas ? { ativa: true } : undefined,
    orderBy: { nome: "asc" },
    include: {
      graduacoes: { orderBy: [{ ordem: "asc" }, { nome: "asc" }] },
      professores: {
        orderBy: { usuario: { nome: "asc" } },
        select: { id: true, usuario: { select: { nome: true } } },
      },
      _count: { select: { turmas: true, alunos: true } },
    },
  })
}

export function criarModalidade(params: {
  nome: string
  descricao?: string | null
  duracaoPadraoMin: number
  autorId: string
  graduacoes?: GraduacaoCatalogo[]
}) {
  return db.$transaction(async (tx) => {
    const modalidade = await tx.modalidade.create({
      data: {
        nome: params.nome,
        descricao: params.descricao ?? null,
        duracaoPadraoMin: params.duracaoPadraoMin,
      },
    })

    const graduacoes = await sincronizarGraduacoesModalidade(tx, {
      modalidadeId: modalidade.id,
      graduacoes: params.graduacoes ?? [],
    })

    await registrarLog(
      {
        autorId: params.autorId,
        acao: "MODALIDADE_CRIADA",
        entidade: "Modalidade",
        entidadeId: modalidade.id,
        valorNovo: {
          nome: modalidade.nome,
          duracaoPadraoMin: modalidade.duracaoPadraoMin,
          ativa: modalidade.ativa,
          graduacoes: graduacoes.map(serializarGraduacao),
        },
      },
      tx,
    )

    return modalidade
  })
}

export async function atualizarDadosModalidade(params: {
  modalidadeId: string
  autorId: string
  nome: string
  descricao?: string | null
  duracaoPadraoMin: number
  ativa: boolean
  graduacoes?: GraduacaoCatalogo[]
}) {
  const atual = await db.modalidade.findUnique({
    where: { id: params.modalidadeId },
    select: {
      id: true,
      nome: true,
      descricao: true,
      duracaoPadraoMin: true,
      ativa: true,
      graduacoes: {
        orderBy: [{ ordem: "asc" }, { nome: "asc" }],
        select: {
          id: true,
          nome: true,
          ordem: true,
          minHoras: true,
          minFrequencia: true,
          minTempoNoGrauDias: true,
        },
      },
    },
  })
  if (!atual) return { ok: false as const, motivo: "Modalidade não encontrada." }

  const atualizada = await db.$transaction(async (tx) => {
    const modalidade = await tx.modalidade.update({
      where: { id: atual.id },
      data: {
        nome: params.nome,
        descricao: params.descricao ?? null,
        duracaoPadraoMin: params.duracaoPadraoMin,
        ativa: params.ativa,
      },
      select: { id: true, nome: true, descricao: true, duracaoPadraoMin: true, ativa: true },
    })

    const graduacoes = await sincronizarGraduacoesModalidade(tx, {
      modalidadeId: modalidade.id,
      graduacoes: params.graduacoes ?? [],
    })

    await registrarLog(
      {
        autorId: params.autorId,
        acao: "MODALIDADE_CONFIGURADA",
        entidade: "Modalidade",
        entidadeId: modalidade.id,
        valorAntigo: serializarDadosModalidade(atual),
        valorNovo: {
          ...serializarDadosModalidade(modalidade),
          graduacoes: graduacoes.map(serializarGraduacao),
        },
      },
      tx,
    )

    return modalidade
  })

  return { ok: true as const, modalidade: atualizada }
}

async function sincronizarGraduacoesModalidade(
  tx: Prisma.TransactionClient,
  params: { modalidadeId: string; graduacoes: GraduacaoCatalogo[] },
) {
  for (const graduacao of params.graduacoes.filter((item) => item.remover && item.id)) {
    const atual = await tx.graduacao.findUnique({
      where: { id: graduacao.id! },
      select: {
        id: true,
        modalidadeId: true,
        nome: true,
        _count: {
          select: { historico: true, historicoAnterior: true, resultadosExame: true },
        },
      },
    })
    if (!atual || atual.modalidadeId !== params.modalidadeId) continue

    const emUso =
      atual._count.historico + atual._count.historicoAnterior + atual._count.resultadosExame
    if (emUso > 0) {
      throw new Error(`A graduação ${atual.nome} já está em uso e não pode ser removida.`)
    }

    await tx.graduacao.delete({ where: { id: atual.id } })
  }

  for (const graduacao of params.graduacoes.filter((item) => !item.remover)) {
    const dados = {
      nome: graduacao.nome,
      ordem: graduacao.ordem,
      minHoras: graduacao.minHoras,
      minFrequencia: graduacao.minFrequencia,
      minTempoNoGrauDias: graduacao.minTempoNoGrauDias,
    }

    if (graduacao.id) {
      const atual = await tx.graduacao.findUnique({
        where: { id: graduacao.id },
        select: { id: true, modalidadeId: true },
      })
      if (!atual || atual.modalidadeId !== params.modalidadeId) {
        throw new Error("Graduação inválida para esta modalidade.")
      }

      await tx.graduacao.update({
        where: { id: graduacao.id },
        data: dados,
      })
      continue
    }

    await tx.graduacao.create({
      data: { modalidadeId: params.modalidadeId, ...dados },
    })
  }

  return tx.graduacao.findMany({
    where: { modalidadeId: params.modalidadeId },
    orderBy: [{ ordem: "asc" }, { nome: "asc" }],
    select: {
      id: true,
      nome: true,
      ordem: true,
      minHoras: true,
      minFrequencia: true,
      minTempoNoGrauDias: true,
    },
  })
}

export async function atualizarRegrasModalidade(params: {
  modalidadeId: string
  autorId: string
  janelaComparecimentoHoras: number | null
  prazoCancelamentoHoras: number | null
  exigirComparecimentoParaCheckin: boolean | null
  politicaCheckinSemComparecimento: PoliticaCheckinSemComparecimento | null
  listaEsperaAtiva: boolean | null
}) {
  const atual = await db.modalidade.findUnique({
    where: { id: params.modalidadeId },
    select: {
      id: true,
      nome: true,
      janelaComparecimentoHoras: true,
      prazoCancelamentoHoras: true,
      exigirComparecimentoParaCheckin: true,
      politicaCheckinSemComparecimento: true,
      listaEsperaAtiva: true,
    },
  })
  if (!atual) return { ok: false as const, motivo: "Modalidade não encontrada." }

  const atualizada = await db.$transaction(async (tx) => {
    const modalidade = await tx.modalidade.update({
      where: { id: atual.id },
      data: {
        janelaComparecimentoHoras: params.janelaComparecimentoHoras,
        prazoCancelamentoHoras: params.prazoCancelamentoHoras,
        exigirComparecimentoParaCheckin: params.exigirComparecimentoParaCheckin,
        politicaCheckinSemComparecimento: params.politicaCheckinSemComparecimento,
        listaEsperaAtiva: params.listaEsperaAtiva,
      },
      select: {
        id: true,
        nome: true,
        janelaComparecimentoHoras: true,
        prazoCancelamentoHoras: true,
        exigirComparecimentoParaCheckin: true,
        politicaCheckinSemComparecimento: true,
        listaEsperaAtiva: true,
      },
    })

    await registrarLog(
      {
        autorId: params.autorId,
        acao: "MODALIDADE_CONFIGURADA",
        entidade: "Modalidade",
        entidadeId: modalidade.id,
        valorAntigo: serializarRegrasModalidade(atual),
        valorNovo: serializarRegrasModalidade(modalidade),
      },
      tx,
    )

    return modalidade
  })

  return { ok: true as const, modalidade: atualizada }
}

export async function excluirModalidade(params: { modalidadeId: string; autorId: string }) {
  const modalidade = await db.modalidade.findUnique({
    where: { id: params.modalidadeId },
    select: {
      id: true,
      nome: true,
      ativa: true,
      duracaoPadraoMin: true,
      _count: { select: { turmas: true, exames: true } },
    },
  })
  if (!modalidade) return { ok: false as const, motivo: "Modalidade não encontrada." }

  if (modalidade._count.turmas > 0 || modalidade._count.exames > 0) {
    return {
      ok: false as const,
      motivo:
        "Não é possível excluir modalidades com turmas ou exames vinculados. Remova esses vínculos antes.",
    }
  }

  await db.$transaction(async (tx) => {
    await tx.modalidade.delete({ where: { id: modalidade.id } })
    await registrarLog(
      {
        autorId: params.autorId,
        acao: "CONFIGURACAO",
        entidade: "Modalidade",
        entidadeId: modalidade.id,
        valorAntigo: {
          nome: modalidade.nome,
          ativa: modalidade.ativa,
          duracaoPadraoMin: modalidade.duracaoPadraoMin,
        },
      },
      tx,
    )
  })

  return { ok: true as const, modalidadeId: modalidade.id }
}

function serializarRegrasModalidade(regras: {
  nome: string
  janelaComparecimentoHoras: number | null
  prazoCancelamentoHoras: number | null
  exigirComparecimentoParaCheckin: boolean | null
  politicaCheckinSemComparecimento: PoliticaCheckinSemComparecimento | null
  listaEsperaAtiva: boolean | null
}): Prisma.InputJsonValue {
  return {
    nome: regras.nome,
    janelaComparecimentoHoras: regras.janelaComparecimentoHoras,
    prazoCancelamentoHoras: regras.prazoCancelamentoHoras,
    exigirComparecimentoParaCheckin: regras.exigirComparecimentoParaCheckin,
    politicaCheckinSemComparecimento: regras.politicaCheckinSemComparecimento,
    listaEsperaAtiva: regras.listaEsperaAtiva,
  }
}

function serializarDadosModalidade(modalidade: {
  nome: string
  descricao: string | null
  duracaoPadraoMin: number
  ativa: boolean
  graduacoes?: Array<{
    id: string
    nome: string
    ordem: number
    minHoras: number | null
    minFrequencia: number | null
    minTempoNoGrauDias: number | null
  }>
}): Prisma.InputJsonObject {
  return {
    nome: modalidade.nome,
    descricao: modalidade.descricao,
    duracaoPadraoMin: modalidade.duracaoPadraoMin,
    ativa: modalidade.ativa,
    ...(modalidade.graduacoes
      ? { graduacoes: modalidade.graduacoes.map(serializarGraduacao) }
      : {}),
  }
}

function serializarGraduacao(graduacao: {
  nome: string
  ordem: number
  minHoras: number | null
  minFrequencia: number | null
  minTempoNoGrauDias: number | null
}) {
  return {
    nome: graduacao.nome,
    ordem: graduacao.ordem,
    minHoras: graduacao.minHoras,
    minFrequencia: graduacao.minFrequencia,
    minTempoNoGrauDias: graduacao.minTempoNoGrauDias,
  }
}

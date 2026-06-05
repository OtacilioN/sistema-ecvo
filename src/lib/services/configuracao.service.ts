import "server-only"
import type {
  BloqueioInadimplencia,
  PoliticaCheckinSemComparecimento,
  Prisma,
} from "@prisma/client"
import { db } from "@/lib/db"
import { registrarLog } from "@/lib/services/auditoria.service"

export type ConfiguracaoAcademiaInput = {
  janelaComparecimentoHoras: number
  prazoCancelamentoHoras: number
  exigirComparecimentoParaCheckin: boolean
  politicaCheckinSemComparecimento: PoliticaCheckinSemComparecimento
  bloqueioInadimplencia: BloqueioInadimplencia
  listaEsperaAtiva: boolean
  rankingHorasAtivo: boolean
  notificarComparecimento: boolean
  notificarLembreteTreino: boolean
  notificarCancelamentoAula: boolean
  notificarFinanceiro: boolean
  notificarGraduacao: boolean
  notificarCheckinInvalidado: boolean
  notificarAniversario: boolean
  valorBaseModalidade: number
}

export type RegrasTreinoConfiguracao = Pick<
  ConfiguracaoAcademiaInput,
  | "janelaComparecimentoHoras"
  | "prazoCancelamentoHoras"
  | "exigirComparecimentoParaCheckin"
  | "politicaCheckinSemComparecimento"
  | "listaEsperaAtiva"
>

export type RegrasTreinoModalidade = {
  janelaComparecimentoHoras: number | null
  prazoCancelamentoHoras: number | null
  exigirComparecimentoParaCheckin: boolean | null
  politicaCheckinSemComparecimento: PoliticaCheckinSemComparecimento | null
  listaEsperaAtiva: boolean | null
}

export function obterConfiguracaoAcademia() {
  return db.configuracaoAcademia.upsert({
    where: { id: "default" },
    update: {},
    create: { id: "default" },
  })
}

export function resolverRegrasTreino(
  configuracao: RegrasTreinoConfiguracao,
  modalidade: RegrasTreinoModalidade,
): RegrasTreinoConfiguracao {
  return {
    janelaComparecimentoHoras:
      modalidade.janelaComparecimentoHoras ?? configuracao.janelaComparecimentoHoras,
    prazoCancelamentoHoras:
      modalidade.prazoCancelamentoHoras ?? configuracao.prazoCancelamentoHoras,
    exigirComparecimentoParaCheckin:
      modalidade.exigirComparecimentoParaCheckin ?? configuracao.exigirComparecimentoParaCheckin,
    politicaCheckinSemComparecimento:
      modalidade.politicaCheckinSemComparecimento ?? configuracao.politicaCheckinSemComparecimento,
    listaEsperaAtiva: modalidade.listaEsperaAtiva ?? configuracao.listaEsperaAtiva,
  }
}

export async function atualizarConfiguracaoAcademia(params: {
  autorId: string
  dados: ConfiguracaoAcademiaInput
}) {
  const atual = await obterConfiguracaoAcademia()

  return db.$transaction(async (tx) => {
    const atualizada = await tx.configuracaoAcademia.update({
      where: { id: "default" },
      data: params.dados,
    })

    await registrarLog(
      {
        autorId: params.autorId,
        acao: "CONFIGURACAO",
        entidade: "ConfiguracaoAcademia",
        entidadeId: atualizada.id,
        valorAntigo: serializarConfiguracao(atual),
        valorNovo: serializarConfiguracao(atualizada),
      },
      tx,
    )

    return atualizada
  })
}

function serializarConfiguracao(
  config: Omit<ConfiguracaoAcademiaInput, "valorBaseModalidade"> & {
    id: string
    valorBaseModalidade: number | Prisma.Decimal
  },
): Prisma.InputJsonValue {
  return {
    janelaComparecimentoHoras: config.janelaComparecimentoHoras,
    prazoCancelamentoHoras: config.prazoCancelamentoHoras,
    exigirComparecimentoParaCheckin: config.exigirComparecimentoParaCheckin,
    politicaCheckinSemComparecimento: config.politicaCheckinSemComparecimento,
    bloqueioInadimplencia: config.bloqueioInadimplencia,
    listaEsperaAtiva: config.listaEsperaAtiva,
    rankingHorasAtivo: config.rankingHorasAtivo,
    notificarComparecimento: config.notificarComparecimento,
    notificarLembreteTreino: config.notificarLembreteTreino,
    notificarCancelamentoAula: config.notificarCancelamentoAula,
    notificarFinanceiro: config.notificarFinanceiro,
    notificarGraduacao: config.notificarGraduacao,
    notificarCheckinInvalidado: config.notificarCheckinInvalidado,
    notificarAniversario: config.notificarAniversario,
    valorBaseModalidade: Number(config.valorBaseModalidade),
  }
}

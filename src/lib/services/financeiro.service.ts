import "server-only"
import type {
  Periodicidade,
  Prisma,
  StatusMensalidade,
  TipoAluno,
  TipoPagamento,
} from "@prisma/client"
import { formatInTimeZone, fromZonedTime } from "date-fns-tz"
import { db } from "@/lib/db"
import { registrarLog } from "@/lib/services/auditoria.service"
import { criarNotificacao } from "@/lib/services/notificacao.service"
import { formatarData, TIMEZONE } from "@/lib/utils/datas"

type Cliente = Prisma.TransactionClient | typeof db

export type MensalidadeResumo = {
  status: StatusMensalidade
  vencimento: Date
}

export type ConfiguracaoRepasseFinanceiro = {
  valorBaseModalidade: number
  percentualProfessor: number
  percentualSocioA: number
  percentualSocioB: number
}

export type ItemRepasseModalidade = {
  professorId: string
  professorNome?: string | null
  modalidadeId?: string | null
  modalidadeNome?: string | null
  valorBase?: number | null
}

export type PoliticaRepasseFinanceiro = "MENSALIDADE_INTERNA" | "REPASSE_EXTERNO"

export type ResultadoRepasseFinanceiro = {
  valorRecebido: number
  valorBaseTotal: number
  desconto: number
  professores: Array<{
    professorId: string
    professorNome: string | null
    valor: number
    modalidades: Array<{
      modalidadeId: string | null
      modalidadeNome: string | null
      valor: number
      valorBase: number
      tetoProfessor: number
    }>
  }>
  socioA: number
  socioB: number
}

export const CONFIGURACAO_REPASSE_PADRAO: ConfiguracaoRepasseFinanceiro = {
  valorBaseModalidade: 100,
  percentualProfessor: 60,
  percentualSocioA: 20,
  percentualSocioB: 20,
}

export function statusMensalidadeEfetivo(
  mensalidade: MensalidadeResumo,
  hoje = new Date(),
): StatusMensalidade {
  if (mensalidade.status !== "EM_ABERTO") return mensalidade.status
  return mensalidade.vencimento.getTime() < inicioDoDia(hoje).getTime() ? "VENCIDA" : "EM_ABERTO"
}

export function mensalistaAdimplente(
  mensalidades: MensalidadeResumo[],
  hoje = new Date(),
): boolean {
  return mensalidades.every((mensalidade) => {
    const status = statusMensalidadeEfetivo(mensalidade, hoje)
    return status !== "EM_ABERTO" && status !== "VENCIDA"
  })
}

export function calcularRepasseFinanceiro(params: {
  valorRecebido: number
  itens: ItemRepasseModalidade[]
  politica?: PoliticaRepasseFinanceiro
  configuracao?: Partial<ConfiguracaoRepasseFinanceiro>
}): ResultadoRepasseFinanceiro {
  const config = { ...CONFIGURACAO_REPASSE_PADRAO, ...params.configuracao }
  validarConfiguracaoRepasse(config)
  if (params.valorRecebido < 0) throw new Error("Valor recebido não pode ser negativo.")
  if (params.itens.length === 0) throw new Error("Informe ao menos uma modalidade para repasse.")

  const valorRecebidoCentavos = paraCentavos(params.valorRecebido)
  const itens = params.itens.map((item) => {
    const valorBaseCentavos = paraCentavos(item.valorBase ?? config.valorBaseModalidade)
    if (valorBaseCentavos <= 0) throw new Error("Valor base da modalidade deve ser positivo.")
    return {
      ...item,
      valorBaseCentavos,
      tetoProfessorCentavos: Math.round((valorBaseCentavos * config.percentualProfessor) / 100),
    }
  })
  const valorBaseTotalCentavos = itens.reduce((total, item) => total + item.valorBaseCentavos, 0)
  const tetoProfessoresCentavos = itens.reduce(
    (total, item) => total + item.tetoProfessorCentavos,
    0,
  )
  const politica = params.politica ?? "MENSALIDADE_INTERNA"
  const valoresProfessor =
    politica === "REPASSE_EXTERNO"
      ? dividirProporcionalmente(
          Math.round((valorRecebidoCentavos * config.percentualProfessor) / 100),
          itens.map((item) => item.tetoProfessorCentavos),
        )
      : valorRecebidoCentavos >= tetoProfessoresCentavos
        ? itens.map((item) => item.tetoProfessorCentavos)
        : dividirProporcionalmente(
            valorRecebidoCentavos,
            itens.map((item) => item.tetoProfessorCentavos),
          )

  const repasseProfessoresCentavos = valoresProfessor.reduce((total, valor) => total + valor, 0)
  const restanteSociosCentavos = Math.max(0, valorRecebidoCentavos - repasseProfessoresCentavos)
  const [socioACentavos, socioBCentavos] = dividirProporcionalmente(restanteSociosCentavos, [
    config.percentualSocioA,
    config.percentualSocioB,
  ])

  const professores = new Map<
    string,
    ResultadoRepasseFinanceiro["professores"][number] & { valorCentavos: number }
  >()
  itens.forEach((item, index) => {
    const valorCentavos = valoresProfessor[index] ?? 0
    const atual =
      professores.get(item.professorId) ??
      ({
        professorId: item.professorId,
        professorNome: item.professorNome ?? null,
        valor: 0,
        valorCentavos: 0,
        modalidades: [],
      } satisfies ResultadoRepasseFinanceiro["professores"][number] & {
        valorCentavos: number
      })
    atual.valorCentavos += valorCentavos
    atual.valor = deCentavos(atual.valorCentavos)
    atual.modalidades.push({
      modalidadeId: item.modalidadeId ?? null,
      modalidadeNome: item.modalidadeNome ?? null,
      valor: deCentavos(valorCentavos),
      valorBase: deCentavos(item.valorBaseCentavos),
      tetoProfessor: deCentavos(item.tetoProfessorCentavos),
    })
    professores.set(item.professorId, atual)
  })

  return {
    valorRecebido: deCentavos(valorRecebidoCentavos),
    valorBaseTotal: deCentavos(valorBaseTotalCentavos),
    desconto: deCentavos(Math.max(0, valorBaseTotalCentavos - valorRecebidoCentavos)),
    professores: Array.from(professores.values()).map(({ valorCentavos: _, ...professor }) => ({
      ...professor,
    })),
    socioA: deCentavos(socioACentavos),
    socioB: deCentavos(socioBCentavos),
  }
}

export function mensagemStatusMensalidade(params: {
  competencia: string
  status: StatusMensalidade
}): { titulo: string; mensagem: string } {
  const rotulos: Record<StatusMensalidade, string> = {
    EM_ABERTO: "em aberto",
    PAGA: "paga",
    VENCIDA: "vencida",
    CANCELADA: "cancelada",
    ISENTA: "isenta",
  }
  return {
    titulo: "Mensalidade atualizada",
    mensagem: `${params.competencia}: mensalidade ${rotulos[params.status]}.`,
  }
}

export function mensagemLembreteVencimentoMensalidade(params: {
  alunoNome: string
  competencia: string
  vencimento: Date
  valor: number
}): { titulo: string; mensagem: string } {
  return {
    titulo: "Mensalidade vence amanhã",
    mensagem: `${params.alunoNome} · ${params.competencia}: vence em ${formatarData(
      params.vencimento,
    )}, valor ${formatarBRL(params.valor)}.`,
  }
}

export function mensagemInadimplenciaMensalidade(params: {
  alunoNome: string
  competencia: string
  vencimento: Date
  valor: number
}): { titulo: string; mensagem: string } {
  return {
    titulo: "Mensalidade inadimplente",
    mensagem: `${params.alunoNome} · ${params.competencia}: vencida desde ${formatarData(
      params.vencimento,
    )}, valor ${formatarBRL(params.valor)}.`,
  }
}

export function mensagemPagamentoAvulso(params: {
  tipo: TipoPagamento
  valor: number
  descricao?: string | null
}): { titulo: string; mensagem: string } {
  const rotulos: Record<TipoPagamento, string> = {
    AULA_UNICA: "aula única",
    DIARIA: "diária",
    PACOTE: "pacote",
    SEMINARIO: "seminário",
    EVENTO: "evento",
    EXAME: "exame",
    PRODUTO: "produto",
  }
  const valor = formatarBRL(params.valor)
  return {
    titulo: "Pagamento registrado",
    mensagem: `${rotulos[params.tipo]}: ${valor}${params.descricao ? ` · ${params.descricao}` : ""}.`,
  }
}

export async function criarPlano(params: {
  nome: string
  valor: number
  periodicidade: Periodicidade
  limiteAulas?: number | null
  autorId: string
}) {
  const plano = await db.plano.create({
    data: {
      nome: params.nome,
      valor: params.valor,
      periodicidade: params.periodicidade,
      limiteAulas: params.limiteAulas ?? null,
    },
  })

  await registrarLog({
    autorId: params.autorId,
    acao: "PLANO",
    entidade: "Plano",
    entidadeId: plano.id,
    valorNovo: {
      nome: plano.nome,
      valor: Number(plano.valor),
      periodicidade: plano.periodicidade,
    },
  })

  return plano
}

export async function atualizarPlano(params: {
  planoId: string
  nome: string
  valor: number
  periodicidade: Periodicidade
  limiteAulas?: number | null
  ativo: boolean
  autorId: string
}) {
  const anterior = await db.plano.findUnique({
    where: { id: params.planoId },
    select: {
      id: true,
      nome: true,
      valor: true,
      periodicidade: true,
      limiteAulas: true,
      ativo: true,
    },
  })
  if (!anterior) return { ok: false as const, motivo: "Plano não encontrado." }

  const plano = await db.$transaction(async (tx) => {
    const atualizado = await tx.plano.update({
      where: { id: params.planoId },
      data: {
        nome: params.nome,
        valor: params.valor,
        periodicidade: params.periodicidade,
        limiteAulas: params.limiteAulas ?? null,
        ativo: params.ativo,
      },
    })

    await registrarLog(
      {
        autorId: params.autorId,
        acao: "PLANO",
        entidade: "Plano",
        entidadeId: atualizado.id,
        valorAntigo: serializarPlano(anterior),
        valorNovo: serializarPlano(atualizado),
      },
      tx,
    )

    return atualizado
  })

  return { ok: true as const, plano }
}

export async function vincularPlanoMensalista(params: {
  alunoId: string
  planoId: string
  diaVencimento: number
  modalidadeIds: string[]
  autorId: string
}) {
  const anterior = await db.aluno.findUnique({
    where: { id: params.alunoId },
    select: {
      tipo: true,
      planoId: true,
      diaVencimento: true,
      modalidades: { select: { id: true } },
      modalidadesPlano: { select: { modalidadeId: true } },
    },
  })
  if (!anterior) return { ok: false as const, motivo: "Aluno não encontrado." }

  const modalidadeIds = Array.from(new Set(params.modalidadeIds))
  const modalidadesDoAluno = new Set(anterior.modalidades.map((modalidade) => modalidade.id))
  const modalidadeInvalida = modalidadeIds.some((id) => !modalidadesDoAluno.has(id))
  if (modalidadeInvalida) {
    return {
      ok: false as const,
      motivo: "Selecione apenas modalidades vinculadas ao cadastro do aluno.",
    }
  }

  const aluno = await db.$transaction(async (tx) => {
    const atualizado = await tx.aluno.update({
      where: { id: params.alunoId },
      data: {
        tipo: tipoAposVinculoPlano(anterior.tipo),
        planoId: params.planoId,
        diaVencimento: params.diaVencimento,
      },
    })

    await tx.alunoPlanoModalidade.deleteMany({ where: { alunoId: params.alunoId } })
    await tx.alunoPlanoModalidade.createMany({
      data: modalidadeIds.map((modalidadeId) => ({
        alunoId: params.alunoId,
        modalidadeId,
      })),
    })

    await registrarLog(
      {
        autorId: params.autorId,
        acao: "PLANO",
        entidade: "Aluno",
        entidadeId: params.alunoId,
        valorAntigo: serializarVinculo({
          ...anterior,
          modalidadeIds: anterior.modalidadesPlano.map((modalidade) => modalidade.modalidadeId),
        }),
        valorNovo: serializarVinculo({
          tipo: atualizado.tipo,
          planoId: atualizado.planoId,
          diaVencimento: atualizado.diaVencimento,
          modalidadeIds,
        }),
      },
      tx,
    )

    return atualizado
  })

  return { ok: true as const, aluno }
}

export async function gerarMensalidade(params: {
  alunoId: string
  competencia: string
  autorId: string
}) {
  const aluno = await db.aluno.findUnique({
    where: { id: params.alunoId },
    include: {
      plano: true,
      modalidadesPlano: { select: { modalidadeId: true } },
    },
  })

  if (!aluno) return { ok: false as const, motivo: "Aluno não encontrado." }
  if (!aluno.plano) {
    return {
      ok: false as const,
      motivo: "Mensalidade interna exige plano vinculado ao aluno.",
    }
  }
  if (aluno.modalidadesPlano.length === 0) {
    return {
      ok: false as const,
      motivo: "Mensalidade interna exige ao menos uma modalidade contratada no vínculo do aluno.",
    }
  }
  const plano = aluno.plano

  const mensalidade = await db.$transaction(async (tx) => {
    const criada = await tx.mensalidade.upsert({
      where: { alunoId_competencia: { alunoId: aluno.id, competencia: params.competencia } },
      update: {},
      create: {
        alunoId: aluno.id,
        planoId: plano.id,
        competencia: params.competencia,
        valor: plano.valor,
        vencimento: vencimentoDaCompetencia(params.competencia, aluno.diaVencimento),
      },
    })

    await registrarLog(
      {
        autorId: params.autorId,
        acao: "PAGAMENTO",
        entidade: "Mensalidade",
        entidadeId: criada.id,
        valorNovo: {
          alunoId: aluno.id,
          competencia: criada.competencia,
          valor: Number(criada.valor),
          diaVencimento: aluno.diaVencimento,
          modalidadeIds: aluno.modalidadesPlano.map((modalidade) => modalidade.modalidadeId),
          vencimento: criada.vencimento.toISOString(),
          status: criada.status,
        },
      },
      tx,
    )

    await criarNotificacao(tx, {
      usuarioId: aluno.usuarioId,
      tipo: "FINANCEIRO",
      titulo: "Mensalidade gerada",
      mensagem: `${criada.competencia}: ${Number(criada.valor).toLocaleString("pt-BR", {
        style: "currency",
        currency: "BRL",
      })}.`,
    })

    return criada
  })

  return { ok: true as const, mensalidade }
}

export async function baixarMensalidade(params: {
  mensalidadeId: string
  formaPagamento?: string | null
  observacao?: string | null
  autorId: string
}) {
  const mensalidade = await db.mensalidade.findUnique({
    where: { id: params.mensalidadeId },
    include: { aluno: { select: { usuarioId: true } } },
  })
  if (!mensalidade) return { ok: false as const, motivo: "Mensalidade não encontrada." }

  const atualizada = await db.$transaction(async (tx) => {
    const nova = await tx.mensalidade.update({
      where: { id: params.mensalidadeId },
      data: {
        status: "PAGA",
        pagoEm: new Date(),
        formaPagamento: params.formaPagamento ?? null,
        observacao: params.observacao ?? mensalidade.observacao,
      },
    })

    await registrarLog(
      {
        autorId: params.autorId,
        acao: "PAGAMENTO",
        entidade: "Mensalidade",
        entidadeId: mensalidade.id,
        valorAntigo: { status: mensalidade.status },
        valorNovo: { status: nova.status, formaPagamento: nova.formaPagamento },
        justificativa: params.observacao ?? null,
      },
      tx,
    )

    await criarNotificacao(tx, {
      usuarioId: mensalidade.aluno.usuarioId,
      tipo: "FINANCEIRO",
      ...mensagemStatusMensalidade({ competencia: nova.competencia, status: nova.status }),
    })

    return nova
  })

  return { ok: true as const, mensalidade: atualizada }
}

export async function atualizarStatusMensalidade(params: {
  mensalidadeId: string
  status: StatusMensalidade
  formaPagamento?: string | null
  observacao?: string | null
  autorId: string
}) {
  const mensalidade = await db.mensalidade.findUnique({
    where: { id: params.mensalidadeId },
    include: { aluno: { select: { usuarioId: true } } },
  })
  if (!mensalidade) return { ok: false as const, motivo: "Mensalidade não encontrada." }

  const atualizada = await db.$transaction(async (tx) => {
    const nova = await tx.mensalidade.update({
      where: { id: params.mensalidadeId },
      data: {
        status: params.status,
        pagoEm: params.status === "PAGA" ? (mensalidade.pagoEm ?? new Date()) : null,
        formaPagamento:
          params.status === "PAGA" ? (params.formaPagamento ?? mensalidade.formaPagamento) : null,
        observacao: params.observacao ?? mensalidade.observacao,
      },
    })

    await registrarLog(
      {
        autorId: params.autorId,
        acao: "PAGAMENTO",
        entidade: "Mensalidade",
        entidadeId: mensalidade.id,
        valorAntigo: {
          status: mensalidade.status,
          pagoEm: mensalidade.pagoEm?.toISOString() ?? null,
          formaPagamento: mensalidade.formaPagamento,
          observacao: mensalidade.observacao,
        },
        valorNovo: {
          status: nova.status,
          pagoEm: nova.pagoEm?.toISOString() ?? null,
          formaPagamento: nova.formaPagamento,
          observacao: nova.observacao,
        },
        justificativa: params.observacao ?? null,
      },
      tx,
    )

    await criarNotificacao(tx, {
      usuarioId: mensalidade.aluno.usuarioId,
      tipo: "FINANCEIRO",
      ...mensagemStatusMensalidade({ competencia: nova.competencia, status: nova.status }),
    })

    return nova
  })

  return { ok: true as const, mensalidade: atualizada }
}

export async function registrarPagamentoAvulso(params: {
  alunoId?: string | null
  tipo: TipoPagamento
  valor: number
  descricao?: string | null
  formaPagamento?: string | null
  autorId: string
}) {
  const aluno = params.alunoId
    ? await db.aluno.findUnique({
        where: { id: params.alunoId },
        select: { usuarioId: true },
      })
    : null
  if (params.alunoId && !aluno) return { ok: false as const, motivo: "Aluno não encontrado." }

  const pagamento = await db.$transaction(async (tx) => {
    const criado = await tx.pagamento.create({
      data: {
        alunoId: params.alunoId ?? null,
        tipo: params.tipo,
        valor: params.valor,
        descricao: params.descricao ?? null,
        formaPagamento: params.formaPagamento ?? null,
      },
    })

    await registrarLog(
      {
        autorId: params.autorId,
        acao: "PAGAMENTO",
        entidade: "Pagamento",
        entidadeId: criado.id,
        valorNovo: {
          alunoId: criado.alunoId,
          tipo: criado.tipo,
          valor: Number(criado.valor),
          descricao: criado.descricao,
          formaPagamento: criado.formaPagamento,
        },
      },
      tx,
    )

    if (aluno) {
      await criarNotificacao(tx, {
        usuarioId: aluno.usuarioId,
        tipo: "FINANCEIRO",
        ...mensagemPagamentoAvulso({
          tipo: criado.tipo,
          valor: Number(criado.valor),
          descricao: criado.descricao,
        }),
      })
    }

    return criado
  })

  return { ok: true as const, pagamento }
}

export async function gerarLembretesFinanceirosGestores(
  cliente: Cliente = db,
  params?: { agora?: Date },
) {
  const agora = params?.agora ?? new Date()
  const hoje = inicioDoDia(agora)
  const amanha = intervaloDoDia(new Date(hoje.getTime() + 24 * 60 * 60 * 1000))

  const [gestores, vencemAmanha, inadimplentes] = await Promise.all([
    cliente.usuario.findMany({
      where: { papel: "GESTOR", ativo: true },
      select: { id: true },
    }),
    cliente.mensalidade.findMany({
      where: {
        status: "EM_ABERTO",
        vencimento: { gte: amanha.inicio, lt: amanha.fim },
      },
      include: { aluno: { select: { usuario: { select: { nome: true } } } } },
      orderBy: { vencimento: "asc" },
    }),
    cliente.mensalidade.findMany({
      where: {
        status: "EM_ABERTO",
        vencimento: { lt: hoje },
      },
      include: { aluno: { select: { usuario: { select: { nome: true } } } } },
      orderBy: { vencimento: "asc" },
    }),
  ])

  let lembretesCriados = 0
  let inadimplenciasCriadas = 0

  for (const mensalidade of vencemAmanha) {
    const conteudo = mensagemLembreteVencimentoMensalidade({
      alunoNome: mensalidade.aluno.usuario.nome,
      competencia: mensalidade.competencia,
      vencimento: mensalidade.vencimento,
      valor: Number(mensalidade.valor),
    })
    for (const gestor of gestores) {
      if (await criarNotificacaoFinanceiraUnica(cliente, gestor.id, conteudo)) lembretesCriados++
    }
  }

  for (const mensalidade of inadimplentes) {
    const conteudo = mensagemInadimplenciaMensalidade({
      alunoNome: mensalidade.aluno.usuario.nome,
      competencia: mensalidade.competencia,
      vencimento: mensalidade.vencimento,
      valor: Number(mensalidade.valor),
    })
    for (const gestor of gestores) {
      if (await criarNotificacaoFinanceiraUnica(cliente, gestor.id, conteudo)) {
        inadimplenciasCriadas++
      }
    }
  }

  return {
    ok: true as const,
    gestoresNotificados: gestores.length,
    mensalidadesAVencer: vencemAmanha.length,
    mensalidadesInadimplentes: inadimplentes.length,
    lembretesCriados,
    inadimplenciasCriadas,
    totalCriado: lembretesCriados + inadimplenciasCriadas,
  }
}

function vencimentoDaCompetencia(competencia: string, diaVencimento: number): Date {
  const [ano, mes] = competencia.split("-").map(Number)
  return new Date(Date.UTC(ano, mes - 1, diaVencimento, 12, 0, 0))
}

function inicioDoDia(data: Date): Date {
  const dia = formatInTimeZone(data, TIMEZONE, "yyyy-MM-dd")
  return fromZonedTime(`${dia}T00:00:00`, TIMEZONE)
}

function intervaloDoDia(data: Date): { inicio: Date; fim: Date } {
  const inicio = inicioDoDia(data)
  const fim = new Date(inicio.getTime() + 24 * 60 * 60 * 1000)
  return { inicio, fim }
}

async function criarNotificacaoFinanceiraUnica(
  cliente: Cliente,
  usuarioId: string,
  conteudo: { titulo: string; mensagem: string },
): Promise<boolean> {
  const existente = await cliente.notificacao.findFirst({
    where: {
      usuarioId,
      tipo: "FINANCEIRO",
      titulo: conteudo.titulo,
      mensagem: conteudo.mensagem,
    },
    select: { id: true },
  })
  if (existente) return false

  const criada = await criarNotificacao(cliente, {
    usuarioId,
    tipo: "FINANCEIRO",
    ...conteudo,
  })
  return Boolean(criada)
}

function validarConfiguracaoRepasse(config: ConfiguracaoRepasseFinanceiro) {
  if (config.valorBaseModalidade <= 0) {
    throw new Error("Valor base da modalidade deve ser positivo.")
  }
  const percentuais = [config.percentualProfessor, config.percentualSocioA, config.percentualSocioB]
  if (percentuais.some((percentual) => percentual < 0)) {
    throw new Error("Percentuais de repasse não podem ser negativos.")
  }
  const total = percentuais.reduce((soma, percentual) => soma + percentual, 0)
  if (Math.abs(total - 100) > 0.001) {
    throw new Error("Percentuais de repasse devem somar 100%.")
  }
}

function dividirProporcionalmente(totalCentavos: number, pesos: number[]): number[] {
  if (totalCentavos <= 0) return pesos.map(() => 0)
  const somaPesos = pesos.reduce((soma, peso) => soma + peso, 0)
  if (somaPesos <= 0) return pesos.map(() => 0)

  const partes = pesos.map((peso, index) => {
    const exato = (totalCentavos * peso) / somaPesos
    const inteiro = Math.floor(exato)
    return { index, inteiro, resto: exato - inteiro }
  })
  let sobra = totalCentavos - partes.reduce((soma, parte) => soma + parte.inteiro, 0)
  const ordenadas = [...partes].sort((a, b) => b.resto - a.resto || a.index - b.index)
  for (const parte of ordenadas) {
    if (sobra <= 0) break
    parte.inteiro += 1
    sobra -= 1
  }

  return partes.map((parte) => parte.inteiro)
}

function paraCentavos(valor: number): number {
  return Math.round(valor * 100)
}

function deCentavos(valor: number): number {
  return Number((valor / 100).toFixed(2))
}

function formatarBRL(valor: number): string {
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
}

function serializarPlano(plano: {
  nome: string
  valor: Prisma.Decimal | number
  periodicidade: Periodicidade
  limiteAulas: number | null
  ativo: boolean
}): Prisma.InputJsonObject {
  return {
    nome: plano.nome,
    valor: Number(plano.valor),
    periodicidade: plano.periodicidade,
    limiteAulas: plano.limiteAulas,
    ativo: plano.ativo,
  }
}

function serializarVinculo(vinculo: {
  tipo: TipoAluno
  planoId: string | null
  diaVencimento: number
  modalidadeIds: string[]
}): Prisma.InputJsonObject {
  return {
    tipo: vinculo.tipo,
    planoId: vinculo.planoId,
    diaVencimento: vinculo.diaVencimento,
    modalidadeIds: vinculo.modalidadeIds,
  }
}

function tipoAposVinculoPlano(tipo: TipoAluno): TipoAluno {
  return tipo === "AVULSO" ? "MENSALISTA" : tipo
}

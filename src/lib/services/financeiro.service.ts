import "server-only"
import type {
  Periodicidade,
  Plataforma,
  Prisma,
  StatusMensalidade,
  TipoAluno,
  TipoPagamento,
} from "@prisma/client"
import { db } from "@/lib/db"
import { registrarLog } from "@/lib/services/auditoria.service"
import { criarNotificacao } from "@/lib/services/notificacao.service"
import { chaveCompetencia, formatarData, inicioDoDiaAcademia } from "@/lib/utils/datas"

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

export type ItemRepasseModalidadeCobranca = ItemRepasseModalidade & {
  plataformaExterna?: Plataforma | null
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

export function mensalidadeBloqueiaTreino(
  mensalidade: MensalidadeResumo,
  hoje = new Date(),
): boolean {
  return statusMensalidadeEfetivo(mensalidade, hoje) === "VENCIDA"
}

export function mensalistaAdimplente(
  mensalidades: MensalidadeResumo[],
  hoje = new Date(),
): boolean {
  return mensalidades.every((mensalidade) => {
    const status = statusMensalidadeEfetivo(mensalidade, hoje)
    return status !== "VENCIDA"
  })
}

export async function sincronizarStatusFinanceiroAluno(
  cliente: Cliente,
  alunoId: string,
  hoje = new Date(),
  autorId?: string,
) {
  const vencimentoPassado = inicioDoDia(hoje)
  const mensalidadeVencida = await cliente.mensalidade.findFirst({
    where: {
      alunoId,
      OR: [{ status: "VENCIDA" }, { status: "EM_ABERTO", vencimento: { lt: vencimentoPassado } }],
    },
    select: { id: true },
  })

  if (mensalidadeVencida) {
    const resultado = await cliente.aluno.updateMany({
      where: { id: alunoId, status: "ATIVO" },
      data: { status: "INADIMPLENTE" },
    })
    if (autorId && resultado.count > 0) {
      await registrarLog(
        {
          autorId,
          acao: "STATUS_ALUNO",
          entidade: "Aluno",
          entidadeId: alunoId,
          valorAntigo: { status: "ATIVO" },
          valorNovo: { status: "INADIMPLENTE", motivo: "Mensalidade vencida" },
        },
        cliente,
      )
    }
    return
  }

  const resultado = await cliente.aluno.updateMany({
    where: { id: alunoId, status: "INADIMPLENTE" },
    data: { status: "ATIVO" },
  })
  if (autorId && resultado.count > 0) {
    await registrarLog(
      {
        autorId,
        acao: "STATUS_ALUNO",
        entidade: "Aluno",
        entidadeId: alunoId,
        valorAntigo: { status: "INADIMPLENTE" },
        valorNovo: { status: "ATIVO", motivo: "Sem mensalidades vencidas" },
      },
      cliente,
    )
  }
}

export async function atualizarVencimentosMensalidadesAluno(
  cliente: Cliente,
  params: {
    alunoId: string
    diaVencimentoAnterior: number
    diaVencimentoNovo: number
    hoje?: Date
    autorId?: string
  },
) {
  if (params.diaVencimentoAnterior === params.diaVencimentoNovo) return 0

  const mensalidades = await cliente.mensalidade.findMany({
    where: { alunoId: params.alunoId },
    select: {
      id: true,
      competencia: true,
      status: true,
    },
  })
  const inicioHoje = inicioDoDia(params.hoje ?? new Date())

  for (const mensalidade of mensalidades) {
    const vencimento = vencimentoDaCompetencia(mensalidade.competencia, params.diaVencimentoNovo)
    await cliente.mensalidade.update({
      where: { id: mensalidade.id },
      data: {
        vencimento,
        status: statusMensalidadeAposNovoVencimento(mensalidade.status, vencimento, inicioHoje),
      },
    })
  }

  if (mensalidades.length > 0) {
    await sincronizarStatusFinanceiroAluno(
      cliente,
      params.alunoId,
      params.hoje ?? new Date(),
      params.autorId,
    )
  }

  return mensalidades.length
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

export function modalidadesMensalidadeInterna(
  itens: ItemRepasseModalidadeCobranca[],
): ItemRepasseModalidade[] {
  return itens
    .filter((item) => !item.plataformaExterna)
    .map(({ plataformaExterna: _, ...item }) => item)
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

export function mensagemInadimplenciaMensalidadeAluno(params: {
  competencia: string
  vencimento: Date
  valor: number
}): { titulo: string; mensagem: string } {
  return {
    titulo: "Mensalidade vencida",
    mensagem: `${params.competencia}: vencida desde ${formatarData(
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

export async function excluirPlano(params: {
  planoId: string
  planoDestinoId?: string | null
  autorId: string
}) {
  const plano = await db.plano.findUnique({
    where: { id: params.planoId },
    select: {
      id: true,
      nome: true,
      valor: true,
      periodicidade: true,
      limiteAulas: true,
      ativo: true,
      _count: { select: { alunos: true, mensalidades: true } },
    },
  })
  if (!plano) return { ok: false as const, motivo: "Plano não encontrado." }

  let planoDestino: { id: string; nome: string } | null = null
  if (plano._count.alunos > 0) {
    if (!params.planoDestinoId) {
      return {
        ok: false as const,
        motivo: "Escolha um plano para migrar os alunos vinculados.",
      }
    }
    if (params.planoDestinoId === params.planoId) {
      return { ok: false as const, motivo: "Escolha um plano de destino diferente." }
    }
    planoDestino = await db.plano.findUnique({
      where: { id: params.planoDestinoId },
      select: { id: true, nome: true },
    })
    if (!planoDestino) return { ok: false as const, motivo: "Plano de destino não encontrado." }
  }

  await db.$transaction(async (tx) => {
    if (planoDestino) {
      await tx.aluno.updateMany({
        where: { planoId: params.planoId },
        data: { planoId: planoDestino.id },
      })
    }

    await tx.plano.delete({ where: { id: params.planoId } })

    await registrarLog(
      {
        autorId: params.autorId,
        acao: "PLANO",
        entidade: "Plano",
        entidadeId: plano.id,
        valorAntigo: {
          ...serializarPlano(plano),
          alunosVinculados: plano._count.alunos,
          mensalidadesHistoricas: plano._count.mensalidades,
        },
        valorNovo: {
          excluido: true,
          alunosMigrados: plano._count.alunos,
          planoDestinoId: planoDestino?.id ?? null,
          planoDestinoNome: planoDestino?.nome ?? null,
          mensalidadesMantidasSemPlano: plano._count.mensalidades,
        },
      },
      tx,
    )
  })

  return { ok: true as const, alunosMigrados: plano._count.alunos }
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
      modalidadesPlano: { select: { modalidadeId: true, plataformaExterna: true } },
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
    const modalidadesExternas = anterior.modalidadesPlano.filter(
      (modalidade) =>
        modalidade.plataformaExterna &&
        modalidadesDoAluno.has(modalidade.modalidadeId) &&
        !modalidadeIds.includes(modalidade.modalidadeId),
    )
    await tx.alunoPlanoModalidade.createMany({
      data: [
        ...modalidadeIds.map((modalidadeId) => ({
          alunoId: params.alunoId,
          modalidadeId,
          plataformaExterna: null,
        })),
        ...modalidadesExternas.map((modalidade) => ({
          alunoId: params.alunoId,
          modalidadeId: modalidade.modalidadeId,
          plataformaExterna: modalidade.plataformaExterna,
        })),
      ],
      skipDuplicates: true,
    })
    const mensalidadesVencimentoAtualizadas = await atualizarVencimentosMensalidadesAluno(tx, {
      alunoId: params.alunoId,
      diaVencimentoAnterior: anterior.diaVencimento,
      diaVencimentoNovo: atualizado.diaVencimento,
      autorId: params.autorId,
    })

    await registrarLog(
      {
        autorId: params.autorId,
        acao: "PLANO",
        entidade: "Aluno",
        entidadeId: params.alunoId,
        valorAntigo: serializarVinculo({
          ...anterior,
          modalidadeIds: anterior.modalidadesPlano
            .filter((modalidade) => !modalidade.plataformaExterna)
            .map((modalidade) => modalidade.modalidadeId),
          modalidadesExternas,
        }),
        valorNovo: serializarVinculo({
          tipo: atualizado.tipo,
          planoId: atualizado.planoId,
          diaVencimento: atualizado.diaVencimento,
          modalidadeIds,
          modalidadesExternas,
          mensalidadesVencimentoAtualizadas,
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
  autorId?: string
}) {
  const resultado = await obterOuCriarMensalidade(params)
  if (!resultado.ok) return resultado
  return { ok: true as const, mensalidade: resultado.mensalidade, criada: resultado.criada }
}

async function obterOuCriarMensalidade(params: {
  alunoId: string
  competencia: string
  autorId?: string
}) {
  const aluno = await db.aluno.findUnique({
    where: { id: params.alunoId },
    include: {
      plano: true,
      modalidadesPlano: { select: { modalidadeId: true, plataformaExterna: true } },
    },
  })

  if (!aluno) return { ok: false as const, motivo: "Aluno não encontrado." }
  if (!aluno.plano) {
    return {
      ok: false as const,
      motivo: "Mensalidade interna exige plano vinculado ao aluno.",
    }
  }
  const modalidadesInternas = aluno.modalidadesPlano.filter(
    (modalidade) => !modalidade.plataformaExterna,
  )
  if (modalidadesInternas.length === 0) {
    return {
      ok: false as const,
      motivo: "Mensalidade interna exige ao menos uma modalidade contratada no vínculo do aluno.",
    }
  }
  const plano = aluno.plano

  const mensalidade = await db.$transaction(async (tx) => {
    const existente = await tx.mensalidade.findUnique({
      where: {
        alunoId_competencia: { alunoId: aluno.id, competencia: params.competencia },
      },
    })
    if (existente) return { mensalidade: existente, criada: false }

    const criada = await tx.mensalidade.create({
      data: {
        alunoId: aluno.id,
        planoId: plano.id,
        competencia: params.competencia,
        valor: plano.valor,
        vencimento: vencimentoDaCompetencia(params.competencia, aluno.diaVencimento),
      },
    })

    if (params.autorId) {
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
            modalidadeIds: modalidadesInternas.map((modalidade) => modalidade.modalidadeId),
            vencimento: criada.vencimento.toISOString(),
            status: criada.status,
          },
        },
        tx,
      )
    }

    await criarNotificacao(tx, {
      usuarioId: aluno.usuarioId,
      tipo: "FINANCEIRO",
      titulo: "Mensalidade gerada",
      mensagem: `${criada.competencia}: ${Number(criada.valor).toLocaleString("pt-BR", {
        style: "currency",
        currency: "BRL",
      })}.`,
    })

    return { mensalidade: criada, criada: true }
  })

  return { ok: true as const, ...mensalidade }
}

export async function gerarMensalidadesRecorrentes(params?: { competencia?: string }) {
  const competencia = params?.competencia ?? chaveCompetencia()
  const alunos = await db.aluno.findMany({
    where: {
      planoId: { not: null },
      status: { in: ["ATIVO", "INADIMPLENTE"] },
    },
    select: { id: true },
    orderBy: { criadoEm: "asc" },
  })

  let criadas = 0
  let existentes = 0
  const puladas: Array<{ alunoId: string; motivo: string }> = []

  for (const aluno of alunos) {
    const resultado = await obterOuCriarMensalidade({ alunoId: aluno.id, competencia })
    if (!resultado.ok) {
      puladas.push({ alunoId: aluno.id, motivo: resultado.motivo })
      continue
    }
    if (resultado.criada) criadas++
    else existentes++
  }

  return {
    ok: true as const,
    competencia,
    alunosProcessados: alunos.length,
    criadas,
    existentes,
    puladas,
  }
}

export async function baixarMensalidade(params: {
  mensalidadeId: string
  formaPagamento?: string | null
  observacao?: string | null
  autorId: string
}) {
  const mensalidade = await db.mensalidade.findUnique({
    where: { id: params.mensalidadeId },
    include: { aluno: { select: { usuarioId: true, usuario: { select: { nome: true } } } } },
  })
  if (!mensalidade) return { ok: false as const, motivo: "Mensalidade não encontrada." }
  if (mensalidade.status === "PAGA" || mensalidade.status === "ISENTA") {
    return { ok: false as const, motivo: "Mensalidade já está quitada." }
  }

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
        valorAntigo: {
          alunoId: mensalidade.alunoId,
          alunoNome: mensalidade.aluno.usuario.nome,
          competencia: mensalidade.competencia,
          valor: Number(mensalidade.valor),
          status: mensalidade.status,
        },
        valorNovo: {
          alunoId: nova.alunoId,
          alunoNome: mensalidade.aluno.usuario.nome,
          competencia: nova.competencia,
          valor: Number(nova.valor),
          status: nova.status,
          formaPagamento: nova.formaPagamento,
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

    await sincronizarStatusFinanceiroAluno(tx, nova.alunoId, new Date(), params.autorId)

    return nova
  })

  return { ok: true as const, mensalidade: atualizada }
}

export async function darBaixaMensalidadeAluno(params: {
  alunoId: string
  competencia: string
  formaPagamento?: string | null
  observacao?: string | null
  autorId: string
}) {
  const mensalidade = await gerarMensalidade({
    alunoId: params.alunoId,
    competencia: params.competencia,
    autorId: params.autorId,
  })
  if (!mensalidade.ok) return mensalidade

  return baixarMensalidade({
    mensalidadeId: mensalidade.mensalidade.id,
    formaPagamento: params.formaPagamento,
    observacao: params.observacao,
    autorId: params.autorId,
  })
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
    include: { aluno: { select: { usuarioId: true, usuario: { select: { nome: true } } } } },
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
          alunoId: mensalidade.alunoId,
          alunoNome: mensalidade.aluno.usuario.nome,
          competencia: mensalidade.competencia,
          valor: Number(mensalidade.valor),
          status: mensalidade.status,
          pagoEm: mensalidade.pagoEm?.toISOString() ?? null,
          formaPagamento: mensalidade.formaPagamento,
          observacao: mensalidade.observacao,
        },
        valorNovo: {
          alunoId: nova.alunoId,
          alunoNome: mensalidade.aluno.usuario.nome,
          competencia: nova.competencia,
          valor: Number(nova.valor),
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

    await sincronizarStatusFinanceiroAluno(tx, nova.alunoId, new Date(), params.autorId)

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
  const vencidas = await vencerMensalidadesAtrasadas(cliente, { agora })

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
        status: "VENCIDA",
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
    mensalidadesVencidasAtualizadas: vencidas.mensalidadesVencidas,
    alunosInadimplentesNotificados: vencidas.alunosNotificados,
    mensalidadesAVencer: vencemAmanha.length,
    mensalidadesInadimplentes: inadimplentes.length,
    lembretesCriados,
    inadimplenciasCriadas,
    totalCriado: lembretesCriados + inadimplenciasCriadas,
  }
}

export async function vencerMensalidadesAtrasadas(
  cliente: Cliente = db,
  params?: { agora?: Date },
) {
  const hoje = inicioDoDia(params?.agora ?? new Date())

  const candidatas = await cliente.mensalidade.findMany({
    where: {
      status: "EM_ABERTO",
      vencimento: { lt: hoje },
    },
    select: {
      id: true,
      alunoId: true,
      competencia: true,
      vencimento: true,
      valor: true,
      aluno: { select: { usuarioId: true } },
    },
    orderBy: { vencimento: "asc" },
  })

  let mensalidadesVencidas = 0
  let alunosNotificados = 0

  for (const mensalidade of candidatas) {
    const resultado = await cliente.mensalidade.updateMany({
      where: { id: mensalidade.id, status: "EM_ABERTO" },
      data: { status: "VENCIDA" },
    })
    if (resultado.count === 0) continue

    await sincronizarStatusFinanceiroAluno(cliente, mensalidade.alunoId, hoje)

    mensalidadesVencidas += resultado.count
    const conteudo = mensagemInadimplenciaMensalidadeAluno({
      competencia: mensalidade.competencia,
      vencimento: mensalidade.vencimento,
      valor: Number(mensalidade.valor),
    })
    if (await criarNotificacaoFinanceiraUnica(cliente, mensalidade.aluno.usuarioId, conteudo)) {
      alunosNotificados++
    }
  }

  return { ok: true as const, mensalidadesVencidas, alunosNotificados }
}

export function vencimentoDaCompetencia(competencia: string, diaVencimento: number): Date {
  const [ano, mes] = competencia.split("-").map(Number)
  return new Date(Date.UTC(ano, mes - 1, diaVencimento, 12, 0, 0))
}

function statusMensalidadeAposNovoVencimento(
  status: StatusMensalidade,
  vencimento: Date,
  inicioHoje: Date,
): StatusMensalidade {
  if (status !== "EM_ABERTO" && status !== "VENCIDA") return status
  return vencimento.getTime() < inicioHoje.getTime() ? "VENCIDA" : "EM_ABERTO"
}

function inicioDoDia(data: Date): Date {
  return inicioDoDiaAcademia(data)
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
  modalidadesExternas?: Array<{
    modalidadeId: string
    plataformaExterna: Plataforma | null
  }>
  mensalidadesVencimentoAtualizadas?: number
}): Prisma.InputJsonObject {
  return {
    tipo: vinculo.tipo,
    planoId: vinculo.planoId,
    diaVencimento: vinculo.diaVencimento,
    modalidadeIds: vinculo.modalidadeIds,
    modalidadesExternas: vinculo.modalidadesExternas,
    ...(vinculo.mensalidadesVencimentoAtualizadas !== undefined
      ? { mensalidadesVencimentoAtualizadas: vinculo.mensalidadesVencimentoAtualizadas }
      : {}),
  }
}

function tipoAposVinculoPlano(tipo: TipoAluno): TipoAluno {
  return tipo === "AVULSO" ? "MENSALISTA" : tipo
}

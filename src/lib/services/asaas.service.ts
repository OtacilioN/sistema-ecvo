import "server-only"
import {
  type ContratoPixAutomatico,
  type Mensalidade,
  Prisma,
  type StatusCobrancaAsaas,
  type StatusContratoPixAutomatico,
  type TipoCobrancaPix,
} from "@prisma/client"
import {
  competenciasDoSemestre,
  estaNaJanelaDeCriacaoPixAutomatico,
  somarMesesCompetencia,
} from "@/lib/asaas/ciclos"
import {
  type AutorizacaoPixAutomaticoAsaas,
  type CobrancaAsaas as CobrancaRemotaAsaas,
  cancelarAutorizacaoPixAutomaticoAsaas,
  criarAutorizacaoPixAutomaticoAsaas,
  criarClienteAsaas,
  criarCobrancaAsaas,
  excluirCobrancaAsaas,
  listarAutorizacoesPixAutomaticoAsaas,
  listarClientesAsaas,
  listarCobrancasAsaas,
  obterAutorizacaoPixAutomaticoAsaas,
  obterCobrancaAsaas,
  obterQrCodePixAsaas,
} from "@/lib/asaas/client"
import { interpretarDataAsaas } from "@/lib/asaas/datas"
import {
  eventoPagamentoParaStatusAsaas,
  proximoStatusCobrancaAsaas,
  proximoStatusContratoPixAutomatico,
} from "@/lib/asaas/estado"
import { mensagemErroAsaasSegura } from "@/lib/asaas/seguranca"
import { db } from "@/lib/db"
import { registrarLog } from "@/lib/services/auditoria.service"
import {
  gerarMensalidade,
  sincronizarStatusFinanceiroAluno,
  statusMensalidadeEfetivo,
} from "@/lib/services/financeiro.service"
import { aplicarWebhookPagamentoMatricula } from "@/lib/services/pagamento-matricula.service"
import { chaveCompetencia, dataCivilParaDate, formatarDataInput } from "@/lib/utils/datas"
import {
  idAutorizacaoDoWebhook,
  idPagamentoInstrucaoDoWebhook,
  type WebhookAsaas,
} from "@/lib/validations/asaas"

const TOTAL_CICLOS_PIX_AUTOMATICO = 6
const EXPIRACAO_QR_AUTORIZACAO_SEGUNDOS = 86_400
const TEMPO_RESERVA_OPERACAO_MS = 2 * 60 * 1_000
const STATUS_MENSALIDADE_COBRAVEL = ["EM_ABERTO", "VENCIDA"] as const
const STATUS_COBRANCA_TERMINAL = ["RECEBIDA", "CANCELADA", "ESTORNADA"] as const

class ErroEscolhaPagamento extends Error {}

function erroPrismaUnicidade(erro: unknown) {
  return typeof erro === "object" && erro !== null && "code" in erro && erro.code === "P2002"
}

function reservaAindaEmAndamento(atualizadoEm: Date, agora = new Date()) {
  return agora.getTime() - atualizadoEm.getTime() < TEMPO_RESERVA_OPERACAO_MS
}

function somenteDigitos(valor?: string | null) {
  return valor?.replace(/\D/g, "") || undefined
}

function dataAsaas(data: Date) {
  return data.toISOString().slice(0, 10)
}

function vencimentoAceitoPeloAsaas(vencimento: Date, hoje = new Date()) {
  const dataHoje = formatarDataInput(hoje)
  return formatarDataInput(vencimento) < dataHoje ? dataCivilParaDate(dataHoje) : vencimento
}

function cobrancaRemotaContinuaAtiva(status: CobrancaRemotaAsaas["status"]) {
  return !["REFUNDED", "PARTIALLY_REFUNDED", "DELETED"].includes(status)
}

function qrCodeAindaValido(
  cobranca: {
    pixCopiaECola?: string | null
    qrCodeExpiraEm?: Date | null
    status?: StatusCobrancaAsaas
  },
  agora = new Date(),
) {
  return Boolean(
    (!cobranca.status || !STATUS_COBRANCA_TERMINAL.includes(cobranca.status as never)) &&
      cobranca.pixCopiaECola &&
      cobranca.qrCodeExpiraEm &&
      cobranca.qrCodeExpiraEm.getTime() > agora.getTime(),
  )
}

async function bloquearMensalidades(tx: Prisma.TransactionClient, ids: string[]) {
  if (ids.length === 0) return
  await tx.$queryRaw(
    Prisma.sql`SELECT "id" FROM "Mensalidade" WHERE "id" IN (${Prisma.join(
      [...ids].sort(),
    )}) ORDER BY "id" FOR UPDATE`,
  )
}

function referenciaCliente(alunoId: string) {
  return `ecvo-aluno-${alunoId}`
}

function referenciaMensalidade(mensalidadeId: string) {
  return `mensalidade:${mensalidadeId}`
}

function referenciaCiclo(contratoId: string, numeroCiclo: number) {
  return `pixauto:${contratoId}:${numeroCiclo}`
}

function referenciaPagamentoEcvo(referencia?: string | null) {
  return Boolean(
    referencia &&
      (referencia.startsWith("mensalidade:") ||
        referencia.startsWith("pixauto:") ||
        referencia.startsWith("pixauto-fallback:") ||
        referencia.startsWith("matricula:")),
  )
}

function descricaoMensalidade(competencia: string) {
  return `Mensalidade ECVO ${competencia}`
}

async function obterPagador(alunoId: string) {
  const aluno = await db.aluno.findUnique({
    where: { id: alunoId },
    select: {
      id: true,
      cpf: true,
      telefone: true,
      usuario: { select: { nome: true, email: true } },
      responsavel: true,
      clienteAsaas: true,
    },
  })
  if (!aluno) return { ok: false as const, motivo: "Aluno não encontrado." }

  const responsavel = aluno.responsavel?.responsavelFinanceiro ? aluno.responsavel : null
  const tipoPagador = responsavel ? ("RESPONSAVEL" as const) : ("ALUNO" as const)
  const cpfCnpj = somenteDigitos(responsavel?.cpf ?? aluno.cpf)
  if (!cpfCnpj || ![11, 14].includes(cpfCnpj.length)) {
    return {
      ok: false as const,
      motivo: responsavel
        ? "Informe um CPF válido para o responsável financeiro."
        : "Informe um CPF válido para o aluno.",
    }
  }

  return {
    ok: true as const,
    aluno,
    tipoPagador,
    dados: {
      name: responsavel?.nome ?? aluno.usuario.nome,
      cpfCnpj,
      email: responsavel?.email ?? aluno.usuario.email,
      mobilePhone: somenteDigitos(responsavel?.telefone ?? aluno.telefone),
      externalReference: referenciaCliente(aluno.id),
      notificationDisabled: true,
    },
  }
}

async function garantirClienteAsaas(alunoId: string, autorId: string | null = null) {
  const pagador = await obterPagador(alunoId)
  if (!pagador.ok) return pagador
  if (pagador.aluno.clienteAsaas?.asaasCustomerId) {
    return { ok: true as const, customerId: pagador.aluno.clienteAsaas.asaasCustomerId }
  }

  let reserva = pagador.aluno.clienteAsaas
  let reservadaNestaChamada = false
  if (!reserva) {
    try {
      reserva = await db.clienteAsaas.create({
        data: { alunoId, asaasCustomerId: null, tipoPagador: pagador.tipoPagador },
      })
      reservadaNestaChamada = true
    } catch (erro) {
      if (!erroPrismaUnicidade(erro)) throw erro
      reserva = await db.clienteAsaas.findUnique({ where: { alunoId } })
    }
  }

  if (!reserva) return { ok: false as const, motivo: "Não foi possível reservar o cliente Asaas." }
  if (reserva.asaasCustomerId) {
    return { ok: true as const, customerId: reserva.asaasCustomerId }
  }
  if (!reservadaNestaChamada) {
    if (!reserva.ultimoErro && reservaAindaEmAndamento(reserva.atualizadoEm)) {
      return { ok: false as const, motivo: "O cadastro do pagador está sendo processado." }
    }
    const retomada = await db.clienteAsaas.updateMany({
      where: { id: reserva.id, asaasCustomerId: null, atualizadoEm: reserva.atualizadoEm },
      data: { tipoPagador: pagador.tipoPagador, ultimoErro: null },
    })
    if (retomada.count === 0) {
      return { ok: false as const, motivo: "O cadastro do pagador está sendo processado." }
    }
  }

  try {
    const encontrados = await listarClientesAsaas({
      externalReference: pagador.dados.externalReference,
      limit: 2,
    })
    if (encontrados.data.length > 1) {
      throw new Error("Mais de um cliente Asaas corresponde ao mesmo aluno; concilie manualmente.")
    }
    const remoto = encontrados.data[0] ?? (await criarClienteAsaas(pagador.dados))
    const cliente = await db.$transaction(async (tx) => {
      const atualizado = await tx.clienteAsaas.update({
        where: { id: reserva.id },
        data: {
          asaasCustomerId: remoto.id,
          tipoPagador: pagador.tipoPagador,
          ultimoErro: null,
        },
      })
      await registrarLog(
        {
          autorId,
          acao: "PAGAMENTO",
          entidade: "ClienteAsaas",
          entidadeId: atualizado.id,
          valorAntigo: { asaasCustomerId: null },
          valorNovo: {
            asaasCustomerId: atualizado.asaasCustomerId,
            tipoPagador: atualizado.tipoPagador,
          },
        },
        tx,
      )
      return atualizado
    })
    return { ok: true as const, customerId: cliente.asaasCustomerId! }
  } catch (erro) {
    await db.clienteAsaas.update({
      where: { id: reserva.id },
      data: { ultimoErro: mensagemErroAsaasSegura(erro) },
    })
    throw erro
  }
}

type DadosIntencaoCobranca = {
  mensalidadeId: string
  contratoPixAutomaticoId?: string | null
  tipo: "PIX_MENSAL" | "PIX_AUTOMATICO_INICIAL" | "PIX_AUTOMATICO_RECORRENTE"
  externalReference: string
  vencimentoAsaas: Date
  permitirNovaTentativaTerminal?: boolean
}

async function reservarIntencaoCobranca(dados: DadosIntencaoCobranca) {
  return db.$transaction(async (tx) => {
    await bloquearMensalidades(tx, [dados.mensalidadeId])
    const mensalidade = await tx.mensalidade.findUnique({
      where: { id: dados.mensalidadeId },
      select: { status: true },
    })
    if (!mensalidade || !STATUS_MENSALIDADE_COBRAVEL.includes(mensalidade.status as never)) {
      return { ok: false as const, motivo: "Esta mensalidade não aceita uma nova cobrança." }
    }

    const ultima = await tx.cobrancaAsaas.findFirst({
      where: { mensalidadeId: dados.mensalidadeId },
      orderBy: { geracao: "desc" },
    })
    const existenteBase = await tx.cobrancaAsaas.findUnique({
      where: { externalReference: dados.externalReference },
    })
    const ultimaCompativel =
      ultima &&
      ultima.mensalidadeId === dados.mensalidadeId &&
      ultima.tipo === dados.tipo &&
      (ultima.contratoPixAutomaticoId ?? null) === (dados.contratoPixAutomaticoId ?? null) &&
      (ultima.externalReference === dados.externalReference ||
        ultima.externalReference.startsWith(`${dados.externalReference}:tentativa:`))
        ? ultima
        : null
    const existente = ultimaCompativel ?? existenteBase
    if (existente) {
      if (ultima?.ativa && ultima.id !== existente.id) {
        return { ok: false as const, motivo: "Outra forma de pagamento já foi selecionada." }
      }
      const mesmaIntencao =
        existente.mensalidadeId === dados.mensalidadeId &&
        existente.tipo === dados.tipo &&
        (existente.contratoPixAutomaticoId ?? null) === (dados.contratoPixAutomaticoId ?? null)
      if (!mesmaIntencao) {
        return { ok: false as const, motivo: "Outra forma de pagamento já foi selecionada." }
      }

      const podeGerarNovamente =
        dados.permitirNovaTentativaTerminal &&
        (["CANCELADA", "ESTORNADA"].includes(existente.status) ||
          (existente.tipo === "PIX_MENSAL" && existente.status === "RECUSADA"))
      if (!podeGerarNovamente) {
        if (existente.asaasPaymentId) {
          return { ok: true as const, proprietaria: false as const, intencao: existente }
        }
        if (existente.status !== "ERRO" && reservaAindaEmAndamento(existente.atualizadoEm)) {
          return { ok: false as const, motivo: "A cobrança já está sendo processada." }
        }
        const intencao = await tx.cobrancaAsaas.update({
          where: { id: existente.id },
          data: {
            ativa: true,
            status: "CRIANDO",
            vencimentoAsaas: dados.vencimentoAsaas,
            ultimoErro: null,
          },
        })
        return { ok: true as const, proprietaria: true as const, intencao }
      }
      await tx.cobrancaAsaas.update({
        where: { id: existente.id },
        data: { ativa: false },
      })
    } else if (ultima?.ativa) {
      return { ok: false as const, motivo: "Outra forma de pagamento já foi selecionada." }
    }

    const geracao = (ultima?.geracao ?? 0) + 1
    const externalReference = existenteBase
      ? `${dados.externalReference}:tentativa:${geracao}`
      : dados.externalReference
    const intencao = await tx.cobrancaAsaas.create({
      data: {
        mensalidadeId: dados.mensalidadeId,
        contratoPixAutomaticoId: dados.contratoPixAutomaticoId,
        tipo: dados.tipo,
        externalReference,
        vencimentoAsaas: dados.vencimentoAsaas,
        geracao,
      },
    })
    return { ok: true as const, proprietaria: true as const, intencao }
  })
}

async function criarOuRecuperarCobrancaRemota(params: {
  customerId: string
  externalReference: string
  value: number
  dueDate: Date
  description: string
  pixAutomaticAuthorizationId?: string
}) {
  const encontradas = await listarCobrancasAsaas({
    externalReference: params.externalReference,
    limit: 2,
  })
  if (encontradas.data.length > 1) {
    throw new Error("Mais de uma cobrança Asaas usa a mesma referência; concilie manualmente.")
  }
  if (encontradas.data[0]) return encontradas.data[0]

  return criarCobrancaAsaas({
    customer: params.customerId,
    billingType: "PIX",
    value: params.value,
    dueDate: dataAsaas(params.dueDate),
    description: params.description,
    externalReference: params.externalReference,
    pixAutomaticAuthorizationId: params.pixAutomaticAuthorizationId,
  })
}

async function persistirCobrancaRemota(
  cobrancaId: string,
  remota: CobrancaRemotaAsaas,
  incluirQrCode: boolean,
  autorId: string | null = null,
) {
  const qrCode = incluirQrCode ? await obterQrCodePixAsaas(remota.id) : null
  const cobranca = await db.$transaction(async (tx) => {
    const referencia = await tx.cobrancaAsaas.findUniqueOrThrow({
      where: { id: cobrancaId },
      select: { mensalidadeId: true },
    })
    await bloquearMensalidades(tx, [referencia.mensalidadeId])
    const anterior = await tx.cobrancaAsaas.findUniqueOrThrow({ where: { id: cobrancaId } })
    const outraAtiva =
      cobrancaRemotaContinuaAtiva(remota.status) && !anterior.ativa
        ? await tx.cobrancaAsaas.findFirst({
            where: {
              mensalidadeId: anterior.mensalidadeId,
              id: { not: anterior.id },
              ativa: true,
            },
            select: { id: true },
          })
        : null
    const cobranca = await tx.cobrancaAsaas.update({
      where: { id: cobrancaId },
      data: {
        asaasPaymentId: remota.id,
        status: remota.status === "RECEIVED" ? "RECEBIDA" : "PENDENTE",
        ativa: cobrancaRemotaContinuaAtiva(remota.status) && !outraAtiva,
        recebidaEmAsaas:
          remota.status === "RECEIVED"
            ? (interpretarDataAsaas(remota.paymentDate) ?? new Date())
            : undefined,
        statusAsaas: remota.status,
        invoiceUrl: remota.invoiceUrl ?? null,
        pixCopiaECola: qrCode?.payload ?? null,
        qrCodeExpiraEm: interpretarDataAsaas(qrCode?.expirationDate),
        ultimoErro: null,
      },
    })
    if (anterior.asaasPaymentId !== cobranca.asaasPaymentId) {
      await registrarLog(
        {
          autorId,
          acao: "PAGAMENTO",
          entidade: "CobrancaAsaas",
          entidadeId: cobranca.id,
          valorAntigo: { status: anterior.status, asaasPaymentId: anterior.asaasPaymentId },
          valorNovo: {
            status: cobranca.status,
            asaasPaymentId: cobranca.asaasPaymentId,
            tipo: cobranca.tipo,
          },
        },
        tx,
      )
    }
    return cobranca
  })

  const evento = eventoPagamentoParaStatusAsaas(remota.status)
  if (evento) {
    const resultado = await aplicarWebhookAsaas({
      id: `state:${remota.id}:${remota.status}`,
      event: evento,
      payment: {
        id: remota.id,
        customer: remota.customer,
        billingType: remota.billingType,
        externalReference: remota.externalReference,
        status: remota.status,
        value: remota.value,
        refundedValue: remota.refundedValue,
        dueDate: remota.dueDate,
        paymentDate: remota.paymentDate,
        conciliationIdentifier: remota.conciliationIdentifier,
        pixAutomaticAuthorizationId: remota.pixAutomaticAuthorizationId,
      },
    })
    if (!resultado.ok) throw new Error(resultado.motivo)
  }
  return cobranca
}

export async function gerarCobrancaPixMensal(params: {
  alunoId: string
  mensalidadeId: string
  autorId: string
}) {
  const mensalidade = await db.mensalidade.findFirst({
    where: {
      id: params.mensalidadeId,
      alunoId: params.alunoId,
    },
    include: {
      aluno: { select: { tipoCobrancaPix: true } },
      cobrancasAsaas: { orderBy: { geracao: "desc" }, take: 1 },
      contratoPixAutomatico: { select: { status: true } },
    },
  })
  if (!mensalidade) return { ok: false as const, motivo: "Mensalidade não encontrada." }
  const cobrancaAtual = mensalidade.cobrancasAsaas[0] ?? null
  if (["PAGA", "ISENTA", "CANCELADA"].includes(mensalidade.status)) {
    return { ok: false as const, motivo: "Esta mensalidade não aceita uma nova cobrança." }
  }
  const fallbackAutomatico = Boolean(
    mensalidade.aluno.tipoCobrancaPix === "AUTOMATICO_SEMESTRAL" &&
      ["PIX_AUTOMATICO_RECORRENTE", "PIX_AUTOMATICO_FALLBACK"].includes(
        cobrancaAtual?.tipo ?? "",
      ) &&
      cobrancaAtual?.asaasPaymentId &&
      (["RECUSADA", "CANCELADA", "VENCIDA"].includes(cobrancaAtual.status) ||
        cobrancaAtual.pixCopiaECola),
  )
  if (mensalidade.aluno.tipoCobrancaPix !== "MENSAL" && !fallbackAutomatico) {
    return { ok: false as const, motivo: "Esta mensalidade pertence ao PIX Automático." }
  }
  if (fallbackAutomatico && cobrancaAtual?.asaasPaymentId) {
    try {
      if (qrCodeAindaValido({ ...cobrancaAtual, status: undefined })) {
        return { ok: true as const, cobranca: cobrancaAtual }
      }
      const remota = await obterCobrancaAsaas(cobrancaAtual.asaasPaymentId)
      const cobranca = await persistirCobrancaRemota(cobrancaAtual.id, remota, true, params.autorId)
      return { ok: true as const, cobranca }
    } catch (erro) {
      const motivo = mensagemErroAsaasSegura(erro)
      await db.cobrancaAsaas.update({
        where: { id: cobrancaAtual.id },
        data: { ultimoErro: motivo },
      })
      return { ok: false as const, motivo }
    }
  }
  const contratoTerminal =
    mensalidade.contratoPixAutomatico &&
    ["CONCLUIDO", "CANCELADO", "RECUSADO", "EXPIRADO", "ERRO"].includes(
      mensalidade.contratoPixAutomatico.status,
    )
  if (mensalidade.contratoPixAutomaticoId && !contratoTerminal) {
    return { ok: false as const, motivo: "Mensalidade vinculada ao PIX Automático." }
  }

  const externalReference = referenciaMensalidade(mensalidade.id)
  const vencimentoAsaas = vencimentoAceitoPeloAsaas(mensalidade.vencimento)
  const reserva = await reservarIntencaoCobranca({
    mensalidadeId: mensalidade.id,
    tipo: "PIX_MENSAL",
    externalReference,
    vencimentoAsaas,
    permitirNovaTentativaTerminal: true,
  })
  if (!reserva.ok) return reserva
  const intencao = reserva.intencao

  if (!reserva.proprietaria && qrCodeAindaValido(intencao)) {
    return { ok: true as const, cobranca: intencao }
  }

  if (!reserva.proprietaria && intencao.asaasPaymentId) {
    const retomada = await db.cobrancaAsaas.updateMany({
      where: { id: intencao.id, atualizadoEm: intencao.atualizadoEm },
      data: { ultimoErro: null },
    })
    if (retomada.count === 0) {
      return { ok: false as const, motivo: "O QR Code está sendo atualizado." }
    }
  }

  try {
    const cliente = await garantirClienteAsaas(params.alunoId, params.autorId)
    if (!cliente.ok) return cliente
    const remota = intencao.asaasPaymentId
      ? await obterCobrancaAsaas(intencao.asaasPaymentId)
      : await criarOuRecuperarCobrancaRemota({
          customerId: cliente.customerId,
          externalReference: intencao.externalReference,
          value: Number(mensalidade.valor),
          dueDate: intencao.vencimentoAsaas ?? vencimentoAsaas,
          description: descricaoMensalidade(mensalidade.competencia),
        })
    const cobranca = await persistirCobrancaRemota(intencao.id, remota, true, params.autorId)
    return { ok: true as const, cobranca }
  } catch (erro) {
    const motivo = mensagemErroAsaasSegura(erro)
    await db.cobrancaAsaas.update({
      where: { id: intencao.id },
      data: { status: "ERRO", ultimoErro: motivo },
    })
    return { ok: false as const, motivo }
  }
}

async function competenciaInicialDisponivel(alunoId: string) {
  const atual = chaveCompetencia()
  const mensalidade = await db.mensalidade.findUnique({
    where: { alunoId_competencia: { alunoId, competencia: atual } },
    select: { status: true },
  })
  return mensalidade && ["PAGA", "ISENTA", "CANCELADA"].includes(mensalidade.status)
    ? somarMesesCompetencia(atual, 1)
    : atual
}

async function prepararContratoPixAutomatico(params: { alunoId: string; autorId: string }) {
  const aluno = await db.aluno.findUnique({
    where: { id: params.alunoId },
    include: { plano: true },
  })
  if (!aluno?.plano) {
    return { ok: false as const, motivo: "Vincule um plano mensal ao aluno antes de habilitar." }
  }
  if (aluno.plano.periodicidade !== "MENSAL") {
    return { ok: false as const, motivo: "O PIX Automático semestral exige um plano mensal." }
  }
  const contratoAberto = await db.contratoPixAutomatico.findFirst({
    where: {
      alunoId: aluno.id,
      status: { in: ["CRIANDO", "PENDENTE_AUTORIZACAO", "ATIVO", "CANCELANDO"] },
    },
    select: { id: true, status: true, atualizadoEm: true },
  })
  if (contratoAberto) {
    if (
      contratoAberto.status !== "CRIANDO" ||
      reservaAindaEmAndamento(contratoAberto.atualizadoEm)
    ) {
      return { ok: false as const, motivo: "O aluno já possui um ciclo de PIX Automático." }
    }
    const liberado = await db.contratoPixAutomatico.updateMany({
      where: {
        id: contratoAberto.id,
        status: "CRIANDO",
        atualizadoEm: contratoAberto.atualizadoEm,
      },
      data: {
        status: "ERRO",
        ultimoErro: "Operação anterior interrompida antes de criar a autorização.",
      },
    })
    if (liberado.count === 0) {
      return { ok: false as const, motivo: "O aluno já possui um ciclo de PIX Automático." }
    }
  }

  const competenciaInicial = await competenciaInicialDisponivel(aluno.id)
  const competencias = competenciasDoSemestre(competenciaInicial)
  const mensalidades: Mensalidade[] = []
  for (const competencia of competencias) {
    const resultado = await gerarMensalidade({
      alunoId: aluno.id,
      competencia,
      autorId: params.autorId,
    })
    if (!resultado.ok) return resultado
    if (["PAGA", "ISENTA", "CANCELADA"].includes(resultado.mensalidade.status)) {
      return {
        ok: false as const,
        motivo: `A competência ${competencia} já está finalizada e não pode compor o semestre.`,
      }
    }
    mensalidades.push(resultado.mensalidade)
  }

  const contratoRetomavel = await db.contratoPixAutomatico.findFirst({
    where: {
      alunoId: aluno.id,
      status: "ERRO",
      mensalidades: {
        some: { id: mensalidades[0].id },
        every: { id: { in: mensalidades.map((mensalidade) => mensalidade.id) } },
      },
    },
    orderBy: { atualizadoEm: "desc" },
  })
  const cobrancaExistente = await db.cobrancaAsaas.findFirst({
    where: {
      mensalidadeId: { in: mensalidades.map((mensalidade) => mensalidade.id) },
      ativa: true,
    },
    select: {
      id: true,
      contratoPixAutomaticoId: true,
      tipo: true,
      status: true,
      contratoPixAutomatico: { select: { status: true } },
    },
  })
  if (
    cobrancaExistente &&
    (!contratoRetomavel ||
      cobrancaExistente.contratoPixAutomaticoId !== contratoRetomavel.id ||
      cobrancaExistente.tipo !== "PIX_AUTOMATICO_INICIAL")
  ) {
    return {
      ok: false as const,
      motivo: "Uma das mensalidades do semestre já possui cobrança emitida no Asaas.",
    }
  }

  const inicio = new Date()
  const fim = new Date(mensalidades[5].vencimento)
  fim.setUTCDate(fim.getUTCDate() + 1)

  try {
    const contrato = await db.$transaction(async (tx) => {
      const mensalidadeIds = mensalidades.map((mensalidade) => mensalidade.id)
      await bloquearMensalidades(tx, mensalidadeIds)
      const mensalidadesAtuais = await tx.mensalidade.findMany({
        where: { id: { in: mensalidadeIds } },
        select: { id: true, status: true },
      })
      if (
        mensalidadesAtuais.length !== mensalidadeIds.length ||
        mensalidadesAtuais.some(
          (mensalidade) => !STATUS_MENSALIDADE_COBRAVEL.includes(mensalidade.status as never),
        )
      ) {
        throw new ErroEscolhaPagamento(
          "Uma das mensalidades do semestre não aceita uma nova cobrança.",
        )
      }
      const cobrancaAtiva = await tx.cobrancaAsaas.findFirst({
        where: { mensalidadeId: { in: mensalidadeIds }, ativa: true },
      })
      if (
        cobrancaAtiva &&
        (!contratoRetomavel ||
          cobrancaAtiva.contratoPixAutomaticoId !== contratoRetomavel.id ||
          cobrancaAtiva.tipo !== "PIX_AUTOMATICO_INICIAL")
      ) {
        throw new ErroEscolhaPagamento("Outra forma de pagamento já foi selecionada.")
      }

      let salvo: ContratoPixAutomatico
      if (contratoRetomavel) {
        const retomado = await tx.contratoPixAutomatico.updateMany({
          where: {
            id: contratoRetomavel.id,
            status: "ERRO",
            atualizadoEm: contratoRetomavel.atualizadoEm,
          },
          data: {
            asaasAuthorizationId: null,
            asaasConciliationId: null,
            status: "CRIANDO",
            inicio,
            fim,
            valor: aluno.plano!.valor,
            pixCopiaECola: null,
            qrCodeExpiraEm: null,
            ultimoErro: null,
          },
        })
        if (retomado.count === 0) {
          throw new ErroEscolhaPagamento(
            "O ciclo de PIX Automático foi alterado por outra operação.",
          )
        }
        salvo = await tx.contratoPixAutomatico.findUniqueOrThrow({
          where: { id: contratoRetomavel.id },
        })
      } else {
        salvo = await tx.contratoPixAutomatico.create({
          data: {
            alunoId: aluno.id,
            inicio,
            fim,
            valor: aluno.plano!.valor,
          },
        })
      }

      for (const [indice, mensalidade] of mensalidades.entries()) {
        await tx.mensalidade.update({
          where: { id: mensalidade.id },
          data: { contratoPixAutomaticoId: salvo.id, numeroCicloPix: indice + 1 },
        })
      }

      const primeira = mensalidades[0]
      const ultimaCobranca = await tx.cobrancaAsaas.findFirst({
        where: { mensalidadeId: primeira.id },
        orderBy: { geracao: "desc" },
      })
      const intencaoInicial = cobrancaAtiva
        ? await tx.cobrancaAsaas.update({
            where: { id: cobrancaAtiva.id },
            data: {
              status: "CRIANDO",
              ultimoErro: null,
              vencimentoAsaas: primeira.vencimento,
            },
          })
        : await tx.cobrancaAsaas.create({
            data: {
              mensalidadeId: primeira.id,
              contratoPixAutomaticoId: salvo.id,
              tipo: "PIX_AUTOMATICO_INICIAL",
              externalReference: referenciaCiclo(salvo.id, 1),
              vencimentoAsaas: primeira.vencimento,
              geracao: (ultimaCobranca?.geracao ?? 0) + 1,
            },
          })
      const podeReaproveitarIntencao =
        intencaoInicial.tipo === "PIX_AUTOMATICO_INICIAL" &&
        intencaoInicial.contratoPixAutomaticoId === salvo.id
      if (!podeReaproveitarIntencao) {
        throw new ErroEscolhaPagamento("Outra forma de pagamento já foi selecionada.")
      }
      return salvo
    })
    return { ok: true as const, aluno, contrato, mensalidades }
  } catch (erro) {
    if (erro instanceof ErroEscolhaPagamento) {
      return { ok: false as const, motivo: erro.message }
    }
    if (erroPrismaUnicidade(erro)) {
      return { ok: false as const, motivo: "Outra forma de pagamento já foi selecionada." }
    }
    throw erro
  }
}

async function criarOuRecuperarAutorizacao(params: {
  contratoId: string
  customerId: string
  inicio: Date
  fim: Date
  valor: number
}) {
  const contractId = `ecvo-${params.contratoId}`.slice(0, 35)
  const encontradas = await listarAutorizacoesPixAutomaticoAsaas({
    customerId: params.customerId,
    limit: 100,
  })
  const existente = encontradas.data.find((item) => item.contractId === contractId)
  if (existente) return existente

  return criarAutorizacaoPixAutomaticoAsaas({
    frequency: "MONTHLY",
    contractId,
    startDate: dataAsaas(params.inicio),
    finishDate: dataAsaas(params.fim),
    value: params.valor,
    description: "Semestralidade ECVO",
    customerId: params.customerId,
    paymentCreationMode: "MANUAL",
    retryPolicy: "NOT_ALLOWED",
    immediateQrCode: {
      ...(process.env.ASAAS_PIX_KEY ? { pixKey: process.env.ASAAS_PIX_KEY } : {}),
      expirationSeconds: EXPIRACAO_QR_AUTORIZACAO_SEGUNDOS,
      originalValue: params.valor,
      description: "Mensalidade 1 de 6",
    },
  })
}

export async function configurarTipoCobrancaPix(params: {
  alunoId: string
  tipoCobrancaPix: TipoCobrancaPix
  autorId: string
}) {
  if (params.tipoCobrancaPix === "MENSAL") {
    const aluno = await db.aluno.findUnique({
      where: { id: params.alunoId },
      include: {
        contratosPixAutomatico: {
          where: {
            status: { in: ["CRIANDO", "PENDENTE_AUTORIZACAO", "ATIVO", "CANCELANDO", "ERRO"] },
          },
          take: 1,
        },
      },
    })
    if (!aluno) return { ok: false as const, motivo: "Aluno não encontrado." }
    if (aluno.contratosPixAutomatico.length > 0) {
      return cancelarPixAutomatico({ alunoId: aluno.id, autorId: params.autorId })
    }
    await db.$transaction(async (tx) => {
      await tx.aluno.update({ where: { id: aluno.id }, data: { tipoCobrancaPix: "MENSAL" } })
      await registrarLog(
        {
          autorId: params.autorId,
          acao: "PAGAMENTO",
          entidade: "Aluno",
          entidadeId: aluno.id,
          valorAntigo: { tipoCobrancaPix: aluno.tipoCobrancaPix },
          valorNovo: { tipoCobrancaPix: "MENSAL" },
        },
        tx,
      )
    })
    return { ok: true as const }
  }

  try {
    await reconciliarAutorizacaoExpiradaDoAluno(params.alunoId)
  } catch (erro) {
    return { ok: false as const, motivo: mensagemErroAsaasSegura(erro) }
  }
  const preparado = await prepararContratoPixAutomatico(params)
  if (!preparado.ok) return preparado

  try {
    const cliente = await garantirClienteAsaas(params.alunoId, params.autorId)
    if (!cliente.ok) {
      await db.contratoPixAutomatico.updateMany({
        where: { id: preparado.contrato.id, status: "CRIANDO" },
        data: { status: "ERRO", ultimoErro: cliente.motivo },
      })
      return cliente
    }
    const autorizacao = await criarOuRecuperarAutorizacao({
      contratoId: preparado.contrato.id,
      customerId: cliente.customerId,
      inicio: preparado.contrato.inicio,
      fim: preparado.contrato.fim,
      valor: Number(preparado.contrato.valor),
    })
    const primeira = preparado.mensalidades[0]
    const resultado = await db.$transaction(async (tx) => {
      const contrato = await tx.contratoPixAutomatico.update({
        where: { id: preparado.contrato.id },
        data: {
          asaasAuthorizationId: autorizacao.id,
          asaasConciliationId: autorizacao.immediateQrCode.conciliationIdentifier,
          status: statusContrato(autorizacao),
          pixCopiaECola: autorizacao.payload ?? null,
          qrCodeExpiraEm: interpretarDataAsaas(autorizacao.immediateQrCode.expirationDate),
          ultimoErro: null,
        },
      })
      await tx.cobrancaAsaas.updateMany({
        where: {
          mensalidadeId: primeira.id,
          contratoPixAutomaticoId: contrato.id,
          tipo: "PIX_AUTOMATICO_INICIAL",
          ativa: true,
        },
        data: {
          status: "PENDENTE",
          pixCopiaECola: autorizacao.payload ?? null,
          qrCodeExpiraEm: interpretarDataAsaas(autorizacao.immediateQrCode.expirationDate),
        },
      })
      await tx.aluno.update({
        where: { id: params.alunoId },
        data: { tipoCobrancaPix: "AUTOMATICO_SEMESTRAL" },
      })
      await registrarLog(
        {
          autorId: params.autorId,
          acao: "PAGAMENTO",
          entidade: "ContratoPixAutomatico",
          entidadeId: contrato.id,
          valorNovo: {
            alunoId: params.alunoId,
            tipoCobrancaPix: "AUTOMATICO_SEMESTRAL",
            totalCiclos: TOTAL_CICLOS_PIX_AUTOMATICO,
            valorMensal: Number(contrato.valor),
            inicio: contrato.inicio.toISOString(),
            fim: contrato.fim.toISOString(),
          },
        },
        tx,
      )
      return contrato
    })
    return { ok: true as const, contrato: resultado }
  } catch (erro) {
    const motivo = mensagemErroAsaasSegura(erro)
    await db.$transaction([
      db.contratoPixAutomatico.update({
        where: { id: preparado.contrato.id },
        data: { status: "ERRO", ultimoErro: motivo },
      }),
      db.cobrancaAsaas.updateMany({
        where: {
          mensalidadeId: preparado.mensalidades[0].id,
          contratoPixAutomaticoId: preparado.contrato.id,
          ativa: true,
        },
        data: { status: "ERRO", ultimoErro: motivo },
      }),
    ])
    return { ok: false as const, motivo }
  }
}

function statusContrato(autorizacao: AutorizacaoPixAutomaticoAsaas): StatusContratoPixAutomatico {
  const mapa: Record<AutorizacaoPixAutomaticoAsaas["status"], StatusContratoPixAutomatico> = {
    CREATED: "PENDENTE_AUTORIZACAO",
    ACTIVE: "ATIVO",
    CANCELLED: "CANCELADO",
    REFUSED: "RECUSADO",
    EXPIRED: "EXPIRADO",
  }
  return mapa[autorizacao.status]
}

const EVENTO_AUTORIZACAO_POR_STATUS: Record<AutorizacaoPixAutomaticoAsaas["status"], string> = {
  CREATED: "PIX_AUTOMATIC_RECURRING_AUTHORIZATION_CREATED",
  ACTIVE: "PIX_AUTOMATIC_RECURRING_AUTHORIZATION_ACTIVATED",
  CANCELLED: "PIX_AUTOMATIC_RECURRING_AUTHORIZATION_CANCELLED",
  REFUSED: "PIX_AUTOMATIC_RECURRING_AUTHORIZATION_REFUSED",
  EXPIRED: "PIX_AUTOMATIC_RECURRING_AUTHORIZATION_EXPIRED",
}

async function reconciliarAutorizacaoExpiradaDoAluno(alunoId: string, agora = new Date()) {
  const contrato = await db.contratoPixAutomatico.findFirst({
    where: {
      alunoId,
      status: "PENDENTE_AUTORIZACAO",
      asaasAuthorizationId: { not: null },
      qrCodeExpiraEm: { lte: agora },
    },
    include: { aluno: { include: { clienteAsaas: true } } },
    orderBy: { atualizadoEm: "desc" },
  })
  const customerId = contrato?.aluno.clienteAsaas?.asaasCustomerId
  if (!contrato?.asaasAuthorizationId || !customerId) return

  const remota = (await listarAutorizacoesPixAutomaticoAsaas({ customerId, limit: 100 })).data.find(
    (item) => item.id === contrato.asaasAuthorizationId,
  )
  if (!remota) return
  await aplicarWebhookAsaas({
    id: `reconcile:${remota.id}:${remota.status}`,
    event: EVENTO_AUTORIZACAO_POR_STATUS[remota.status],
    authorization: { id: remota.id },
  })
}

async function reservarFallbackAutomatico(params: {
  mensalidadeId: string
  contratoId: string
  numeroCiclo: number
  vencimentoAsaas: Date
}) {
  return db.$transaction(async (tx) => {
    await bloquearMensalidades(tx, [params.mensalidadeId])
    const mensalidade = await tx.mensalidade.findUnique({
      where: { id: params.mensalidadeId },
      select: { status: true },
    })
    if (!mensalidade || !STATUS_MENSALIDADE_COBRAVEL.includes(mensalidade.status as never)) {
      return { ok: false as const, motivo: "Esta mensalidade não aceita uma nova cobrança." }
    }

    const ultima = await tx.cobrancaAsaas.findFirst({
      where: { mensalidadeId: params.mensalidadeId },
      orderBy: { geracao: "desc" },
    })
    if (ultima?.ativa && ultima.tipo === "PIX_AUTOMATICO_FALLBACK") {
      if (ultima.asaasPaymentId) {
        return { ok: true as const, proprietaria: false as const, intencao: ultima }
      }
      if (ultima.status !== "ERRO" && reservaAindaEmAndamento(ultima.atualizadoEm)) {
        return { ok: false as const, motivo: "A cobrança de contingência está em processamento." }
      }
      const intencao = await tx.cobrancaAsaas.update({
        where: { id: ultima.id },
        data: { status: "CRIANDO", ultimoErro: null },
      })
      return { ok: true as const, proprietaria: true as const, intencao }
    }
    if (ultima?.ativa && ultima.asaasPaymentId) {
      return { ok: false as const, motivo: "O ciclo já possui uma cobrança remota ativa." }
    }
    if (ultima?.ativa) {
      await tx.cobrancaAsaas.update({
        where: { id: ultima.id },
        data: {
          ativa: false,
          status: "ERRO",
          ultimoErro: "Janela do PIX Automático perdida; substituída por PIX de contingência.",
        },
      })
    }

    const geracao = (ultima?.geracao ?? 0) + 1
    const intencao = await tx.cobrancaAsaas.create({
      data: {
        mensalidadeId: params.mensalidadeId,
        contratoPixAutomaticoId: params.contratoId,
        tipo: "PIX_AUTOMATICO_FALLBACK",
        externalReference: `pixauto-fallback:${params.contratoId}:${params.numeroCiclo}:${geracao}`,
        vencimentoAsaas: params.vencimentoAsaas,
        geracao,
      },
    })
    return { ok: true as const, proprietaria: true as const, intencao }
  })
}

async function notificarFallbackAutomatico(mensalidadeId: string) {
  await db.$transaction(async (tx) => {
    const mensalidade = await tx.mensalidade.findUnique({
      where: { id: mensalidadeId },
      select: { competencia: true, aluno: { select: { usuarioId: true } } },
    })
    if (!mensalidade) return
    await tx.notificacao.create({
      data: {
        usuarioId: mensalidade.aluno.usuarioId,
        tipo: "FINANCEIRO",
        titulo: "Mensalidade disponível para pagar",
        mensagem: `${mensalidade.competencia}: o débito automático não pôde ser agendado a tempo. Pague a cobrança de contingência via PIX; os próximos ciclos continuam automáticos.`,
      },
    })
    const gestores = await tx.usuario.findMany({
      where: { papel: "GESTOR", ativo: true },
      select: { id: true },
    })
    if (gestores.length > 0) {
      await tx.notificacao.createMany({
        data: gestores.map((gestor) => ({
          usuarioId: gestor.id,
          tipo: "FINANCEIRO" as const,
          titulo: "Fallback do PIX Automático",
          mensagem: `${mensalidade.competencia}: foi emitido um PIX de contingência porque a janela automática foi perdida.`,
        })),
      })
    }
  })
}

export async function processarCobrancasPixAutomaticoPendentes(hoje = new Date()) {
  const mensalidades = await db.mensalidade.findMany({
    where: {
      numeroCicloPix: { gte: 2, lte: TOTAL_CICLOS_PIX_AUTOMATICO },
      vencimento: { lte: new Date(hoje.getTime() + 14 * 86_400_000) },
      contratoPixAutomatico: { status: "ATIVO", asaasAuthorizationId: { not: null } },
      status: { in: ["EM_ABERTO", "VENCIDA"] },
    },
    include: {
      cobrancasAsaas: { orderBy: { geracao: "desc" }, take: 1 },
      contratoPixAutomatico: { include: { aluno: { include: { clienteAsaas: true } } } },
    },
    orderBy: { vencimento: "asc" },
  })

  let criadas = 0
  const falhas: Array<{ mensalidadeId: string; motivo: string }> = []
  for (const mensalidade of mensalidades) {
    const contrato = mensalidade.contratoPixAutomatico
    const customerId = contrato?.aluno.clienteAsaas?.asaasCustomerId
    const authorizationId = contrato?.asaasAuthorizationId
    const numero = mensalidade.numeroCicloPix
    if (!contrato || !customerId || !authorizationId || !numero) {
      falhas.push({
        mensalidadeId: mensalidade.id,
        motivo: "Ciclo automático sem contrato, cliente ou autorização materializados.",
      })
      continue
    }

    let intencaoId: string | null = null
    try {
      const cobrancaAtual = mensalidade.cobrancasAsaas[0] ?? null
      if (cobrancaAtual?.ativa && cobrancaAtual.asaasPaymentId) continue

      const dentroDaJanela = estaNaJanelaDeCriacaoPixAutomatico(mensalidade.vencimento, hoje)
      if (!dentroDaJanela && cobrancaAtual?.ativa && !cobrancaAtual.asaasPaymentId) {
        const encontradas = await listarCobrancasAsaas({
          externalReference: cobrancaAtual.externalReference,
          limit: 2,
        })
        if (encontradas.data.length > 1) {
          throw new Error(
            "Mais de uma cobrança Asaas usa a mesma referência; concilie manualmente.",
          )
        }
        if (encontradas.data[0]) {
          await persistirCobrancaRemota(cobrancaAtual.id, encontradas.data[0], false)
          criadas++
          continue
        }
      }

      const vencimentoFallback =
        mensalidade.vencimento.getTime() > hoje.getTime()
          ? mensalidade.vencimento
          : dataCivilParaDate(dataAsaas(hoje))
      const reserva = dentroDaJanela
        ? await reservarIntencaoCobranca({
            mensalidadeId: mensalidade.id,
            contratoPixAutomaticoId: contrato.id,
            tipo: "PIX_AUTOMATICO_RECORRENTE",
            externalReference: referenciaCiclo(contrato.id, numero),
            vencimentoAsaas: mensalidade.vencimento,
          })
        : await reservarFallbackAutomatico({
            mensalidadeId: mensalidade.id,
            contratoId: contrato.id,
            numeroCiclo: numero,
            vencimentoAsaas: vencimentoFallback,
          })
      if (!reserva.ok) {
        falhas.push({ mensalidadeId: mensalidade.id, motivo: reserva.motivo })
        continue
      }
      const intencao = reserva.intencao
      intencaoId = intencao.id
      if (intencao.asaasPaymentId) continue

      const remota = await criarOuRecuperarCobrancaRemota({
        customerId,
        externalReference: intencao.externalReference,
        value: Number(mensalidade.valor),
        dueDate: intencao.vencimentoAsaas ?? mensalidade.vencimento,
        description: dentroDaJanela
          ? `Mensalidade ${numero} de ${TOTAL_CICLOS_PIX_AUTOMATICO}`
          : `Mensalidade ${numero} de ${TOTAL_CICLOS_PIX_AUTOMATICO} — contingência`,
        pixAutomaticAuthorizationId: dentroDaJanela ? authorizationId : undefined,
      })
      await persistirCobrancaRemota(intencao.id, remota, !dentroDaJanela)
      if (!dentroDaJanela && reserva.proprietaria) {
        await notificarFallbackAutomatico(mensalidade.id)
      }
      criadas++
    } catch (erro) {
      const motivo = mensagemErroAsaasSegura(erro)
      if (intencaoId) {
        await db.cobrancaAsaas.update({
          where: { id: intencaoId },
          data: { status: "ERRO", ultimoErro: motivo },
        })
      }
      falhas.push({ mensalidadeId: mensalidade.id, motivo })
    }
  }

  return { ok: falhas.length === 0, analisadas: mensalidades.length, criadas, falhas }
}

export async function reconciliarPendenciasAsaas() {
  const cobrancas = await db.cobrancaAsaas.findMany({
    where: {
      AND: [
        {
          OR: [
            { status: { in: ["CRIANDO", "PENDENTE", "CANCELANDO", "VENCIDA", "ERRO"] } },
            {
              status: "RECEBIDA",
              mensalidade: { status: { in: ["EM_ABERTO", "VENCIDA"] } },
            },
          ],
        },
        { OR: [{ ativa: true }, { asaasPaymentId: { not: null } }] },
      ],
    },
    orderBy: { atualizadoEm: "asc" },
    take: 100,
  })
  let pagamentosAtualizados = 0
  const falhasPagamentos: Array<{ cobrancaId: string; motivo: string }> = []
  for (const cobranca of cobrancas) {
    try {
      const encontradas = await listarCobrancasAsaas({
        externalReference: cobranca.externalReference,
        limit: 2,
      })
      if (encontradas.data.length > 1) {
        throw new Error("Mais de uma cobrança Asaas usa a mesma referência; concilie manualmente.")
      }
      const remota = encontradas.data[0]
      if (!remota) {
        if (cobranca.status === "ERRO" || !reservaAindaEmAndamento(cobranca.atualizadoEm)) {
          throw new Error("A intenção local não possui cobrança correspondente no Asaas.")
        }
        continue
      }
      const incluirQrCode =
        ["PIX_MENSAL", "PIX_AUTOMATICO_FALLBACK"].includes(cobranca.tipo) &&
        !qrCodeAindaValido(cobranca) &&
        ["PENDING", "OVERDUE"].includes(remota.status)
      await persistirCobrancaRemota(cobranca.id, remota, incluirQrCode)
      pagamentosAtualizados++
    } catch (erro) {
      const motivo = mensagemErroAsaasSegura(erro)
      await db.cobrancaAsaas.update({
        where: { id: cobranca.id },
        data: { ultimoErro: motivo },
      })
      falhasPagamentos.push({ cobrancaId: cobranca.id, motivo })
    }
  }

  const contratos = await db.contratoPixAutomatico.findMany({
    where: {
      status: { in: ["PENDENTE_AUTORIZACAO", "ATIVO", "CANCELANDO", "ERRO"] },
      asaasAuthorizationId: { not: null },
    },
    include: { aluno: { include: { clienteAsaas: true } } },
    orderBy: { atualizadoEm: "asc" },
    take: 100,
  })
  let autorizacoesAtualizadas = 0
  const falhasAutorizacoes: Array<{ contratoId: string; motivo: string }> = []
  for (const contrato of contratos) {
    const customerId = contrato.aluno.clienteAsaas?.asaasCustomerId
    if (!customerId || !contrato.asaasAuthorizationId) continue
    try {
      const remota = (
        await listarAutorizacoesPixAutomaticoAsaas({ customerId, limit: 100 })
      ).data.find((item) => item.id === contrato.asaasAuthorizationId)
      if (!remota) continue
      await aplicarWebhookAsaas({
        id: `reconcile:${remota.id}:${remota.status}`,
        event: EVENTO_AUTORIZACAO_POR_STATUS[remota.status],
        authorization: { id: remota.id },
      })
      autorizacoesAtualizadas++
    } catch (erro) {
      const motivo = mensagemErroAsaasSegura(erro)
      await db.contratoPixAutomatico.update({
        where: { id: contrato.id },
        data: { ultimoErro: motivo },
      })
      falhasAutorizacoes.push({ contratoId: contrato.id, motivo })
    }
  }

  return {
    ok: falhasPagamentos.length === 0 && falhasAutorizacoes.length === 0,
    pagamentosAnalisados: cobrancas.length,
    pagamentosAtualizados,
    autorizacoesAtualizadas,
    falhasPagamentos,
    falhasAutorizacoes,
  }
}

function statusCobrancaPorEvento(evento: string): StatusCobrancaAsaas | null {
  if (evento === "PAYMENT_RECEIVED" || evento === "PAYMENT_CONFIRMED") return "RECEBIDA" as const
  if (evento === "PAYMENT_OVERDUE") return "VENCIDA" as const
  if (evento === "PAYMENT_DELETED") return "CANCELADA" as const
  if (evento === "PAYMENT_REFUNDED" || evento === "PAYMENT_PARTIALLY_REFUNDED") {
    return "ESTORNADA" as const
  }
  if (evento.includes("REFUSED")) return "RECUSADA" as const
  return null
}

function statusCobrancaPorInstrucao(evento: string): StatusCobrancaAsaas | null {
  if (evento === "PIX_AUTOMATIC_RECURRING_PAYMENT_INSTRUCTION_REFUSED") return "RECUSADA"
  if (evento === "PIX_AUTOMATIC_RECURRING_PAYMENT_INSTRUCTION_CANCELLED") return "CANCELADA"
  if (
    evento === "PIX_AUTOMATIC_RECURRING_PAYMENT_INSTRUCTION_CREATED" ||
    evento === "PIX_AUTOMATIC_RECURRING_PAYMENT_INSTRUCTION_SCHEDULED"
  ) {
    return "PENDENTE"
  }
  return null
}

async function baixarMensalidadePeloAsaas(
  tx: Prisma.TransactionClient,
  cobranca: { id: string; mensalidadeId: string; externalReference: string },
  webhook: WebhookAsaas,
) {
  const mensalidade = await tx.mensalidade.findUnique({
    where: { id: cobranca.mensalidadeId },
    include: { aluno: { select: { usuarioId: true } } },
  })
  if (!mensalidade) return
  if (
    mensalidade.status === "PAGA" &&
    mensalidade.formaPagamento === "PIX_ASAAS" &&
    mensalidade.cobrancaQuitacaoAsaasId === cobranca.id
  ) {
    return
  }
  const outraTentativaRecebida = await tx.cobrancaAsaas.findFirst({
    where: { mensalidadeId: mensalidade.id, id: { not: cobranca.id }, status: "RECEBIDA" },
    select: { id: true },
  })
  if (outraTentativaRecebida) {
    await tx.cobrancaAsaas.update({
      where: { id: cobranca.id },
      data: { ultimoErro: "Possível pagamento duplicado; conciliação manual necessária." },
    })
    await tx.notificacao.create({
      data: {
        usuarioId: mensalidade.aluno.usuarioId,
        tipo: "FINANCEIRO",
        titulo: "Pagamento duplicado em conciliação",
        mensagem: `${mensalidade.competencia}: identificamos mais de um pagamento Asaas e a academia fará a conciliação.`,
      },
    })
    const gestores = await tx.usuario.findMany({
      where: { papel: "GESTOR", ativo: true },
      select: { id: true },
    })
    if (gestores.length > 0) {
      await tx.notificacao.createMany({
        data: gestores.map((gestor) => ({
          usuarioId: gestor.id,
          tipo: "FINANCEIRO" as const,
          titulo: "Possível pagamento Asaas duplicado",
          mensagem: `${mensalidade.competencia}: há duas tentativas recebidas para a mesma mensalidade.`,
        })),
      })
    }
    return
  }
  if (
    webhook.payment?.externalReference &&
    webhook.payment.externalReference !== cobranca.externalReference
  ) {
    await tx.cobrancaAsaas.update({
      where: { id: cobranca.id },
      data: { status: "ERRO", ultimoErro: "Referência externa divergente no webhook." },
    })
    return
  }
  if (
    webhook.payment?.value !== undefined &&
    Math.abs(webhook.payment.value - Number(mensalidade.valor)) > 0.001
  ) {
    await tx.cobrancaAsaas.update({
      where: { id: cobranca.id },
      data: { status: "ERRO", ultimoErro: "Valor divergente no webhook." },
    })
    return
  }

  const dataInformada = webhook.payment?.paymentDate ?? webhook.dateCreated
  const dataRecebimento = interpretarDataAsaas(dataInformada) ?? new Date()
  const origemData = webhook.payment?.paymentDate
    ? "payment.paymentDate"
    : webhook.dateCreated
      ? "webhook.dateCreated"
      : "instante_processamento"
  const alterada = await tx.mensalidade.updateMany({
    where: { id: mensalidade.id, status: { in: ["EM_ABERTO", "VENCIDA"] } },
    data: {
      status: "PAGA",
      pagoEm: dataRecebimento,
      formaPagamento: "PIX_ASAAS",
      cobrancaQuitacaoAsaasId: cobranca.id,
    },
  })
  if (alterada.count === 0) return

  await registrarLog(
    {
      autorId: null,
      acao: "PAGAMENTO",
      entidade: "Mensalidade",
      entidadeId: mensalidade.id,
      valorAntigo: { status: mensalidade.status },
      valorNovo: {
        status: "PAGA",
        formaPagamento: "PIX_ASAAS",
        pagoEm: dataRecebimento.toISOString(),
        origemData,
        evento: webhook.id,
      },
    },
    tx,
  )
  await tx.notificacao.create({
    data: {
      usuarioId: mensalidade.aluno.usuarioId,
      tipo: "FINANCEIRO",
      titulo: "Pagamento confirmado",
      mensagem: `${mensalidade.competencia}: pagamento via PIX confirmado.`,
    },
  })
  await sincronizarStatusFinanceiroAluno(tx, mensalidade.alunoId)
}

async function estornarMensalidadePeloAsaas(
  tx: Prisma.TransactionClient,
  cobranca: { id: string; mensalidadeId: string; estornoParcialPendenteEm?: Date | null },
  webhook: WebhookAsaas,
) {
  const mensalidade = await tx.mensalidade.findUnique({
    where: { id: cobranca.mensalidadeId },
    include: { aluno: { select: { usuarioId: true } } },
  })
  if (!mensalidade) return
  if (mensalidade.cobrancaQuitacaoAsaasId !== cobranca.id) {
    if (cobranca.estornoParcialPendenteEm) {
      await tx.cobrancaAsaas.update({
        where: { id: cobranca.id },
        data: { estornoParcialPendenteEm: null, ativa: false, ultimoErro: null },
      })
    }
    return
  }
  const outraTentativaRecebida = await tx.cobrancaAsaas.findFirst({
    where: { mensalidadeId: mensalidade.id, id: { not: cobranca.id }, status: "RECEBIDA" },
    select: { id: true, recebidaEmAsaas: true },
  })
  if (outraTentativaRecebida) {
    await tx.cobrancaAsaas.update({
      where: { id: outraTentativaRecebida.id },
      data: {
        ativa: true,
        ultimoErro: "Promovida após estorno da tentativa que havia quitado a mensalidade.",
      },
    })
    await tx.mensalidade.updateMany({
      where: { id: mensalidade.id, cobrancaQuitacaoAsaasId: cobranca.id },
      data: {
        status: "PAGA",
        pagoEm: outraTentativaRecebida.recebidaEmAsaas ?? mensalidade.pagoEm,
        formaPagamento: "PIX_ASAAS",
        cobrancaQuitacaoAsaasId: outraTentativaRecebida.id,
      },
    })
    await registrarLog(
      {
        autorId: null,
        acao: "PAGAMENTO",
        entidade: "Mensalidade",
        entidadeId: mensalidade.id,
        valorAntigo: { cobrancaQuitacaoAsaasId: cobranca.id },
        valorNovo: { cobrancaQuitacaoAsaasId: outraTentativaRecebida.id, evento: webhook.id },
        justificativa: "Quitação transferida para outra tentativa recebida após estorno.",
      },
      tx,
    )
    return
  }

  const novoStatus = statusMensalidadeEfetivo({
    status: "EM_ABERTO",
    vencimento: mensalidade.vencimento,
  })
  const alterada = await tx.mensalidade.updateMany({
    where: {
      id: mensalidade.id,
      cobrancaQuitacaoAsaasId: cobranca.id,
      OR: [
        { status: "PAGA", formaPagamento: "PIX_ASAAS" },
        ...(cobranca.estornoParcialPendenteEm ? [{ status: "CANCELADA" as const }] : []),
      ],
    },
    data: {
      status: novoStatus,
      pagoEm: null,
      formaPagamento: null,
      cobrancaQuitacaoAsaasId: null,
    },
  })
  if (alterada.count === 0) return
  await tx.cobrancaAsaas.update({
    where: { id: cobranca.id },
    data: { estornoParcialPendenteEm: null, ativa: false },
  })

  await registrarLog(
    {
      autorId: null,
      acao: "PAGAMENTO",
      entidade: "Mensalidade",
      entidadeId: mensalidade.id,
      valorAntigo: { status: mensalidade.status, formaPagamento: mensalidade.formaPagamento },
      valorNovo: { status: novoStatus, formaPagamento: null, evento: webhook.id },
      justificativa: "Estorno integral confirmado pelo Asaas.",
    },
    tx,
  )
  await tx.notificacao.create({
    data: {
      usuarioId: mensalidade.aluno.usuarioId,
      tipo: "FINANCEIRO",
      titulo: "Pagamento estornado",
      mensagem: `${mensalidade.competencia}: o pagamento via PIX foi estornado.`,
    },
  })
  await sincronizarStatusFinanceiroAluno(tx, mensalidade.alunoId)
}

async function conciliarEstornoParcialPeloAsaas(
  tx: Prisma.TransactionClient,
  cobranca: { id: string; mensalidadeId: string },
  webhook: WebhookAsaas,
) {
  const mensalidade = await tx.mensalidade.findUnique({
    where: { id: cobranca.mensalidadeId },
    include: { aluno: { select: { usuarioId: true } } },
  })
  if (!mensalidade) return
  if (mensalidade.cobrancaQuitacaoAsaasId !== cobranca.id) return
  const outraTentativaRecebida = await tx.cobrancaAsaas.findFirst({
    where: { mensalidadeId: mensalidade.id, id: { not: cobranca.id }, status: "RECEBIDA" },
    select: { id: true, recebidaEmAsaas: true },
  })
  if (outraTentativaRecebida) {
    await tx.cobrancaAsaas.update({
      where: { id: outraTentativaRecebida.id },
      data: {
        ativa: true,
        ultimoErro: "Promovida após estorno parcial da tentativa que havia quitado a mensalidade.",
      },
    })
    await tx.mensalidade.updateMany({
      where: { id: mensalidade.id, cobrancaQuitacaoAsaasId: cobranca.id },
      data: {
        status: "PAGA",
        pagoEm: outraTentativaRecebida.recebidaEmAsaas ?? mensalidade.pagoEm,
        formaPagamento: "PIX_ASAAS",
        cobrancaQuitacaoAsaasId: outraTentativaRecebida.id,
      },
    })
    await registrarLog(
      {
        autorId: null,
        acao: "PAGAMENTO",
        entidade: "Mensalidade",
        entidadeId: mensalidade.id,
        valorAntigo: { cobrancaQuitacaoAsaasId: cobranca.id },
        valorNovo: { cobrancaQuitacaoAsaasId: outraTentativaRecebida.id, evento: webhook.id },
        justificativa: "Quitação transferida após estorno parcial da tentativa anterior.",
      },
      tx,
    )
    return
  }

  const valorEstornado = webhook.payment?.refundedValue
  const detalheValor =
    valorEstornado === null || valorEstornado === undefined
      ? "valor não informado"
      : `valor ${valorEstornado.toFixed(2)}`
  const observacao = [
    mensalidade.observacao,
    `Conciliação manual: estorno parcial Asaas (${detalheValor}), evento ${webhook.id}.`,
  ]
    .filter(Boolean)
    .join("\n")

  const alterada = await tx.mensalidade.updateMany({
    where: {
      id: mensalidade.id,
      status: "PAGA",
      formaPagamento: "PIX_ASAAS",
      cobrancaQuitacaoAsaasId: cobranca.id,
    },
    data: { status: "CANCELADA", pagoEm: null, formaPagamento: null, observacao },
  })
  if (alterada.count === 0) return

  await registrarLog(
    {
      autorId: null,
      acao: "PAGAMENTO",
      entidade: "Mensalidade",
      entidadeId: mensalidade.id,
      valorAntigo: { status: mensalidade.status, formaPagamento: mensalidade.formaPagamento },
      valorNovo: {
        status: "CANCELADA",
        formaPagamento: null,
        evento: webhook.id,
        valorEstornado: valorEstornado ?? null,
      },
      justificativa: "Estorno parcial bloqueado para conciliação financeira manual.",
    },
    tx,
  )
  await tx.notificacao.create({
    data: {
      usuarioId: mensalidade.aluno.usuarioId,
      tipo: "FINANCEIRO",
      titulo: "Pagamento em conciliação",
      mensagem: `${mensalidade.competencia}: houve um estorno parcial e a academia fará a conciliação.`,
    },
  })
  const gestores = await tx.usuario.findMany({
    where: { papel: "GESTOR", ativo: true },
    select: { id: true },
  })
  if (gestores.length > 0) {
    await tx.notificacao.createMany({
      data: gestores.map((gestor) => ({
        usuarioId: gestor.id,
        tipo: "FINANCEIRO" as const,
        titulo: "Estorno parcial para conciliar",
        mensagem: `${mensalidade.competencia}: revise o estorno parcial do pagamento Asaas.`,
      })),
    })
  }
  await sincronizarStatusFinanceiroAluno(tx, mensalidade.alunoId)
}

async function cancelarContratoPorEstornoInicial(
  tx: Prisma.TransactionClient,
  cobranca: {
    id: string
    contratoPixAutomaticoId: string | null
    tipo: CobrancaParaValidacaoWebhook["tipo"]
  },
  webhook: WebhookAsaas,
) {
  if (cobranca.tipo !== "PIX_AUTOMATICO_INICIAL" || !cobranca.contratoPixAutomaticoId) return

  const contrato = await tx.contratoPixAutomatico.findUnique({
    where: { id: cobranca.contratoPixAutomaticoId },
    select: { alunoId: true, status: true },
  })
  if (!contrato) return

  await tx.contratoPixAutomatico.update({
    where: { id: cobranca.contratoPixAutomaticoId },
    data: {
      status: "CANCELADO",
      ultimoErro: "Pagamento inicial estornado; autorização recorrente encerrada.",
    },
  })
  await tx.aluno.update({
    where: { id: contrato.alunoId },
    data: { tipoCobrancaPix: "MENSAL" },
  })
  await tx.cobrancaAsaas.updateMany({
    where: {
      contratoPixAutomaticoId: cobranca.contratoPixAutomaticoId,
      id: { not: cobranca.id },
      status: { in: ["CRIANDO", "PENDENTE", "CANCELANDO", "VENCIDA", "RECUSADA", "ERRO"] },
    },
    data: {
      ativa: false,
      status: "CANCELADA",
      ultimoErro: "Contrato cancelado após estorno do pagamento inicial.",
    },
  })
  await tx.mensalidade.updateMany({
    where: {
      contratoPixAutomaticoId: cobranca.contratoPixAutomaticoId,
      status: { in: ["EM_ABERTO", "VENCIDA", "CANCELADA"] },
    },
    data: { contratoPixAutomaticoId: null, numeroCicloPix: null },
  })

  if (contrato.status !== "CANCELADO") {
    await registrarLog(
      {
        autorId: null,
        acao: "PAGAMENTO",
        entidade: "ContratoPixAutomatico",
        entidadeId: cobranca.contratoPixAutomaticoId,
        valorAntigo: { status: contrato.status },
        valorNovo: { status: "CANCELADO", evento: webhook.event },
        justificativa: "Estorno integral do pagamento inicial confirmado pelo Asaas.",
      },
      tx,
    )
  }
}

async function auditarEstadoCobranca(
  tx: Prisma.TransactionClient,
  params: {
    cobrancaId: string
    statusAntigo: StatusCobrancaAsaas
    statusNovo: StatusCobrancaAsaas
    webhook: WebhookAsaas
  },
) {
  if (params.statusAntigo === params.statusNovo) return
  await registrarLog(
    {
      autorId: null,
      acao: "PAGAMENTO",
      entidade: "CobrancaAsaas",
      entidadeId: params.cobrancaId,
      valorAntigo: { status: params.statusAntigo },
      valorNovo: { status: params.statusNovo, evento: params.webhook.event },
      justificativa: `Evento Asaas ${params.webhook.id}.`,
    },
    tx,
  )
}

type CobrancaParaValidacaoWebhook = {
  asaasPaymentId: string | null
  externalReference: string
  tipo:
    | "PIX_MENSAL"
    | "PIX_AUTOMATICO_INICIAL"
    | "PIX_AUTOMATICO_RECORRENTE"
    | "PIX_AUTOMATICO_FALLBACK"
  vencimentoAsaas: Date | null
  mensalidade: {
    valor: Prisma.Decimal
    vencimento: Date
    aluno: { clienteAsaas: { asaasCustomerId: string | null } | null }
  }
  contratoPixAutomatico: {
    asaasAuthorizationId: string | null
    asaasConciliationId: string | null
  } | null
}

const selecaoCobrancaWebhook = {
  id: true,
  mensalidadeId: true,
  contratoPixAutomaticoId: true,
  asaasPaymentId: true,
  externalReference: true,
  tipo: true,
  status: true,
  vencimentoAsaas: true,
  estornoParcialPendenteEm: true,
  mensalidade: {
    select: {
      valor: true,
      vencimento: true,
      aluno: {
        select: { clienteAsaas: { select: { asaasCustomerId: true } } },
      },
    },
  },
  contratoPixAutomatico: {
    select: { asaasAuthorizationId: true, asaasConciliationId: true },
  },
} satisfies Prisma.CobrancaAsaasSelect

const selecaoCobrancaOperacional = {
  ...selecaoCobrancaWebhook,
  ativa: true,
  atualizadoEm: true,
} satisfies Prisma.CobrancaAsaasSelect

type CobrancaOperacional = Prisma.CobrancaAsaasGetPayload<{
  select: typeof selecaoCobrancaOperacional
}>

async function localizarCobrancaWebhook(
  tx: Prisma.TransactionClient,
  pagamento: NonNullable<WebhookAsaas["payment"]>,
) {
  const exata = await tx.cobrancaAsaas.findFirst({
    where: {
      OR: [
        { asaasPaymentId: pagamento.id },
        ...(pagamento.externalReference
          ? [{ externalReference: pagamento.externalReference }]
          : []),
      ],
    },
    select: selecaoCobrancaWebhook,
  })
  if (exata) return exata
  if (!pagamento.conciliationIdentifier) return null

  const inicial = await tx.cobrancaAsaas.findFirst({
    where: {
      asaasPaymentId: null,
      tipo: "PIX_AUTOMATICO_INICIAL",
      contratoPixAutomatico: {
        asaasConciliationId: pagamento.conciliationIdentifier,
      },
    },
    select: selecaoCobrancaWebhook,
  })
  return inicial
}

function divergenciaPagamentoWebhook(
  cobranca: CobrancaParaValidacaoWebhook,
  pagamento: NonNullable<WebhookAsaas["payment"]>,
) {
  if (cobranca.asaasPaymentId && cobranca.asaasPaymentId !== pagamento.id) {
    return "Identificador da cobrança divergente no webhook."
  }
  if (
    cobranca.tipo !== "PIX_AUTOMATICO_INICIAL" &&
    (!pagamento.externalReference || pagamento.externalReference !== cobranca.externalReference)
  ) {
    return "Referência externa divergente no webhook."
  }
  if (
    !pagamento.customer ||
    pagamento.customer !== cobranca.mensalidade.aluno.clienteAsaas?.asaasCustomerId
  ) {
    return "Cliente Asaas divergente no webhook."
  }
  if (pagamento.billingType !== "PIX") return "Meio de pagamento divergente no webhook."
  if (
    pagamento.value === undefined ||
    Math.abs(pagamento.value - Number(cobranca.mensalidade.valor)) > 0.001
  ) {
    return "Valor divergente no webhook."
  }
  if (
    cobranca.tipo !== "PIX_AUTOMATICO_INICIAL" &&
    (!pagamento.dueDate ||
      pagamento.dueDate !== dataAsaas(cobranca.vencimentoAsaas ?? cobranca.mensalidade.vencimento))
  ) {
    return "Vencimento divergente no webhook."
  }
  if (
    cobranca.tipo === "PIX_AUTOMATICO_INICIAL" &&
    (!pagamento.conciliationIdentifier ||
      pagamento.conciliationIdentifier !== cobranca.contratoPixAutomatico?.asaasConciliationId)
  ) {
    return "Identificador de conciliação divergente no webhook."
  }
  const autorizacaoEsperada =
    cobranca.tipo === "PIX_AUTOMATICO_FALLBACK"
      ? null
      : (cobranca.contratoPixAutomatico?.asaasAuthorizationId ?? null)
  const autorizacaoRecebida = pagamento.pixAutomaticAuthorizationId ?? null
  if (
    cobranca.tipo === "PIX_AUTOMATICO_INICIAL"
      ? autorizacaoRecebida !== null && autorizacaoEsperada !== autorizacaoRecebida
      : autorizacaoEsperada !== autorizacaoRecebida
  ) {
    return "Autorização PIX Automático divergente no webhook."
  }
  return null
}

async function obterCobrancaRemotaParaCancelamento(cobranca: CobrancaOperacional) {
  if (cobranca.asaasPaymentId) return obterCobrancaAsaas(cobranca.asaasPaymentId)
  const encontradas = await listarCobrancasAsaas({
    externalReference: cobranca.externalReference,
    limit: 2,
  })
  if (encontradas.data.length > 1) {
    throw new Error("Mais de uma cobrança Asaas usa a mesma referência; concilie manualmente.")
  }
  return encontradas.data[0] ?? null
}

async function cancelarCobrancaRemotaPendente(cobranca: CobrancaOperacional, autorId: string) {
  const remota = await obterCobrancaRemotaParaCancelamento(cobranca)
  if (!remota) return { estado: "AUSENTE" as const }

  const divergencia = divergenciaPagamentoWebhook(cobranca, {
    id: remota.id,
    customer: remota.customer,
    billingType: remota.billingType,
    externalReference: remota.externalReference,
    status: remota.status,
    value: remota.value,
    dueDate: remota.dueDate,
    conciliationIdentifier: remota.conciliationIdentifier,
    pixAutomaticAuthorizationId: remota.pixAutomaticAuthorizationId,
  })
  if (divergencia) throw new Error(divergencia)

  if (
    ["RECEIVED", "CONFIRMED", "REFUNDED", "PARTIALLY_REFUNDED", "DELETED"].includes(remota.status)
  ) {
    await persistirCobrancaRemota(cobranca.id, remota, false, autorId)
    return {
      estado: ["RECEIVED", "CONFIRMED"].includes(remota.status)
        ? ("RECEBIDA" as const)
        : ("TERMINAL" as const),
    }
  }
  if (!["PENDING", "OVERDUE"].includes(remota.status)) {
    throw new Error(`A cobrança Asaas está no estado ${remota.status} e não pode ser cancelada.`)
  }

  const excluida = await excluirCobrancaAsaas(remota.id)
  if (!excluida.deleted || excluida.id !== remota.id) {
    throw new Error("O Asaas não confirmou a exclusão da cobrança.")
  }
  return { estado: "CANCELADA" as const, asaasPaymentId: remota.id }
}

async function cancelarCobrancaAsaasOperacional(
  params: {
    cobrancaId: string
    autorId: string
  },
  opcoes: { permitirVinculadaAoPixAutomatico: boolean },
) {
  const cobranca = await db.cobrancaAsaas.findUnique({
    where: { id: params.cobrancaId },
    select: selecaoCobrancaOperacional,
  })
  if (!cobranca) return { ok: false as const, motivo: "Cobrança Asaas não encontrada." }
  if (cobranca.tipo !== "PIX_MENSAL" && !opcoes.permitirVinculadaAoPixAutomatico) {
    return {
      ok: false as const,
      motivo: "Cancele o PIX Automático para encerrar uma cobrança vinculada ao contrato.",
    }
  }
  if (!cobranca.ativa || ["CANCELADA", "ESTORNADA"].includes(cobranca.status)) {
    return { ok: true as const }
  }
  if (cobranca.status === "RECEBIDA") {
    return { ok: false as const, motivo: "Uma cobrança recebida não pode ser cancelada." }
  }

  const reservada = await db.cobrancaAsaas.updateMany({
    where: {
      id: cobranca.id,
      ativa: true,
      status: cobranca.status,
      atualizadoEm: cobranca.atualizadoEm,
    },
    data: { status: "CANCELANDO", ultimoErro: null },
  })
  if (reservada.count === 0) {
    return { ok: false as const, motivo: "A cobrança foi alterada por outra operação." }
  }

  try {
    const remota = await cancelarCobrancaRemotaPendente(cobranca, params.autorId)
    if (remota.estado === "RECEBIDA") {
      return { ok: false as const, motivo: "O pagamento já foi confirmado pelo Asaas." }
    }
    if (remota.estado === "TERMINAL") return { ok: true as const }

    const resultado = await db.$transaction(async (tx) => {
      await bloquearMensalidades(tx, [cobranca.mensalidadeId])
      const atual = await tx.cobrancaAsaas.findUnique({ where: { id: cobranca.id } })
      if (!atual) return { ok: false as const, motivo: "Cobrança Asaas não encontrada." }
      if (["CANCELADA", "ESTORNADA"].includes(atual.status)) return { ok: true as const }
      if (atual.status === "RECEBIDA") {
        return { ok: false as const, motivo: "O pagamento já foi confirmado pelo Asaas." }
      }
      if (atual.status !== "CANCELANDO") {
        return { ok: false as const, motivo: "A cobrança foi alterada por outra operação." }
      }
      await tx.cobrancaAsaas.update({
        where: { id: atual.id },
        data: {
          asaasPaymentId: atual.asaasPaymentId ?? remota.asaasPaymentId,
          status: "CANCELADA",
          ativa: false,
          statusAsaas: remota.estado === "CANCELADA" ? "DELETED" : atual.statusAsaas,
          pixCopiaECola: null,
          qrCodeExpiraEm: null,
          ultimoErro: null,
        },
      })
      await registrarLog(
        {
          autorId: params.autorId,
          acao: "PAGAMENTO",
          entidade: "CobrancaAsaas",
          entidadeId: atual.id,
          valorAntigo: { status: cobranca.status, ativa: true },
          valorNovo: { status: "CANCELADA", ativa: false },
          justificativa: "Cobrança cancelada antes de uma alteração financeira manual.",
        },
        tx,
      )
      return { ok: true as const }
    })
    return resultado
  } catch (erro) {
    const motivo = mensagemErroAsaasSegura(erro)
    await db.cobrancaAsaas.updateMany({
      where: { id: cobranca.id, status: "CANCELANDO" },
      data: { status: "ERRO", ultimoErro: motivo },
    })
    return { ok: false as const, motivo }
  }
}

export function cancelarCobrancaAsaasPendente(params: { cobrancaId: string; autorId: string }) {
  return cancelarCobrancaAsaasOperacional(params, {
    permitirVinculadaAoPixAutomatico: false,
  })
}

export function cancelarCobrancaAsaasAntesDeBaixaManual(params: {
  cobrancaId: string
  autorId: string
}) {
  return cancelarCobrancaAsaasOperacional(params, {
    permitirVinculadaAoPixAutomatico: true,
  })
}

export async function cancelarPixAutomatico(params: { alunoId: string; autorId: string }) {
  const contrato = await db.contratoPixAutomatico.findFirst({
    where: {
      alunoId: params.alunoId,
      status: { in: ["CRIANDO", "PENDENTE_AUTORIZACAO", "ATIVO", "CANCELANDO", "ERRO"] },
    },
    include: {
      aluno: { include: { clienteAsaas: true } },
      cobrancas: {
        where: { ativa: true },
        select: selecaoCobrancaOperacional,
      },
      mensalidades: { select: { id: true } },
    },
    orderBy: { criadoEm: "desc" },
  })
  if (!contrato) {
    return { ok: false as const, motivo: "Nenhum PIX Automático em andamento foi encontrado." }
  }

  const reservada = await db.contratoPixAutomatico.updateMany({
    where: { id: contrato.id, status: contrato.status, atualizadoEm: contrato.atualizadoEm },
    data: { status: "CANCELANDO", ultimoErro: null },
  })
  if (reservada.count === 0) {
    return { ok: false as const, motivo: "A autorização foi alterada por outra operação." }
  }

  try {
    const customerId = contrato.aluno.clienteAsaas?.asaasCustomerId
    let autorizacao: AutorizacaoPixAutomaticoAsaas | null = null
    if (contrato.asaasAuthorizationId) {
      autorizacao = await obterAutorizacaoPixAutomaticoAsaas(contrato.asaasAuthorizationId)
    } else if (customerId) {
      const contractId = `ecvo-${contrato.id}`.slice(0, 35)
      autorizacao =
        (await listarAutorizacoesPixAutomaticoAsaas({ customerId, limit: 100 })).data.find(
          (item) => item.contractId === contractId,
        ) ?? null
    }

    if (autorizacao) {
      if (
        !customerId ||
        autorizacao.customerId !== customerId ||
        autorizacao.contractId !== `ecvo-${contrato.id}`.slice(0, 35) ||
        autorizacao.frequency !== "MONTHLY" ||
        autorizacao.paymentCreationMode !== "MANUAL" ||
        autorizacao.retryPolicy !== "NOT_ALLOWED" ||
        Number(autorizacao.value) !== Number(contrato.valor) ||
        autorizacao.startDate !== dataAsaas(contrato.inicio) ||
        autorizacao.finishDate !== dataAsaas(contrato.fim)
      ) {
        throw new Error("A autorização consultada no Asaas diverge do contrato local.")
      }
      if (["CREATED", "ACTIVE"].includes(autorizacao.status)) {
        const cancelada = await cancelarAutorizacaoPixAutomaticoAsaas(autorizacao.id)
        if (cancelada.id !== autorizacao.id || cancelada.status !== "CANCELLED") {
          throw new Error("O Asaas não confirmou o cancelamento da autorização.")
        }
      }
    }

    for (const cobranca of contrato.cobrancas) {
      const resultado = await cancelarCobrancaRemotaPendente(cobranca, params.autorId)
      if (resultado.estado === "RECEBIDA" || resultado.estado === "TERMINAL") continue
    }

    return db.$transaction(async (tx) => {
      await bloquearMensalidades(
        tx,
        contrato.mensalidades.map((mensalidade) => mensalidade.id),
      )
      const atual = await tx.contratoPixAutomatico.findUnique({ where: { id: contrato.id } })
      if (!atual) {
        return { ok: false as const, motivo: "Contrato PIX Automático não encontrado." }
      }
      await tx.cobrancaAsaas.updateMany({
        where: {
          contratoPixAutomaticoId: contrato.id,
          status: { notIn: ["RECEBIDA", "ESTORNADA"] },
        },
        data: {
          status: "CANCELADA",
          ativa: false,
          pixCopiaECola: null,
          qrCodeExpiraEm: null,
          ultimoErro: null,
        },
      })
      if (atual.status !== "CANCELADO") {
        await tx.contratoPixAutomatico.update({
          where: { id: contrato.id },
          data: {
            asaasAuthorizationId: atual.asaasAuthorizationId ?? autorizacao?.id,
            status: "CANCELADO",
            pixCopiaECola: null,
            qrCodeExpiraEm: null,
            ultimoErro: null,
          },
        })
        await registrarLog(
          {
            autorId: params.autorId,
            acao: "PAGAMENTO",
            entidade: "ContratoPixAutomatico",
            entidadeId: contrato.id,
            valorAntigo: { status: contrato.status },
            valorNovo: { status: "CANCELADO", tipoCobrancaPix: "MENSAL" },
            justificativa: "PIX Automático cancelado pelo usuário.",
          },
          tx,
        )
      }
      await tx.aluno.update({
        where: { id: params.alunoId },
        data: { tipoCobrancaPix: "MENSAL" },
      })
      return { ok: true as const }
    })
  } catch (erro) {
    const motivo = mensagemErroAsaasSegura(erro)
    await db.contratoPixAutomatico.updateMany({
      where: { id: contrato.id, status: "CANCELANDO" },
      data: { status: "ERRO", ultimoErro: motivo },
    })
    return { ok: false as const, motivo }
  }
}

async function aplicarWebhookAsaas(webhook: WebhookAsaas) {
  const authorizationId = idAutorizacaoDoWebhook(webhook)
  const paymentInstructionId = idPagamentoInstrucaoDoWebhook(webhook)
  return db.$transaction(async (tx) => {
    const inserido = await tx.eventoWebhookAsaas.createMany({
      data: {
        asaasEventId: webhook.id,
        evento: webhook.event,
        asaasPaymentId: webhook.payment?.id ?? paymentInstructionId,
        asaasAuthorizationId: authorizationId,
      },
      skipDuplicates: true,
    })
    if (inserido.count === 0) return { ok: true as const, duplicado: true }

    let contratoIdAfetado: string | null = null
    const statusPagamento = statusCobrancaPorEvento(webhook.event)

    if (webhook.payment && statusPagamento) {
      const cobrancaMatricula = await tx.cobrancaMatriculaAsaas.findFirst({
        where: {
          mensalidadeId: null,
          OR: [
            { asaasPaymentId: webhook.payment.id },
            ...(webhook.payment.externalReference
              ? [{ externalReference: webhook.payment.externalReference }]
              : []),
          ],
        },
        select: {
          id: true,
          solicitacaoId: true,
          status: true,
          asaasPaymentId: true,
          asaasCustomerId: true,
          externalReference: true,
          valor: true,
          vencimentoAsaas: true,
        },
      })
      if (cobrancaMatricula) {
        const resultado = await aplicarWebhookPagamentoMatricula(tx, cobrancaMatricula, webhook)
        if (!resultado.ok) {
          await tx.eventoWebhookAsaas.delete({ where: { asaasEventId: webhook.id } })
        }
        return resultado
      }

      const cobranca = await localizarCobrancaWebhook(tx, webhook.payment)
      if (cobranca) {
        await bloquearMensalidades(tx, [cobranca.mensalidadeId])
        const estadoAtual = await tx.cobrancaAsaas.findUnique({
          where: { id: cobranca.id },
          select: { ativa: true, status: true },
        })
        if (!estadoAtual) return { ok: true as const, duplicado: false }

        const divergencia = divergenciaPagamentoWebhook(cobranca, webhook.payment)
        if (divergencia) {
          const statusDivergente = ["RECEBIDA", "ESTORNADA"].includes(estadoAtual.status)
            ? estadoAtual.status
            : "ERRO"
          await tx.cobrancaAsaas.update({
            where: { id: cobranca.id },
            data: {
              status: statusDivergente,
              ultimoErro: divergencia,
              ultimoEventoAsaas: webhook.event,
            },
          })
          if (statusDivergente === estadoAtual.status) {
            await registrarLog(
              {
                autorId: null,
                acao: "PAGAMENTO",
                entidade: "CobrancaAsaas",
                entidadeId: cobranca.id,
                valorAntigo: { status: estadoAtual.status },
                valorNovo: { status: statusDivergente, evento: webhook.event, divergencia },
                justificativa: `Evento Asaas ${webhook.id} divergente, sem regredir estado terminal.`,
              },
              tx,
            )
          } else {
            await auditarEstadoCobranca(tx, {
              cobrancaId: cobranca.id,
              statusAntigo: estadoAtual.status,
              statusNovo: statusDivergente,
              webhook,
            })
          }
          await tx.eventoWebhookAsaas.delete({ where: { asaasEventId: webhook.id } })
          return { ok: false as const, duplicado: false, motivo: divergencia }
        }
        const statusAplicado = proximoStatusCobrancaAsaas(estadoAtual.status, statusPagamento)
        const outraRecebida =
          statusAplicado === "RECEBIDA"
            ? await tx.cobrancaAsaas.findFirst({
                where: {
                  mensalidadeId: cobranca.mensalidadeId,
                  id: { not: cobranca.id },
                  status: "RECEBIDA",
                },
                select: { id: true },
              })
            : null
        const outraAtiva = await tx.cobrancaAsaas.findFirst({
          where: {
            mensalidadeId: cobranca.mensalidadeId,
            id: { not: cobranca.id },
            ativa: true,
          },
          select: { id: true, status: true },
        })
        const mensalidadeQuitada =
          statusAplicado === "RECEBIDA"
            ? await tx.mensalidade.findUnique({
                where: { id: cobranca.mensalidadeId },
                select: { cobrancaQuitacaoAsaasId: true },
              })
            : null
        const estaEleitaComoQuitacao =
          statusAplicado === "RECEBIDA" &&
          (mensalidadeQuitada?.cobrancaQuitacaoAsaasId === cobranca.id ||
            (!mensalidadeQuitada?.cobrancaQuitacaoAsaasId && !outraRecebida))
        if (estaEleitaComoQuitacao && outraAtiva) {
          await tx.cobrancaAsaas.update({
            where: { id: outraAtiva.id },
            data: {
              ativa: false,
              ultimoErro: "Outra tentativa foi recebida; concilie a cobrança remota substituída.",
            },
          })
          const gestores = await tx.usuario.findMany({
            where: { papel: "GESTOR", ativo: true },
            select: { id: true },
          })
          if (gestores.length > 0) {
            await tx.notificacao.createMany({
              data: gestores.map((gestor) => ({
                usuarioId: gestor.id,
                tipo: "FINANCEIRO" as const,
                titulo: "Tentativa Asaas substituída após pagamento",
                mensagem: "Uma tentativa anterior foi paga; revise a cobrança remota mais recente.",
              })),
            })
          }
        }
        const ativa =
          statusAplicado === "RECEBIDA"
            ? estaEleitaComoQuitacao
            : !["CANCELADA", "ESTORNADA"].includes(statusAplicado) && !outraAtiva
        const recebidaEmAsaas =
          statusAplicado === "RECEBIDA"
            ? (interpretarDataAsaas(webhook.payment.paymentDate ?? webhook.dateCreated) ??
              new Date())
            : undefined
        await tx.cobrancaAsaas.update({
          where: { id: cobranca.id },
          data: {
            asaasPaymentId: webhook.payment.id,
            status: statusAplicado,
            ativa,
            recebidaEmAsaas,
            statusAsaas:
              webhook.event === "PAYMENT_DELETED" ? "DELETED" : (webhook.payment.status ?? null),
            ultimoEventoAsaas: webhook.event,
            ultimoErro: null,
          },
        })
        await auditarEstadoCobranca(tx, {
          cobrancaId: cobranca.id,
          statusAntigo: estadoAtual.status,
          statusNovo: statusAplicado,
          webhook,
        })
        contratoIdAfetado = cobranca.contratoPixAutomaticoId
        if (webhook.event === "PAYMENT_RECEIVED" || webhook.event === "PAYMENT_CONFIRMED") {
          await baixarMensalidadePeloAsaas(tx, cobranca, webhook)
        }
        if (webhook.event === "PAYMENT_REFUNDED") {
          await estornarMensalidadePeloAsaas(tx, cobranca, webhook)
          await cancelarContratoPorEstornoInicial(tx, cobranca, webhook)
        }
        if (webhook.event === "PAYMENT_PARTIALLY_REFUNDED") {
          await tx.cobrancaAsaas.update({
            where: { id: cobranca.id },
            data: {
              ativa: false,
              estornoParcialPendenteEm: new Date(),
              ultimoErro: "Estorno parcial recebido; conciliação manual necessária.",
            },
          })
          await conciliarEstornoParcialPeloAsaas(tx, cobranca, webhook)
        }
      } else {
        const clienteLocal = webhook.payment.customer
          ? await tx.clienteAsaas.findUnique({
              where: { asaasCustomerId: webhook.payment.customer },
              select: { id: true },
            })
          : null
        if (
          clienteLocal ||
          referenciaPagamentoEcvo(webhook.payment.externalReference) ||
          webhook.payment.pixAutomaticAuthorizationId
        ) {
          await tx.eventoWebhookAsaas.delete({ where: { asaasEventId: webhook.id } })
          return {
            ok: false as const,
            duplicado: false as const,
            motivo: "A cobrança ainda não foi vinculada à intenção local.",
          }
        }
      }
    }

    if (!webhook.payment && paymentInstructionId) {
      const cobranca = await tx.cobrancaAsaas.findUnique({
        where: { asaasPaymentId: paymentInstructionId },
        select: {
          id: true,
          contratoPixAutomaticoId: true,
          status: true,
          mensalidade: {
            select: {
              competencia: true,
              aluno: { select: { usuarioId: true } },
            },
          },
        },
      })
      const status = statusCobrancaPorInstrucao(webhook.event)
      if (cobranca && status) {
        const statusAplicado = proximoStatusCobrancaAsaas(cobranca.status, status)
        await tx.cobrancaAsaas.update({
          where: { id: cobranca.id },
          data: {
            status: statusAplicado,
            statusAsaas: webhook.paymentInstruction?.status ?? null,
            ultimoEventoAsaas: webhook.event,
          },
        })
        await auditarEstadoCobranca(tx, {
          cobrancaId: cobranca.id,
          statusAntigo: cobranca.status,
          statusNovo: statusAplicado,
          webhook,
        })
        if (statusAplicado === "RECUSADA" || statusAplicado === "CANCELADA") {
          await tx.notificacao.create({
            data: {
              usuarioId: cobranca.mensalidade.aluno.usuarioId,
              tipo: "FINANCEIRO",
              titulo: "Cobrança PIX requer atenção",
              mensagem: `${cobranca.mensalidade.competencia}: o débito automático não foi concluído. Acesse o financeiro para pagar via PIX.`,
            },
          })
        }
        contratoIdAfetado = cobranca.contratoPixAutomaticoId
      }
    }

    if (authorizationId) {
      const status = statusContratoPorEvento(webhook.event)
      if (status) {
        const contrato = await tx.contratoPixAutomatico.findUnique({
          where: { asaasAuthorizationId: authorizationId },
          include: {
            mensalidades: {
              where: { numeroCicloPix: 1 },
              include: {
                cobrancasAsaas: {
                  where: { tipo: "PIX_AUTOMATICO_INICIAL" },
                  orderBy: { geracao: "desc" },
                  take: 1,
                },
              },
            },
          },
        })
        if (contrato) {
          const statusAplicado = proximoStatusContratoPixAutomatico(contrato.status, status)
          await tx.contratoPixAutomatico.update({
            where: { id: contrato.id },
            data: { status: statusAplicado, ultimoErro: null },
          })
          if (statusAplicado !== contrato.status) {
            await registrarLog(
              {
                autorId: null,
                acao: "PAGAMENTO",
                entidade: "ContratoPixAutomatico",
                entidadeId: contrato.id,
                valorAntigo: { status: contrato.status },
                valorNovo: { status: statusAplicado, evento: webhook.event },
                justificativa: `Evento Asaas ${webhook.id}.`,
              },
              tx,
            )
          }
          contratoIdAfetado = contrato.id
          const primeira = contrato.mensalidades[0]
          const cobrancaInicial = primeira?.cobrancasAsaas[0]
          if (statusAplicado === "ATIVO" && cobrancaInicial) {
            const cobranca = {
              id: cobrancaInicial.id,
              mensalidadeId: primeira.id,
              externalReference: cobrancaInicial.externalReference,
            }
            const statusCobrancaAplicado = proximoStatusCobrancaAsaas(
              cobrancaInicial.status,
              "RECEBIDA",
            )
            await tx.cobrancaAsaas.update({
              where: { id: cobranca.id },
              data: {
                asaasPaymentId: webhook.payment?.id ?? undefined,
                status: statusCobrancaAplicado,
                ativa: true,
                recebidaEmAsaas:
                  interpretarDataAsaas(webhook.payment?.paymentDate ?? webhook.dateCreated) ??
                  new Date(),
                ultimoEventoAsaas: webhook.event,
              },
            })
            await auditarEstadoCobranca(tx, {
              cobrancaId: cobranca.id,
              statusAntigo: cobrancaInicial.status,
              statusNovo: statusCobrancaAplicado,
              webhook,
            })
            await baixarMensalidadePeloAsaas(tx, cobranca, webhook)
          }
          if (statusAplicado === "ATIVO") {
            await tx.aluno.update({
              where: { id: contrato.alunoId },
              data: { tipoCobrancaPix: "AUTOMATICO_SEMESTRAL" },
            })
          }
          if (["CANCELADO", "RECUSADO", "EXPIRADO"].includes(statusAplicado)) {
            await tx.aluno.update({
              where: { id: contrato.alunoId },
              data: { tipoCobrancaPix: "MENSAL" },
            })
            if (cobrancaInicial && cobrancaInicial.status !== "RECEBIDA") {
              const statusInicial = statusAplicado === "RECUSADO" ? "RECUSADA" : "CANCELADA"
              await tx.cobrancaAsaas.update({
                where: { id: cobrancaInicial.id },
                data: { ativa: false, status: statusInicial, ultimoEventoAsaas: webhook.event },
              })
              await auditarEstadoCobranca(tx, {
                cobrancaId: cobrancaInicial.id,
                statusAntigo: cobrancaInicial.status,
                statusNovo: statusInicial,
                webhook,
              })
            }
            await tx.cobrancaAsaas.updateMany({
              where: {
                contratoPixAutomaticoId: contrato.id,
                ...(cobrancaInicial ? { id: { not: cobrancaInicial.id } } : {}),
                status: { notIn: ["RECEBIDA", "ESTORNADA"] },
              },
              data: {
                ativa: false,
                status: "CANCELADA",
                pixCopiaECola: null,
                qrCodeExpiraEm: null,
                ultimoErro: null,
              },
            })
          }
        }
      }
    }

    if (contratoIdAfetado) {
      const competenciasRecebidas = await tx.cobrancaAsaas.groupBy({
        by: ["mensalidadeId"],
        where: { contratoPixAutomaticoId: contratoIdAfetado, status: "RECEBIDA" },
      })
      if (competenciasRecebidas.length === TOTAL_CICLOS_PIX_AUTOMATICO) {
        const anterior = await tx.contratoPixAutomatico.findUniqueOrThrow({
          where: { id: contratoIdAfetado },
          select: { status: true },
        })
        const contrato = await tx.contratoPixAutomatico.update({
          where: { id: contratoIdAfetado },
          data: { status: "CONCLUIDO" },
        })
        await tx.aluno.update({
          where: { id: contrato.alunoId },
          data: { tipoCobrancaPix: "MENSAL" },
        })
        if (anterior.status !== "CONCLUIDO") {
          await registrarLog(
            {
              autorId: null,
              acao: "PAGAMENTO",
              entidade: "ContratoPixAutomatico",
              entidadeId: contrato.id,
              valorAntigo: { status: anterior.status },
              valorNovo: { status: "CONCLUIDO", evento: webhook.event },
              justificativa: "Seis ciclos recebidos pelo Asaas.",
            },
            tx,
          )
        }
      } else if (
        webhook.event === "PAYMENT_REFUNDED" ||
        webhook.event === "PAYMENT_PARTIALLY_REFUNDED"
      ) {
        const alterado = await tx.contratoPixAutomatico.updateMany({
          where: { id: contratoIdAfetado, status: "CONCLUIDO" },
          data: { status: "ERRO", ultimoErro: "Pagamento do ciclo estornado no Asaas." },
        })
        if (alterado.count > 0) {
          await registrarLog(
            {
              autorId: null,
              acao: "PAGAMENTO",
              entidade: "ContratoPixAutomatico",
              entidadeId: contratoIdAfetado,
              valorAntigo: { status: "CONCLUIDO" },
              valorNovo: { status: "ERRO", evento: webhook.event },
              justificativa: "Estorno posterior à conclusão do ciclo.",
            },
            tx,
          )
        }
      }
    }

    return { ok: true as const, duplicado: false }
  })
}

async function cancelarAutorizacaoRemotaSeEstornoInicial(remota: CobrancaRemotaAsaas) {
  if (remota.status !== "REFUNDED") return

  const select = {
    mensalidade: { select: { vencimento: true } },
    contratoPixAutomatico: {
      select: {
        id: true,
        asaasAuthorizationId: true,
        asaasConciliationId: true,
        aluno: { select: { clienteAsaas: { select: { asaasCustomerId: true } } } },
      },
    },
  } satisfies Prisma.CobrancaAsaasSelect
  let cobranca = await db.cobrancaAsaas.findFirst({
    where: {
      tipo: "PIX_AUTOMATICO_INICIAL",
      OR: [
        { asaasPaymentId: remota.id },
        ...(remota.externalReference ? [{ externalReference: remota.externalReference }] : []),
      ],
    },
    select,
  })
  if (!cobranca && remota.conciliationIdentifier) {
    const candidata = await db.cobrancaAsaas.findFirst({
      where: {
        tipo: "PIX_AUTOMATICO_INICIAL",
        asaasPaymentId: null,
        contratoPixAutomatico: {
          asaasConciliationId: remota.conciliationIdentifier,
        },
      },
      select,
    })
    cobranca = candidata
  }
  const contrato = cobranca?.contratoPixAutomatico
  const authorizationId = contrato?.asaasAuthorizationId
  const customerId = contrato?.aluno.clienteAsaas?.asaasCustomerId
  if (!contrato || !authorizationId || !customerId) return
  if (
    remota.conciliationIdentifier &&
    remota.conciliationIdentifier !== contrato.asaasConciliationId
  ) {
    throw new Error("O pagamento inicial estornado diverge da conciliação local.")
  }
  if (remota.customer !== customerId) {
    throw new Error("O pagamento inicial estornado diverge do cliente local.")
  }
  if (
    remota.pixAutomaticAuthorizationId &&
    remota.pixAutomaticAuthorizationId !== authorizationId
  ) {
    throw new Error("O pagamento inicial estornado diverge da autorização local.")
  }

  const autorizacao = await obterAutorizacaoPixAutomaticoAsaas(authorizationId)
  if (
    autorizacao.customerId !== customerId ||
    autorizacao.contractId !== `ecvo-${contrato.id}`.slice(0, 35)
  ) {
    throw new Error("A autorização a cancelar diverge do contrato local.")
  }
  if (autorizacao.status === "ACTIVE") {
    await cancelarAutorizacaoPixAutomaticoAsaas(authorizationId)
  }
}

export async function processarWebhookAsaas(webhook: WebhookAsaas) {
  if (webhook.event === "PAYMENT_DELETED" && webhook.payment) {
    // Depois da exclusão, o recurso remoto pode não estar mais consultável. O evento autenticado
    // ainda é validado por ID, cliente, referência, valor, vencimento e meio de pagamento locais.
    return aplicarWebhookAsaas(webhook)
  }

  if (webhook.payment && statusCobrancaPorEvento(webhook.event)) {
    const remota = await obterCobrancaAsaas(webhook.payment.id)
    const eventoAtual = eventoPagamentoParaStatusAsaas(remota.status)
    if (!eventoAtual) {
      throw new Error("A cobrança consultada no Asaas não está em um estado conciliável.")
    }
    await cancelarAutorizacaoRemotaSeEstornoInicial(remota)
    return aplicarWebhookAsaas({
      ...webhook,
      event: eventoAtual,
      payment: {
        id: remota.id,
        customer: remota.customer,
        billingType: remota.billingType,
        externalReference: remota.externalReference,
        status: remota.status,
        value: remota.value,
        refundedValue: remota.refundedValue,
        dueDate: remota.dueDate,
        paymentDate: remota.paymentDate,
        conciliationIdentifier: remota.conciliationIdentifier,
        pixAutomaticAuthorizationId: remota.pixAutomaticAuthorizationId,
      },
    })
  }

  const authorizationId = idAutorizacaoDoWebhook(webhook)
  if (authorizationId && statusContratoPorEvento(webhook.event)) {
    const contrato = await db.contratoPixAutomatico.findUnique({
      where: { asaasAuthorizationId: authorizationId },
      include: { aluno: { include: { clienteAsaas: true } } },
    })
    if (!contrato) {
      const remota = await obterAutorizacaoPixAutomaticoAsaas(authorizationId)
      if (!remota.contractId.startsWith("ecvo-")) return aplicarWebhookAsaas(webhook)
      return {
        ok: false as const,
        duplicado: false as const,
        motivo: "A autorização ainda não foi vinculada ao contrato local.",
      }
    }

    const remota = await obterAutorizacaoPixAutomaticoAsaas(authorizationId)
    const customerId = contrato.aluno.clienteAsaas?.asaasCustomerId
    if (
      !customerId ||
      remota.customerId !== customerId ||
      remota.contractId !== `ecvo-${contrato.id}`.slice(0, 35) ||
      remota.frequency !== "MONTHLY" ||
      remota.paymentCreationMode !== "MANUAL" ||
      remota.retryPolicy !== "NOT_ALLOWED" ||
      Number(remota.value) !== Number(contrato.valor) ||
      remota.startDate !== dataAsaas(contrato.inicio) ||
      remota.finishDate !== dataAsaas(contrato.fim)
    ) {
      throw new Error("A autorização consultada no Asaas diverge do contrato local.")
    }
    return aplicarWebhookAsaas({
      ...webhook,
      event: EVENTO_AUTORIZACAO_POR_STATUS[remota.status],
      authorization: { id: remota.id },
    })
  }

  const paymentInstructionId = idPagamentoInstrucaoDoWebhook(webhook)
  if (paymentInstructionId && statusCobrancaPorInstrucao(webhook.event)) {
    const cobranca = await db.cobrancaAsaas.findUnique({
      where: { asaasPaymentId: paymentInstructionId },
      select: { id: true },
    })
    if (!cobranca) {
      const authorizationId = idAutorizacaoDoWebhook(webhook)
      const contrato = authorizationId
        ? await db.contratoPixAutomatico.findUnique({
            where: { asaasAuthorizationId: authorizationId },
            select: { id: true },
          })
        : null
      const remota =
        authorizationId && !contrato
          ? await obterAutorizacaoPixAutomaticoAsaas(authorizationId)
          : null
      if (!contrato && !remota?.contractId.startsWith("ecvo-")) {
        return aplicarWebhookAsaas(webhook)
      }
      return {
        ok: false as const,
        duplicado: false as const,
        motivo: "A instrução ainda não foi vinculada à cobrança local.",
      }
    }
  }

  return aplicarWebhookAsaas(webhook)
}

function statusContratoPorEvento(evento: string): StatusContratoPixAutomatico | null {
  const mapa: Record<string, StatusContratoPixAutomatico> = {
    PIX_AUTOMATIC_RECURRING_AUTHORIZATION_CREATED: "PENDENTE_AUTORIZACAO",
    PIX_AUTOMATIC_RECURRING_AUTHORIZATION_ACTIVATED: "ATIVO",
    PIX_AUTOMATIC_RECURRING_AUTHORIZATION_CANCELLED: "CANCELADO",
    PIX_AUTOMATIC_RECURRING_AUTHORIZATION_REFUSED: "RECUSADO",
    PIX_AUTOMATIC_RECURRING_AUTHORIZATION_EXPIRED: "EXPIRADO",
  }
  return mapa[evento] ?? null
}

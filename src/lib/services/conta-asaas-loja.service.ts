import "server-only"
import { Prisma, type StatusContaAsaasLoja } from "@prisma/client"
import { criarSubcontaAsaas, listarSubcontasAsaas, type SubcontaAsaas } from "@/lib/asaas/client"
import { mensagemErroAsaasSegura } from "@/lib/asaas/seguranca"
import { db } from "@/lib/db"
import { registrarLog } from "@/lib/services/auditoria.service"
import { formatarDataCivilInput } from "@/lib/utils/datas"
import type { ContaAsaasLojaInput } from "@/lib/validations/conta-asaas-loja"

const CONTA_LOJA_ID = "principal"
const VERSAO_CONSENTIMENTO = "2026-09-09"
const TEMPO_RESERVA_MS = 2 * 60 * 1_000
const EVENTOS_STATUS_CONTA_ASAAS = [
  "ACCOUNT_STATUS_DOCUMENT_PENDING",
  "ACCOUNT_STATUS_DOCUMENT_AWAITING_APPROVAL",
  "ACCOUNT_STATUS_DOCUMENT_APPROVED",
  "ACCOUNT_STATUS_DOCUMENT_REJECTED",
  "ACCOUNT_STATUS_GENERAL_APPROVAL_PENDING",
  "ACCOUNT_STATUS_GENERAL_APPROVAL_AWAITING_APPROVAL",
  "ACCOUNT_STATUS_GENERAL_APPROVAL_APPROVED",
  "ACCOUNT_STATUS_GENERAL_APPROVAL_REJECTED",
  "ACCOUNT_STATUS_COMMERCIAL_INFO_EXPIRING_SOON",
  "ACCOUNT_STATUS_COMMERCIAL_INFO_EXPIRED",
]

type DependenciasContaAsaasLoja = {
  criarSubconta?: typeof criarSubcontaAsaas
  listarSubcontas?: typeof listarSubcontasAsaas
  agora?: () => Date
}

function somenteDigitos(valor?: string | null) {
  return valor?.replace(/\D/g, "") ?? ""
}

function textoComparavel(valor?: string | null) {
  return valor?.trim().toLocaleLowerCase("pt-BR").replace(/\s+/g, " ") ?? ""
}

function emailDaSubconta(conta: SubcontaAsaas) {
  return textoComparavel(conta.loginEmail || conta.email)
}

function contaCompativel(conta: SubcontaAsaas, dados: ContaAsaasLojaInput) {
  if (somenteDigitos(conta.cpfCnpj) !== dados.cpfCnpj) return false
  if (emailDaSubconta(conta) !== textoComparavel(dados.emailContaAsaas)) return false
  if (conta.name && textoComparavel(conta.name) !== textoComparavel(dados.nomeTitular)) return false
  if (conta.mobilePhone && somenteDigitos(conta.mobilePhone) !== dados.celular) return false
  return true
}

function idsRemotosValidos(conta: SubcontaAsaas) {
  return Boolean(conta.id?.trim() && conta.walletId?.trim())
}

function reservaRecente(atualizadoEm: Date, agora: Date) {
  return agora.getTime() - atualizadoEm.getTime() < TEMPO_RESERVA_MS
}

function erroPrismaUnicidade(erro: unknown) {
  return typeof erro === "object" && erro !== null && "code" in erro && erro.code === "P2002"
}

function erroComResultadoIndeterminado(erro: unknown) {
  if (!erro || typeof erro !== "object") return false
  const nome = Reflect.get(erro, "name")
  return nome === "ErroComunicacaoAsaas" || nome === "ErroRespostaAsaas"
}

function dadosPersistidos(dados: ContaAsaasLojaInput, agora: Date) {
  return {
    nomeTitular: dados.nomeTitular,
    emailContaAsaas: dados.emailContaAsaas,
    cpfCnpj: dados.cpfCnpj,
    dataNascimento: dados.dataNascimento,
    celular: dados.celular,
    rendaMensal: new Prisma.Decimal(dados.rendaMensal),
    logradouro: dados.logradouro,
    numeroEndereco: dados.numeroEndereco,
    complemento: dados.complemento,
    bairro: dados.bairro,
    cep: dados.cep,
    status: "CRIANDO" as const,
    consentimentoVersao: VERSAO_CONSENTIMENTO,
    consentidoEm: agora,
    ultimoErro: null,
  }
}

function webhookStatusConta(dados: ContaAsaasLojaInput) {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/$/, "")
  const authToken =
    process.env.ASAAS_WEBHOOK_TOKEN_SUBCONTAS?.trim() ?? process.env.ASAAS_WEBHOOK_TOKEN?.trim()
  if (
    !baseUrl?.startsWith("https://") ||
    !authToken ||
    authToken.length < 32 ||
    authToken.length > 255
  ) {
    return undefined
  }
  return [
    {
      name: "Situação cadastral da conta da loja",
      url: `${baseUrl}/api/webhooks/asaas`,
      email: dados.emailContaAsaas,
      enabled: true,
      interrupted: false,
      apiVersion: 3,
      authToken,
      sendType: "SEQUENTIALLY" as const,
      events: EVENTOS_STATUS_CONTA_ASAAS,
    },
  ]
}

async function localizarSubcontaExistente(
  dados: ContaAsaasLojaInput,
  listarSubcontas: typeof listarSubcontasAsaas,
) {
  const porCpf = await listarSubcontas({ cpfCnpj: dados.cpfCnpj, limit: 100 })
  const mesmoCpf = porCpf.data.filter((conta) => somenteDigitos(conta.cpfCnpj) === dados.cpfCnpj)
  const compativeis = mesmoCpf.filter((conta) => contaCompativel(conta, dados))

  if (compativeis.length > 1) {
    throw new Error("Mais de uma subconta Asaas corresponde aos dados informados.")
  }
  if (compativeis.length === 1) return compativeis[0]
  if (mesmoCpf.length > 0) {
    throw new Error("Já existe uma subconta vinculada à ECVO com este CPF e dados diferentes.")
  }

  const porEmail = await listarSubcontas({ email: dados.emailContaAsaas, limit: 100 })
  const mesmoEmail = porEmail.data.filter(
    (conta) => emailDaSubconta(conta) === textoComparavel(dados.emailContaAsaas),
  )
  if (mesmoEmail.length > 0) {
    throw new Error("Já existe uma subconta vinculada à ECVO com este e-mail e outro CPF.")
  }
  return null
}

async function reservarSolicitacao(params: {
  autorId: string
  dados: ContaAsaasLojaInput
  agora: Date
}) {
  const base = dadosPersistidos(params.dados, params.agora)
  const atual = await db.contaAsaasLoja.findUnique({ where: { id: CONTA_LOJA_ID } })

  if (atual?.asaasAccountId && atual.walletId) {
    return { ok: true as const, concluida: true as const, conta: atual }
  }
  if (atual?.status === "CRIANDO" && reservaRecente(atual.atualizadoEm, params.agora)) {
    return { ok: false as const, motivo: "A solicitação já está sendo processada." }
  }
  if (atual?.status === "CRIANDO") {
    const interrompida = await db.contaAsaasLoja.updateMany({
      where: { id: atual.id, status: "CRIANDO", atualizadoEm: atual.atualizadoEm },
      data: {
        status: "RESULTADO_INDETERMINADO",
        ultimoErro: "A solicitação anterior foi interrompida e precisa ser conciliada.",
      },
    })
    if (interrompida.count === 0) {
      return { ok: false as const, motivo: "A solicitação já está sendo processada." }
    }
    return {
      ok: false as const,
      motivo:
        "A criação pode ter ocorrido no Asaas e precisa ser conciliada antes de uma nova tentativa.",
    }
  }
  if (
    atual &&
    [
      "RESULTADO_INDETERMINADO",
      "AGUARDANDO_ATIVACAO",
      "AGUARDANDO_APROVACAO",
      "HABILITADA",
    ].includes(atual.status)
  ) {
    return { ok: false as const, motivo: "A conta Asaas da loja já foi solicitada." }
  }

  try {
    const conta = await db.$transaction(async (tx) => {
      let reservada: NonNullable<typeof atual> | null = null
      if (atual) {
        const retomada = await tx.contaAsaasLoja.updateMany({
          where: { id: atual.id, status: atual.status, atualizadoEm: atual.atualizadoEm },
          data: base,
        })
        if (retomada.count === 0) return null
        reservada = { ...atual, ...base, atualizadoEm: params.agora }
      } else {
        reservada = await tx.contaAsaasLoja.create({
          data: { id: CONTA_LOJA_ID, ...base },
        })
      }
      await registrarLog(
        {
          autorId: params.autorId,
          acao: "CONTA_ASAAS_LOJA_SOLICITADA",
          entidade: "ContaAsaasLoja",
          entidadeId: reservada.id,
          valorNovo: { status: reservada.status, consentimentoVersao: VERSAO_CONSENTIMENTO },
        },
        tx,
      )
      return reservada
    })
    if (!conta) {
      return { ok: false as const, motivo: "A solicitação já está sendo processada." }
    }
    return { ok: true as const, concluida: false as const, conta }
  } catch (erro) {
    if (!erroPrismaUnicidade(erro)) throw erro
    return {
      ok: false as const,
      motivo: "Já existe uma solicitação com o e-mail informado. Atualize a página e confira.",
    }
  }
}

export function obterContaAsaasLoja() {
  return db.contaAsaasLoja.findUnique({ where: { id: CONTA_LOJA_ID } })
}

export async function solicitarCriacaoContaAsaasLoja(
  params: { autorId: string; dados: ContaAsaasLojaInput },
  dependencias: DependenciasContaAsaasLoja = {},
) {
  const autor = await db.usuario.findUnique({
    where: { id: params.autorId },
    select: { ativo: true, papel: true },
  })
  if (!autor?.ativo || !["LOJA", "GESTOR"].includes(autor.papel)) {
    return { ok: false as const, motivo: "Usuário não autorizado para configurar a loja." }
  }

  const agora = dependencias.agora?.() ?? new Date()
  let reserva: Awaited<ReturnType<typeof reservarSolicitacao>>
  try {
    reserva = await reservarSolicitacao({ ...params, agora })
  } catch (erro) {
    return { ok: false as const, motivo: mensagemErroAsaasSegura(erro) }
  }
  if (!reserva.ok) return reserva
  if (reserva.concluida) return { ok: true as const, conta: reserva.conta }

  const listarSubcontas = dependencias.listarSubcontas ?? listarSubcontasAsaas
  const criarSubconta = dependencias.criarSubconta ?? criarSubcontaAsaas

  try {
    const existente = await localizarSubcontaExistente(params.dados, listarSubcontas)
    const remota =
      existente ??
      (await criarSubconta({
        name: params.dados.nomeTitular,
        email: params.dados.emailContaAsaas,
        loginEmail: params.dados.emailContaAsaas,
        cpfCnpj: params.dados.cpfCnpj,
        birthDate: formatarDataCivilInput(params.dados.dataNascimento),
        mobilePhone: params.dados.celular,
        incomeValue: params.dados.rendaMensal,
        address: params.dados.logradouro,
        addressNumber: params.dados.numeroEndereco,
        ...(params.dados.complemento ? { complement: params.dados.complemento } : {}),
        province: params.dados.bairro,
        postalCode: params.dados.cep,
        webhooks: webhookStatusConta(params.dados),
      }))

    if (!idsRemotosValidos(remota)) {
      const erro = new Error("O Asaas criou uma resposta sem accountId ou walletId.")
      erro.name = "ErroRespostaAsaas"
      throw erro
    }

    const conta = await db.$transaction(async (tx) => {
      const atualizada = await tx.contaAsaasLoja.update({
        where: { id: reserva.conta.id },
        data: {
          asaasAccountId: remota.id,
          walletId: remota.walletId,
          status: "AGUARDANDO_ATIVACAO",
          solicitadoEm: agora,
          ultimoErro: null,
        },
      })
      await registrarLog(
        {
          autorId: params.autorId,
          acao: "CONTA_ASAAS_LOJA_SOLICITADA",
          entidade: "ContaAsaasLoja",
          entidadeId: atualizada.id,
          valorAntigo: { status: "CRIANDO" },
          valorNovo: {
            status: atualizada.status,
            contaAsaasRegistrada: true,
            walletRegistrada: true,
          },
        },
        tx,
      )
      return atualizada
    })

    // A chave retornada uma única vez pelo provedor não é persistida nem exposta.
    return { ok: true as const, conta }
  } catch (erro) {
    const ultimoErro = mensagemErroAsaasSegura(erro)
    const status: StatusContaAsaasLoja = erroComResultadoIndeterminado(erro)
      ? "RESULTADO_INDETERMINADO"
      : "ERRO"
    await db.$transaction(async (tx) => {
      await tx.contaAsaasLoja.update({
        where: { id: reserva.conta.id },
        data: { status, ultimoErro },
      })
      await registrarLog(
        {
          autorId: params.autorId,
          acao: "CONTA_ASAAS_LOJA_SOLICITADA",
          entidade: "ContaAsaasLoja",
          entidadeId: reserva.conta.id,
          valorAntigo: { status: "CRIANDO" },
          valorNovo: { status, erroRegistrado: true },
        },
        tx,
      )
    })
    return {
      ok: false as const,
      motivo: ultimoErro,
      resultadoIndeterminado: status === "RESULTADO_INDETERMINADO",
    }
  }
}

export async function confirmarAprovacaoContaAsaasLoja(params: { autorId: string }) {
  return db.$transaction(async (tx) => {
    const autor = await tx.usuario.findUnique({
      where: { id: params.autorId },
      select: { ativo: true, papel: true },
    })
    if (!autor?.ativo || autor.papel !== "GESTOR") {
      return { ok: false as const, motivo: "Somente um gestor pode confirmar esta aprovação." }
    }
    const conta = await tx.contaAsaasLoja.findUnique({ where: { id: CONTA_LOJA_ID } })
    if (!conta?.asaasAccountId || !conta.walletId) {
      return { ok: false as const, motivo: "A conta ainda não possui accountId e walletId." }
    }
    if (conta.status === "HABILITADA") return { ok: true as const, conta }
    if (!["AGUARDANDO_ATIVACAO", "AGUARDANDO_APROVACAO"].includes(conta.status)) {
      return { ok: false as const, motivo: "O estado atual não permite habilitar o split." }
    }
    const atualizada = await tx.contaAsaasLoja.update({
      where: { id: conta.id },
      data: { status: "HABILITADA", statusGeralAsaas: "APPROVED", ultimoErro: null },
    })
    await registrarLog(
      {
        autorId: params.autorId,
        acao: "CONFIGURACAO",
        entidade: "ContaAsaasLoja",
        entidadeId: conta.id,
        valorAntigo: { status: conta.status },
        valorNovo: { status: atualizada.status, confirmacaoManualAprovacaoAsaas: true },
        justificativa: "Aprovação cadastral confirmada pelo gestor no painel do Asaas.",
      },
      tx,
    )
    return { ok: true as const, conta: atualizada }
  })
}

export async function aplicarStatusContaAsaasLojaDoWebhook(
  tx: Prisma.TransactionClient,
  params: { accountId: string; general: string; evento: string },
) {
  const conta = await tx.contaAsaasLoja.findUnique({
    where: { asaasAccountId: params.accountId },
  })
  if (!conta) return false
  const status: StatusContaAsaasLoja =
    params.general === "APPROVED"
      ? "HABILITADA"
      : params.general === "AWAITING_APPROVAL"
        ? "AGUARDANDO_APROVACAO"
        : params.general === "REJECTED"
          ? "BLOQUEADA"
          : "AGUARDANDO_ATIVACAO"
  await tx.contaAsaasLoja.update({
    where: { id: conta.id },
    data: {
      status,
      statusGeralAsaas: params.general,
      ultimoEventoAsaas: params.evento,
    },
  })
  if (conta.status !== status || conta.statusGeralAsaas !== params.general) {
    await registrarLog(
      {
        autorId: null,
        acao: "CONFIGURACAO",
        entidade: "ContaAsaasLoja",
        entidadeId: conta.id,
        valorAntigo: { status: conta.status, statusGeralAsaas: conta.statusGeralAsaas },
        valorNovo: { status, statusGeralAsaas: params.general, evento: params.evento },
      },
      tx,
    )
  }
  return true
}

import "server-only"
import { Prisma, type StatusContaAsaasProfessor } from "@prisma/client"
import { criarSubcontaAsaas, listarSubcontasAsaas, type SubcontaAsaas } from "@/lib/asaas/client"
import { mensagemErroAsaasSegura } from "@/lib/asaas/seguranca"
import { db } from "@/lib/db"
import { registrarLog } from "@/lib/services/auditoria.service"
import { formatarDataCivilInput } from "@/lib/utils/datas"
import type { ContaAsaasProfessorInput } from "@/lib/validations/conta-asaas-professor"

const VERSAO_CONSENTIMENTO = "2026-09-09"
const TEMPO_RESERVA_MS = 2 * 60 * 1_000

type DependenciasContaAsaasProfessor = {
  criarSubconta?: typeof criarSubcontaAsaas
  listarSubcontas?: typeof listarSubcontasAsaas
  agora?: () => Date
}

function erroPrismaUnicidade(erro: unknown) {
  return typeof erro === "object" && erro !== null && "code" in erro && erro.code === "P2002"
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

function contaCompativel(conta: SubcontaAsaas, dados: ContaAsaasProfessorInput) {
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

function statusJaSolicitado(status: StatusContaAsaasProfessor) {
  return [
    "AGUARDANDO_ATIVACAO",
    "AGUARDANDO_APROVACAO",
    "HABILITADA",
    "BLOQUEADA",
    "DESABILITADA",
    "RESULTADO_INDETERMINADO",
  ].includes(status)
}

function dadosPersistidos(dados: ContaAsaasProfessorInput, agora: Date) {
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

async function reservarSolicitacao(params: {
  professorId: string
  autorId: string
  dados: ContaAsaasProfessorInput
  agora: Date
}) {
  const base = dadosPersistidos(params.dados, params.agora)
  const atual = await db.contaAsaasProfessor.findUnique({
    where: { professorId: params.professorId },
  })

  if (atual) {
    if (atual.asaasAccountId && atual.walletId) {
      return { ok: true as const, concluida: true as const, conta: atual }
    }
    if (statusJaSolicitado(atual.status)) {
      return {
        ok: false as const,
        motivo:
          atual.status === "RESULTADO_INDETERMINADO"
            ? "A criação pode ter ocorrido no Asaas e precisa ser conciliada pela gestão antes de uma nova tentativa."
            : "A conta Asaas já foi solicitada.",
      }
    }
    if (atual.status === "CRIANDO") {
      if (reservaRecente(atual.atualizadoEm, params.agora)) {
        return { ok: false as const, motivo: "A solicitação já está sendo processada." }
      }
      await db.contaAsaasProfessor.updateMany({
        where: { id: atual.id, atualizadoEm: atual.atualizadoEm, status: "CRIANDO" },
        data: {
          status: "RESULTADO_INDETERMINADO",
          ultimoErro: "A solicitação anterior foi interrompida e precisa ser conciliada.",
        },
      })
      return {
        ok: false as const,
        motivo:
          "A criação pode ter ocorrido no Asaas e precisa ser conciliada pela gestão antes de uma nova tentativa.",
      }
    }

    const retomada = await db.contaAsaasProfessor.updateMany({
      where: { id: atual.id, atualizadoEm: atual.atualizadoEm, status: atual.status },
      data: base,
    })
    if (retomada.count === 0) {
      return { ok: false as const, motivo: "A solicitação já está sendo processada." }
    }
    return {
      ok: true as const,
      concluida: false as const,
      conta: { ...atual, ...base, professorId: params.professorId, atualizadoEm: params.agora },
    }
  }

  try {
    const conta = await db.$transaction(async (tx) => {
      const criada = await tx.contaAsaasProfessor.create({
        data: { ...base, professorId: params.professorId },
      })
      await registrarLog(
        {
          autorId: params.autorId,
          acao: "CONTA_ASAAS_PROFESSOR_SOLICITADA",
          entidade: "ContaAsaasProfessor",
          entidadeId: criada.id,
          valorNovo: { status: criada.status, consentimentoVersao: VERSAO_CONSENTIMENTO },
        },
        tx,
      )
      return criada
    })
    return { ok: true as const, concluida: false as const, conta }
  } catch (erro) {
    if (!erroPrismaUnicidade(erro)) throw erro
    return {
      ok: false as const,
      motivo:
        "Já existe uma solicitação para este professor ou para o e-mail informado. Atualize a página antes de tentar novamente.",
    }
  }
}

async function localizarSubcontaExistente(
  dados: ContaAsaasProfessorInput,
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

function erroComResultadoIndeterminado(erro: unknown) {
  if (!erro || typeof erro !== "object") return false
  const nome = Reflect.get(erro, "name")
  return nome === "ErroComunicacaoAsaas" || nome === "ErroRespostaAsaas"
}

export async function solicitarCriacaoContaAsaasProfessor(
  params: {
    professorId: string
    autorId: string
    dados: ContaAsaasProfessorInput
  },
  dependencias: DependenciasContaAsaasProfessor = {},
) {
  const agora = dependencias.agora?.() ?? new Date()
  const professor = await db.professor.findUnique({
    where: { id: params.professorId },
    select: { ativo: true, usuario: { select: { ativo: true } } },
  })
  if (!professor?.ativo || !professor.usuario.ativo) {
    return { ok: false as const, motivo: "Somente professores ativos podem solicitar a conta." }
  }

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
      }))

    if (!idsRemotosValidos(remota)) {
      const erro = new Error("O Asaas criou uma resposta sem accountId ou walletId.")
      erro.name = "ErroRespostaAsaas"
      throw erro
    }

    const conta = await db.$transaction(async (tx) => {
      const atualizada = await tx.contaAsaasProfessor.update({
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
          acao: "CONTA_ASAAS_PROFESSOR_SOLICITADA",
          entidade: "ContaAsaasProfessor",
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

    // No fluxo não-BaaS a ECVO precisa apenas da wallet para o split. A chave de API
    // devolvida uma única vez pelo provedor não é persistida nem exposta pelo sistema.
    return { ok: true as const, conta }
  } catch (erro) {
    const ultimoErro = mensagemErroAsaasSegura(erro)
    const status: StatusContaAsaasProfessor = erroComResultadoIndeterminado(erro)
      ? "RESULTADO_INDETERMINADO"
      : "ERRO"
    await db.$transaction(async (tx) => {
      await tx.contaAsaasProfessor.update({
        where: { id: reserva.conta.id },
        data: { status, ultimoErro },
      })
      await registrarLog(
        {
          autorId: params.autorId,
          acao: "CONTA_ASAAS_PROFESSOR_SOLICITADA",
          entidade: "ContaAsaasProfessor",
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

export function obterContaAsaasProfessor(professorId: string) {
  return db.contaAsaasProfessor.findUnique({ where: { professorId } })
}

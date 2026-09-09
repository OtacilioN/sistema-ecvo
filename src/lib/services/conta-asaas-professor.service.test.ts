import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => {
  const tx = {
    contaAsaasProfessor: { create: vi.fn(), update: vi.fn() },
  }
  const db = {
    professor: { findUnique: vi.fn() },
    contaAsaasProfessor: { findUnique: vi.fn(), updateMany: vi.fn() },
    $transaction: vi.fn(async (callback: (cliente: typeof tx) => unknown) => callback(tx)),
  }
  return { db, tx, registrarLog: vi.fn() }
})

vi.mock("@/lib/db", () => ({ db: mocks.db }))
vi.mock("@/lib/services/auditoria.service", () => ({ registrarLog: mocks.registrarLog }))

import { contaAsaasProfessorSchema } from "@/lib/validations/conta-asaas-professor"
import { solicitarCriacaoContaAsaasProfessor } from "./conta-asaas-professor.service"

const agora = new Date("2026-09-09T12:00:00.000Z")
const dados = contaAsaasProfessorSchema.parse({
  nomeTitular: "Marcus Vinicius de Oliveira Ferreira",
  emailContaAsaas: "treinador@exemplo.com",
  cpfCnpj: "13353529705",
  dataNascimento: "1991-01-29",
  celular: "21981523409",
  rendaMensal: "3000",
  logradouro: "Rua Poeta Antônio Pereira Sobrinho",
  numeroEndereco: "150",
  complemento: "Ap 102F",
  bairro: "Gramame",
  cep: "58068448",
  consentimento: "on",
})

const reserva = {
  id: "conta-local-1",
  professorId: "professor-1",
  ...dados,
  complemento: dados.complemento,
  rendaMensal: 3000,
  status: "CRIANDO",
  asaasAccountId: null,
  walletId: null,
  consentimentoVersao: "2026-09-09",
  consentidoEm: agora,
  solicitadoEm: null,
  ultimoErro: null,
  criadoEm: agora,
  atualizadoEm: agora,
}

function lista(data: unknown[] = []) {
  return {
    object: "list" as const,
    hasMore: false,
    totalCount: data.length,
    limit: 100,
    offset: 0,
    data,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.db.professor.findUnique.mockResolvedValue({ ativo: true, usuario: { ativo: true } })
  mocks.db.contaAsaasProfessor.findUnique.mockResolvedValue(null)
  mocks.tx.contaAsaasProfessor.create.mockResolvedValue(reserva)
  mocks.tx.contaAsaasProfessor.update.mockImplementation(({ data }) => ({ ...reserva, ...data }))
})

describe("solicitarCriacaoContaAsaasProfessor", () => {
  it("reserva, consulta duplicidade e registra accountId e wallet sem persistir a API key", async () => {
    const listarSubcontas = vi.fn().mockResolvedValue(lista())
    const criarSubconta = vi.fn().mockResolvedValue({
      object: "account",
      id: "acc_1",
      walletId: "wal_1",
      accessToken: { id: "tok_1", apiKey: "$aact_hmlg_segredo-subconta" },
    })

    const resultado = await solicitarCriacaoContaAsaasProfessor(
      { professorId: "professor-1", autorId: "usuario-1", dados },
      { agora: () => agora, listarSubcontas, criarSubconta },
    )

    expect(resultado).toMatchObject({ ok: true })
    expect(listarSubcontas).toHaveBeenNthCalledWith(1, {
      cpfCnpj: "13353529705",
      limit: 100,
    })
    expect(listarSubcontas).toHaveBeenNthCalledWith(2, {
      email: "treinador@exemplo.com",
      limit: 100,
    })
    expect(criarSubconta).toHaveBeenCalledOnce()
    expect(mocks.tx.contaAsaasProfessor.update).toHaveBeenLastCalledWith({
      where: { id: "conta-local-1" },
      data: expect.objectContaining({
        asaasAccountId: "acc_1",
        walletId: "wal_1",
        status: "AGUARDANDO_ATIVACAO",
      }),
    })
    expect(JSON.stringify(mocks.tx.contaAsaasProfessor.update.mock.calls)).not.toContain(
      "$aact_hmlg_segredo-subconta",
    )
    expect(JSON.stringify(mocks.registrarLog.mock.calls)).not.toContain(
      "$aact_hmlg_segredo-subconta",
    )
  })

  it("reaproveita uma subconta remota compatível em vez de executar outro POST", async () => {
    const listarSubcontas = vi.fn().mockResolvedValue(
      lista([
        {
          id: "acc_existente",
          walletId: "wal_existente",
          name: dados.nomeTitular,
          loginEmail: dados.emailContaAsaas,
          cpfCnpj: dados.cpfCnpj,
          mobilePhone: dados.celular,
        },
      ]),
    )
    const criarSubconta = vi.fn()

    const resultado = await solicitarCriacaoContaAsaasProfessor(
      { professorId: "professor-1", autorId: "usuario-1", dados },
      { agora: () => agora, listarSubcontas, criarSubconta },
    )

    expect(resultado).toMatchObject({ ok: true })
    expect(criarSubconta).not.toHaveBeenCalled()
    expect(mocks.tx.contaAsaasProfessor.update).toHaveBeenLastCalledWith({
      where: { id: "conta-local-1" },
      data: expect.objectContaining({
        asaasAccountId: "acc_existente",
        walletId: "wal_existente",
      }),
    })
  })

  it("não faz nova chamada enquanto outra solicitação local está em andamento", async () => {
    mocks.db.contaAsaasProfessor.findUnique.mockResolvedValue({
      ...reserva,
      atualizadoEm: agora,
    })
    const listarSubcontas = vi.fn()
    const criarSubconta = vi.fn()

    const resultado = await solicitarCriacaoContaAsaasProfessor(
      { professorId: "professor-1", autorId: "usuario-1", dados },
      { agora: () => agora, listarSubcontas, criarSubconta },
    )

    expect(resultado).toEqual({ ok: false, motivo: "A solicitação já está sendo processada." })
    expect(listarSubcontas).not.toHaveBeenCalled()
    expect(criarSubconta).not.toHaveBeenCalled()
  })

  it("converte um rascunho em solicitação somente após o consentimento", async () => {
    mocks.db.contaAsaasProfessor.findUnique.mockResolvedValue({
      ...reserva,
      status: "RASCUNHO",
      consentimentoVersao: null,
      consentidoEm: null,
    })
    mocks.db.contaAsaasProfessor.updateMany.mockResolvedValue({ count: 1 })
    const listarSubcontas = vi.fn().mockResolvedValue(lista())
    const criarSubconta = vi.fn().mockResolvedValue({ id: "acc_1", walletId: "wal_1" })

    const resultado = await solicitarCriacaoContaAsaasProfessor(
      { professorId: "professor-1", autorId: "usuario-1", dados },
      { agora: () => agora, listarSubcontas, criarSubconta },
    )

    expect(resultado).toMatchObject({ ok: true })
    expect(mocks.db.contaAsaasProfessor.updateMany).toHaveBeenCalledWith({
      where: expect.objectContaining({ status: "RASCUNHO" }),
      data: expect.objectContaining({
        status: "CRIANDO",
        consentimentoVersao: "2026-09-09",
        consentidoEm: agora,
      }),
    })
    expect(criarSubconta).toHaveBeenCalledTimes(1)
  })

  it("transforma uma reserva abandonada em resultado indeterminado sem repetir o POST", async () => {
    mocks.db.contaAsaasProfessor.findUnique.mockResolvedValue({
      ...reserva,
      atualizadoEm: new Date("2026-09-09T11:50:00.000Z"),
    })
    mocks.db.contaAsaasProfessor.updateMany.mockResolvedValue({ count: 1 })
    const listarSubcontas = vi.fn()
    const criarSubconta = vi.fn()

    const resultado = await solicitarCriacaoContaAsaasProfessor(
      { professorId: "professor-1", autorId: "usuario-1", dados },
      { agora: () => agora, listarSubcontas, criarSubconta },
    )

    expect(resultado).toMatchObject({ ok: false })
    expect(mocks.db.contaAsaasProfessor.updateMany).toHaveBeenCalledWith({
      where: expect.objectContaining({ status: "CRIANDO" }),
      data: expect.objectContaining({ status: "RESULTADO_INDETERMINADO" }),
    })
    expect(listarSubcontas).not.toHaveBeenCalled()
    expect(criarSubconta).not.toHaveBeenCalled()
  })

  it("bloqueia retry cego quando a comunicação pode ter falhado após a criação remota", async () => {
    const listarSubcontas = vi.fn().mockResolvedValue(lista())
    const erro = new Error("Não foi possível comunicar com o Asaas.")
    erro.name = "ErroComunicacaoAsaas"
    const criarSubconta = vi.fn().mockRejectedValue(erro)

    const resultado = await solicitarCriacaoContaAsaasProfessor(
      { professorId: "professor-1", autorId: "usuario-1", dados },
      { agora: () => agora, listarSubcontas, criarSubconta },
    )

    expect(resultado).toMatchObject({ ok: false, resultadoIndeterminado: true })
    expect(mocks.tx.contaAsaasProfessor.update).toHaveBeenLastCalledWith({
      where: { id: "conta-local-1" },
      data: expect.objectContaining({ status: "RESULTADO_INDETERMINADO" }),
    })
  })
})

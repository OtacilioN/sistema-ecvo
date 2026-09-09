import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => {
  const tx = {
    contaAsaasLoja: { create: vi.fn(), update: vi.fn() },
  }
  const db = {
    usuario: { findUnique: vi.fn() },
    contaAsaasLoja: { findUnique: vi.fn(), update: vi.fn() },
    $transaction: vi.fn(async (callback: (cliente: typeof tx) => unknown) => callback(tx)),
  }
  return { db, tx, registrarLog: vi.fn() }
})

vi.mock("@/lib/db", () => ({ db: mocks.db }))
vi.mock("@/lib/services/auditoria.service", () => ({ registrarLog: mocks.registrarLog }))

import { solicitarCriacaoContaAsaasLoja } from "./conta-asaas-loja.service"

const dados = {
  nomeTitular: "Otacilio Maia",
  emailContaAsaas: "loja@example.com",
  cpfCnpj: "52998224725",
  dataNascimento: new Date("1990-01-15T15:00:00.000Z"),
  celular: "83999999999",
  rendaMensal: 3500,
  logradouro: "Rua Exemplo",
  numeroEndereco: "10",
  complemento: null,
  bairro: "Centro",
  cep: "58000000",
  consentimento: "on" as const,
}

describe("conta Asaas da loja", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.db.usuario.findUnique.mockResolvedValue({ ativo: true, papel: "LOJA" })
    mocks.db.contaAsaasLoja.findUnique.mockResolvedValue(null)
    mocks.tx.contaAsaasLoja.create.mockResolvedValue({
      id: "principal",
      ...dados,
      status: "CRIANDO",
      atualizadoEm: new Date("2026-09-09T15:00:00.000Z"),
    })
    mocks.tx.contaAsaasLoja.update.mockResolvedValue({
      id: "principal",
      status: "AGUARDANDO_ATIVACAO",
      asaasAccountId: "acc_loja",
      walletId: "wallet_loja",
    })
  })

  it("persiste accountId e wallet sem guardar a API key retornada", async () => {
    const listarSubcontas = vi.fn().mockResolvedValue({ data: [] })
    const criarSubconta = vi.fn().mockResolvedValue({
      id: "acc_loja",
      walletId: "wallet_loja",
      apiKey: "segredo-que-nao-pode-ser-persistido",
    })

    const resultado = await solicitarCriacaoContaAsaasLoja(
      { autorId: "usuario-loja", dados },
      {
        agora: () => new Date("2026-09-09T15:00:00.000Z"),
        listarSubcontas,
        criarSubconta,
      },
    )

    expect(resultado.ok).toBe(true)
    expect(criarSubconta).toHaveBeenCalledOnce()
    expect(mocks.tx.contaAsaasLoja.update).toHaveBeenCalledWith({
      where: { id: "principal" },
      data: {
        asaasAccountId: "acc_loja",
        walletId: "wallet_loja",
        status: "AGUARDANDO_ATIVACAO",
        solicitadoEm: new Date("2026-09-09T15:00:00.000Z"),
        ultimoErro: null,
      },
    })
    expect(JSON.stringify(mocks.tx.contaAsaasLoja.update.mock.calls)).not.toContain(
      "segredo-que-nao-pode-ser-persistido",
    )
  })

  it("bloqueia a criação por um papel escolar sem acesso à loja", async () => {
    mocks.db.usuario.findUnique.mockResolvedValue({ ativo: true, papel: "PROFESSOR" })
    const criarSubconta = vi.fn()

    const resultado = await solicitarCriacaoContaAsaasLoja(
      { autorId: "professor", dados },
      { criarSubconta },
    )

    expect(resultado).toEqual({
      ok: false,
      motivo: "Usuário não autorizado para configurar a loja.",
    })
    expect(criarSubconta).not.toHaveBeenCalled()
  })
})

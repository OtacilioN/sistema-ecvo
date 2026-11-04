import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  aluno: vi.fn(),
  mensalidade: vi.fn(),
  cobranca: vi.fn(),
  redirect: vi.fn(),
}))
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }))
vi.mock("@/lib/auth/dal", () => ({
  exigirAlunoTrancado: vi.fn(async () => ({
    alunoId: "aluno-1",
    usuario: { id: "usuario-1", nome: "Aluno" },
  })),
}))
vi.mock("@/lib/db", () => ({ db: { aluno: { findUnique: mocks.aluno } } }))
vi.mock("@/app/actions/auth", () => ({ sair: vi.fn() }))
vi.mock("@/lib/services/matricula-trancada.service", () => ({
  prepararMensalidadeReativacao: mocks.mensalidade,
}))
vi.mock("@/lib/services/cobranca-reativacao.service", () => ({
  prepararCobrancaReativacaoAvulsa: mocks.cobranca,
}))
vi.mock("@/lib/services/asaas.service", () => ({ gerarCobrancaPixMensal: vi.fn() }))
vi.mock("./pagamento-reativacao", () => ({ PagamentoReativacao: () => null }))

import Page from "./page"

beforeEach(() => {
  vi.clearAllMocks()
  mocks.mensalidade.mockResolvedValue({ ok: false, exigeCobrancaAvulsa: true, motivo: "isenta" })
  mocks.cobranca.mockResolvedValue({ ok: false, motivo: "A cobrança está sendo conciliada." })
  mocks.redirect.mockImplementation((url) => {
    throw new Error(`REDIRECT:${url}`)
  })
})

describe("reativação durante a renderização", () => {
  it("redireciona quando a conciliação já ativou o aluno", async () => {
    mocks.aluno.mockResolvedValue({ status: "ATIVO" })
    await expect(Page()).rejects.toThrow("REDIRECT:/aluno")
    expect(mocks.cobranca).toHaveBeenCalledWith({ alunoId: "aluno-1", autorId: "usuario-1" })
  })
  it("exibe o estado normal quando o aluno continua trancado", async () => {
    mocks.aluno.mockResolvedValue({ status: "TRANCADO" })
    await expect(Page()).resolves.toBeTruthy()
    expect(mocks.redirect).not.toHaveBeenCalled()
  })
})

import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  aluno: { findUnique: vi.fn() },
  operacao: { findFirst: vi.fn() },
  cobranca: { findFirst: vi.fn() },
  usuario: { delete: vi.fn() },
  raw: vi.fn(),
  transaction: vi.fn(),
  log: vi.fn(),
  excluirFotos: vi.fn(),
}))
vi.mock("@/lib/db", () => ({
  db: { aluno: mocks.aluno, $transaction: mocks.transaction },
}))
vi.mock("@/lib/services/auditoria.service", () => ({ registrarLog: mocks.log }))
vi.mock("@/lib/storage/blob-fotos", () => ({ excluirFotosInternasAntigas: mocks.excluirFotos }))

import { excluirAluno } from "./aluno.service"

beforeEach(() => {
  vi.clearAllMocks()
  mocks.aluno.findUnique.mockResolvedValue({
    id: "aluno",
    usuario: { id: "usuario", nome: "Aluno", email: "a@example.com", fotoUrl: null },
    tipo: "MENSALISTA",
    status: "TRANCADO",
    contratosPixAutomatico: [],
    modalidades: [],
    plano: null,
    responsavel: null,
  })
  mocks.operacao.findFirst.mockResolvedValue(null)
  mocks.cobranca.findFirst.mockResolvedValue(null)
  mocks.transaction.mockImplementation((callback) =>
    callback({
      $queryRaw: mocks.raw,
      operacaoIsencaoTrancamento: mocks.operacao,
      cobrancaReativacaoAsaas: mocks.cobranca,
      usuario: mocks.usuario,
    }),
  )
})

describe("exclusão com isenção ou reativação", () => {
  it("recusa exclusão durante isenção pendente sem apagar usuário", async () => {
    mocks.operacao.findFirst.mockResolvedValue({ id: "op" })
    const resultado = await excluirAluno({ alunoId: "aluno", autorId: "gestor" })
    expect(resultado).toEqual({
      ok: false,
      motivo: "Aguarde a conclusão da isenção pendente antes de excluir o aluno.",
    })
    expect(mocks.usuario.delete).not.toHaveBeenCalled()
    expect(mocks.cobranca.findFirst).not.toHaveBeenCalled()
    expect(mocks.excluirFotos).not.toHaveBeenCalled()
  })

  it("preserva histórico de cobrança de reativação e informa o motivo", async () => {
    mocks.cobranca.findFirst.mockResolvedValue({ id: "cobranca" })
    const resultado = await excluirAluno({ alunoId: "aluno", autorId: "gestor" })
    expect(resultado).toMatchObject({
      ok: false,
      motivo: expect.stringContaining("histórico de cobrança de reativação"),
    })
    expect(mocks.usuario.delete).not.toHaveBeenCalled()
    expect(mocks.excluirFotos).not.toHaveBeenCalled()
  })

  it("mantém a exclusão disponível sem pendência ou histórico", async () => {
    const resultado = await excluirAluno({ alunoId: "aluno", autorId: "gestor" })
    expect(resultado).toEqual({ ok: true, alunoId: "aluno" })
    expect(mocks.usuario.delete).toHaveBeenCalledWith({ where: { id: "usuario" } })
    expect(mocks.log).toHaveBeenCalled()
  })
})

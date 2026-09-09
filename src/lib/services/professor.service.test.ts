import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  db: {
    professor: { findUnique: vi.fn() },
    $transaction: vi.fn(),
  },
  gerarHashSenha: vi.fn(),
  registrarLog: vi.fn(),
  excluirFotosInternasAntigas: vi.fn(),
}))

vi.mock("@/lib/db", () => ({ db: mocks.db }))
vi.mock("@/lib/auth/senha", () => ({ gerarHashSenha: mocks.gerarHashSenha }))
vi.mock("@/lib/services/auditoria.service", () => ({ registrarLog: mocks.registrarLog }))
vi.mock("@/lib/storage/blob-fotos", () => ({
  excluirFotosInternasAntigas: mocks.excluirFotosInternasAntigas,
}))

import { excluirProfessor } from "./professor.service"

beforeEach(() => vi.clearAllMocks())

describe("excluirProfessor", () => {
  it("preserva professor que já possui solicitação de conta Asaas", async () => {
    mocks.db.professor.findUnique.mockResolvedValue({
      id: "professor-1",
      usuario: {
        id: "usuario-1",
        nome: "Professor",
        email: "professor@example.com",
        fotoUrl: null,
        ativo: true,
      },
      cpf: "13353529705",
      telefone: null,
      fotoUrl: null,
      observacoes: null,
      contaAsaas: { id: "conta-1" },
      modalidades: [],
    })

    const resultado = await excluirProfessor({ professorId: "professor-1", autorId: "gestor-1" })

    expect(resultado).toEqual({
      ok: false,
      motivo: "Professor com conta Asaas não pode ser excluído. Inative o cadastro.",
    })
    expect(mocks.db.$transaction).not.toHaveBeenCalled()
  })
})

import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  db: {
    plano: { findUnique: vi.fn() },
    aluno: { findUnique: vi.fn() },
    solicitacaoMatricula: { findUnique: vi.fn() },
    $transaction: vi.fn(),
  },
  gerarHashSenha: vi.fn(),
}))
vi.mock("@/lib/db", () => ({ db: mocks.db }))
vi.mock("@/lib/auth/senha", () => ({ gerarHashSenha: mocks.gerarHashSenha }))

import { atualizarAluno, criarAluno } from "./aluno.service"
import { atualizarPlano, excluirPlano, vincularPlanoMensalista } from "./financeiro.service"

beforeEach(() => {
  vi.clearAllMocks()
  mocks.db.plano.findUnique.mockResolvedValue({ familia: true })
  mocks.db.solicitacaoMatricula.findUnique.mockResolvedValue(null)
  mocks.db.aluno.findUnique.mockResolvedValue({ id: "aluno", planoId: "plano-comum" })
  mocks.db.$transaction.mockImplementation((executar) => executar(mocks.db))
})

describe("proteção administrativa do plano família", () => {
  it("impede novo aluno isolado antes de criar usuário ou registro financeiro", async () => {
    await expect(
      criarAluno({
        nome: "Pessoa",
        email: "pessoa@example.com",
        senha: "senha",
        autorId: "gestor",
        tipo: "MENSALISTA",
        planoId: "familia",
        modalidadeIds: ["jiu"],
      }),
    ).rejects.toThrow("2 a 4 participantes")
  })
  it("impede troca do plano em edição cadastral ou vínculo financeiro isolado", async () => {
    expect((await atualizarAluno("aluno", { planoId: "familia", autorId: "gestor" })).ok).toBe(
      false,
    )
    expect(
      (
        await vincularPlanoMensalista({
          alunoId: "aluno",
          planoId: "familia",
          diaVencimento: 10,
          modalidadeIds: ["jiu"],
          autorId: "gestor",
        })
      ).ok,
    ).toBe(false)
    expect(mocks.db.$transaction).not.toHaveBeenCalled()
  })
  it.each([
    { padrao: true, quantidadeModalidadesMatricula: 1 },
    { padrao: false, quantidadeModalidadesMatricula: 1 },
  ])("não transforma família em oferta individual ou padrão", async (extra) => {
    expect(
      (
        await atualizarPlano({
          planoId: "familia",
          nome: "Família",
          valor: 90,
          periodicidade: "MENSAL",
          ativo: true,
          autorId: "gestor",
          ...extra,
        })
      ).ok,
    ).toBe(false)
    expect(mocks.db.$transaction).not.toHaveBeenCalled()
  })
  it("impede migração em lote para família ao excluir outro plano", async () => {
    mocks.db.plano.findUnique
      .mockResolvedValueOnce({ id: "comum", padrao: false, _count: { alunos: 1 } })
      .mockResolvedValueOnce({ id: "familia", nome: "Família", familia: true })
    expect(
      (await excluirPlano({ planoId: "comum", planoDestinoId: "familia", autorId: "gestor" })).ok,
    ).toBe(false)
    expect(mocks.db.$transaction).not.toHaveBeenCalled()
  })
})

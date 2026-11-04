import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  db: {
    aluno: { findUnique: vi.fn(), update: vi.fn() },
    mensalidade: { findFirst: vi.fn() },
    logAuditoria: { create: vi.fn() },
    $queryRaw: vi.fn(),
    $transaction: vi.fn(),
  },
}))
vi.mock("@/lib/db", () => ({ db: mocks.db }))

import { atualizarAluno, atualizarStatusTipoAluno, criarAluno } from "./aluno.service"

const aluno = {
  id: "aluno-1",
  tipo: "MENSALISTA",
  status: "ATIVO",
  planoId: null,
  plano: null,
  diaVencimento: 22,
  vencimentoMesSeguinte: false,
  usuario: { nome: "Aluno", email: "aluno@example.com" },
  modalidades: [],
  modalidadesPlano: [],
  responsavel: null,
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.db.aluno.findUnique.mockResolvedValue(aluno)
  mocks.db.aluno.update.mockImplementation(async ({ data }) => ({ ...aluno, ...data }))
  mocks.db.mensalidade.findFirst.mockResolvedValue(null)
  mocks.db.$transaction.mockImplementation((executar) => executar(mocks.db))
})

describe("proteção no trancamento", () => {
  it("impede criar cadastro já trancado", async () => {
    await expect(
      criarAluno({
        nome: "Aluno",
        email: "a@b.com",
        senha: "123456",
        tipo: "MENSALISTA",
        status: "TRANCADO",
        modalidadeIds: [],
        autorId: "gestor",
      }),
    ).rejects.toThrow("Cadastre o aluno primeiro")
    expect(mocks.db.$transaction).not.toHaveBeenCalled()
  })

  it.each([
    undefined,
    { ciente: false, frase: "trancar aluno adimplente" },
    { ciente: true, frase: "Trancar aluno adimplente" },
  ])("recusa edição de adimplente sem ambas confirmações: %s", async (confirmacaoTrancamento) => {
    const resultado = await atualizarAluno("aluno-1", {
      status: "TRANCADO",
      autorId: "gestor",
      confirmacaoTrancamento,
    })
    expect(resultado).toMatchObject({ ok: false, exigeConfirmacaoTrancamento: true })
    expect(mocks.db.aluno.update).not.toHaveBeenCalled()
  })

  it("permite trancamento confirmado e o registra", async () => {
    const resultado = await atualizarStatusTipoAluno({
      alunoId: "aluno-1",
      tipo: "MENSALISTA",
      status: "TRANCADO",
      autorId: "gestor",
      confirmacaoTrancamento: { ciente: true, frase: "trancar aluno adimplente" },
    })
    expect(resultado.ok).toBe(true)
    expect(mocks.db.logAuditoria.create).toHaveBeenCalled()
  })

  it("protege também a ação de alteração de status", async () => {
    const resultado = await atualizarStatusTipoAluno({
      alunoId: "aluno-1",
      tipo: "MENSALISTA",
      status: "TRANCADO",
      autorId: "gestor",
    })
    expect(resultado).toMatchObject({ ok: false, exigeConfirmacaoTrancamento: true })
    expect(mocks.db.aluno.update).not.toHaveBeenCalled()
    expect(mocks.db.mensalidade.findFirst).toHaveBeenCalledWith({
      where: {
        alunoId: "aluno-1",
        OR: [{ status: "VENCIDA" }, { status: "EM_ABERTO", vencimento: { lt: expect.any(Date) } }],
      },
      select: { id: true },
    })
  })

  it("permite trancamento sem confirmação quando há mensalidade vencida", async () => {
    mocks.db.mensalidade.findFirst.mockResolvedValue({ id: "vencida" })
    const resultado = await atualizarStatusTipoAluno({
      alunoId: "aluno-1",
      tipo: "MENSALISTA",
      status: "TRANCADO",
      autorId: "gestor",
    })
    expect(resultado.ok).toBe(true)
  })

  it("exige confirmação se vencimento também for alterado", async () => {
    mocks.db.mensalidade.findFirst.mockResolvedValue({ id: "vencida" })
    const resultado = await atualizarAluno("aluno-1", {
      status: "TRANCADO",
      diaVencimento: 25,
      autorId: "gestor",
    })
    expect(resultado).toMatchObject({ ok: false, exigeConfirmacaoTrancamento: true })
    expect(mocks.db.aluno.update).not.toHaveBeenCalled()
  })
})

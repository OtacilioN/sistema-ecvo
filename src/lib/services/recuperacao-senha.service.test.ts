import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  findUnique: vi.fn(),
  updateMany: vi.fn(),
  log: vi.fn(),
  gerarHashSenha: vi.fn(),
}))
vi.mock("server-only", () => ({}))
vi.mock("@/lib/db", () => ({
  db: {
    usuario: { findUnique: mocks.findUnique, updateMany: mocks.updateMany },
    $transaction: (fn: (tx: unknown) => unknown) =>
      fn({ usuario: { findUnique: mocks.findUnique, updateMany: mocks.updateMany } }),
  },
}))
vi.mock("@/lib/auth/senha", () => ({ gerarHashSenha: mocks.gerarHashSenha }))
vi.mock("@/lib/services/auditoria.service", () => ({ registrarLog: mocks.log }))

import { concluirRecuperacaoSenha, solicitarRecuperacaoSenha } from "./recuperacao-senha.service"

describe("recuperação de senha", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubEnv("RESEND_API_KEY", "chave-teste")
    vi.stubEnv("EMAIL_REMETENTE", "ECVO <teste@example.com>")
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://ecvo.example.com")
    mocks.gerarHashSenha.mockResolvedValue("hash-senha")
    mocks.updateMany.mockResolvedValue({ count: 1 })
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }))
  })

  it("não envia e-mail para conta inexistente ou de outro papel", async () => {
    mocks.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: "1", ativo: true, papel: "GESTOR", aluno: null })
    await solicitarRecuperacaoSenha("ausente@example.com")
    await solicitarRecuperacaoSenha("gestor@example.com")
    expect(fetch).not.toHaveBeenCalled()
    expect(mocks.updateMany).not.toHaveBeenCalled()
  })

  it("envia token aleatório e armazena somente seu hash com validade e intervalo", async () => {
    mocks.findUnique.mockResolvedValue({ id: "1", ativo: true, papel: "ALUNO", aluno: { id: "a" } })
    await solicitarRecuperacaoSenha("aluno@example.com")
    const chamada = vi.mocked(fetch).mock.calls[0]
    const corpo = JSON.parse(String(chamada[1]?.body))
    const token = corpo.text.match(/token=([a-f0-9]{64})/)[1]
    const operacao = mocks.updateMany.mock.calls[0][0]
    expect(operacao.data.recuperacaoHash).toHaveLength(64)
    expect(operacao.data.recuperacaoHash).not.toBe(token)
    expect(
      operacao.data.recuperacaoExpiraEm.getTime() - operacao.data.recuperacaoEnviadaEm.getTime(),
    ).toBe(3600000)
    expect(operacao.where.OR).toHaveLength(2)
  })

  it("libera nova tentativa se o provedor falhar, sem apagar outro token", async () => {
    mocks.findUnique.mockResolvedValue({ id: "1", ativo: true, papel: "ALUNO", aluno: { id: "a" } })
    vi.mocked(fetch).mockResolvedValue({ ok: false, status: 500 } as Response)
    await expect(solicitarRecuperacaoSenha("aluno@example.com")).rejects.toThrow()
    expect(mocks.updateMany.mock.calls[1][0].where.recuperacaoHash).toBe(
      mocks.updateMany.mock.calls[0][0].data.recuperacaoHash,
    )
  })

  it("não envia novamente durante o intervalo de cinco minutos", async () => {
    mocks.findUnique.mockResolvedValue({ id: "1", ativo: true, papel: "ALUNO", aluno: { id: "a" } })
    mocks.updateMany.mockResolvedValue({ count: 0 })
    await solicitarRecuperacaoSenha("aluno@example.com")
    expect(fetch).not.toHaveBeenCalled()
    const limite = mocks.updateMany.mock.calls[0][0].where.OR[1].recuperacaoEnviadaEm.lte
    expect(Date.now() - limite.getTime()).toBeGreaterThanOrEqual(300000)
  })

  it.each([
    null,
    { ativo: false, papel: "ALUNO", aluno: { id: "a" } },
    { ativo: true, papel: "GESTOR", aluno: null },
    { ativo: true, papel: "ALUNO", aluno: null },
    { ativo: true, papel: "ALUNO", aluno: { id: "a" }, recuperacaoExpiraEm: new Date(0) },
  ])("rejeita token inválido antes de calcular a senha: %j", async (usuario) => {
    mocks.findUnique.mockResolvedValue(usuario)
    expect(await concluirRecuperacaoSenha("token", "nova-senha")).toBe(false)
    expect(mocks.gerarHashSenha).not.toHaveBeenCalled()
    expect(mocks.updateMany).not.toHaveBeenCalled()
    expect(mocks.log).not.toHaveBeenCalled()
  })

  it("consome token atomicamente, revoga sessões e audita a mudança", async () => {
    mocks.findUnique.mockResolvedValue({
      id: "1",
      ativo: true,
      papel: "ALUNO",
      aluno: { id: "a" },
      recuperacaoExpiraEm: new Date(Date.now() + 3600000),
    })
    expect(await concluirRecuperacaoSenha("token", "nova-senha")).toBe(true)
    const operacao = mocks.updateMany.mock.calls[0][0]
    expect(operacao.where.recuperacaoExpiraEm.gt).toBeInstanceOf(Date)
    expect(operacao.data).toMatchObject({
      senhaHash: "hash-senha",
      recuperacaoHash: null,
      sessaoVersao: { increment: 1 },
    })
    expect(mocks.log).toHaveBeenCalledOnce()
  })

  it("não altera nem audita quando o token expirou ou já foi usado", async () => {
    mocks.findUnique.mockResolvedValue({
      id: "1",
      ativo: true,
      papel: "ALUNO",
      aluno: { id: "a" },
      recuperacaoExpiraEm: new Date(Date.now() + 3600000),
    })
    mocks.updateMany.mockResolvedValue({ count: 0 })
    expect(await concluirRecuperacaoSenha("token", "nova-senha")).toBe(false)
    expect(mocks.log).not.toHaveBeenCalled()
  })
})

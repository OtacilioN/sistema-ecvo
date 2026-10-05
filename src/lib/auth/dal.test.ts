import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  lerSessao: vi.fn(),
  usuario: vi.fn(),
  aluno: vi.fn(),
  trancar: vi.fn(),
}))
vi.mock("react", () => ({ cache: (fn: unknown) => fn }))
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`redirect:${url}`)
  },
}))
vi.mock("@/lib/auth/session", () => ({ lerSessao: mocks.lerSessao }))
vi.mock("@/lib/db", () => ({
  db: { usuario: { findUnique: mocks.usuario }, aluno: { findUnique: mocks.aluno } },
}))
vi.mock("@/lib/services/matricula-trancada.service", () => ({
  trancarAvulsosExpirados: mocks.trancar,
}))

import { exigirAluno, exigirAlunoTrancado, getUsuarioAtual } from "./dal"

const usuario = {
  id: "usuario-1",
  ativo: true,
  papel: "ALUNO",
  aluno: { id: "aluno-1", status: "ATIVO" },
}
beforeEach(() => {
  vi.clearAllMocks()
  mocks.lerSessao.mockResolvedValue({ sub: usuario.id, papel: "ALUNO" })
  mocks.usuario.mockImplementation(async () => ({ ...usuario, aluno: { ...usuario.aluno } }))
  mocks.aluno.mockResolvedValue({ status: "ATIVO" })
  mocks.trancar.mockResolvedValue({ trancados: 0 })
})

describe("acesso da matrícula trancada", () => {
  it("bloqueia a área normal mesmo quando a sessão foi criada antes do vencimento", async () => {
    mocks.aluno.mockResolvedValue({ status: "TRANCADO" })
    await expect(exigirAluno()).rejects.toThrow("redirect:/reativar-matricula")
    expect(mocks.trancar).toHaveBeenCalledWith({ alunoId: "aluno-1" })
  })
  it("permite somente o caminho específico para reativação", async () => {
    mocks.aluno.mockResolvedValue({ status: "TRANCADO" })
    expect(await exigirAlunoTrancado()).toEqual({
      usuario: { ...usuario, aluno: { id: "aluno-1", status: "TRANCADO" } },
      alunoId: "aluno-1",
    })
  })
  it("após o pagamento devolve o aluno à área normal", async () => {
    await expect(exigirAlunoTrancado()).rejects.toThrow("redirect:/aluno")
    expect((await exigirAluno()).alunoId).toBe("aluno-1")
  })
  it("matrícula cancelada não recebe acesso ao pagamento de reativação", async () => {
    mocks.aluno.mockResolvedValue({ status: "CANCELADO" })
    await expect(exigirAlunoTrancado()).rejects.toThrow("motivo=matricula-cancelada")
  })
  it("exige autenticação antes de consultar ou trancar matrícula", async () => {
    mocks.lerSessao.mockResolvedValue(null)
    await expect(getUsuarioAtual()).rejects.toThrow("redirect:/login")
    expect(mocks.trancar).not.toHaveBeenCalled()
  })
  it("não libera a rota de reativação para professor", async () => {
    mocks.usuario.mockResolvedValue({
      id: "professor-1",
      ativo: true,
      papel: "PROFESSOR",
      aluno: null,
    })
    await expect(exigirAlunoTrancado()).rejects.toThrow("redirect:/professor")
    expect(mocks.trancar).not.toHaveBeenCalled()
  })
})

import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  usuario: vi.fn(),
  aluno: vi.fn(),
  senha: vi.fn(),
  criarSessao: vi.fn(),
  trancar: vi.fn(),
}))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`redirect:${url}`)
  },
}))
vi.mock("@/lib/auth/dal", () => ({
  HOME_POR_PAPEL: { ALUNO: "/aluno", GESTOR: "/gestao" },
  ROTA_REATIVACAO_MATRICULA: "/reativar-matricula",
  exigirPapel: vi.fn(),
  getUsuarioAtual: vi.fn(),
}))
vi.mock("@/lib/auth/senha", () => ({ verificarSenha: mocks.senha }))
vi.mock("@/lib/auth/session", () => ({ criarSessao: mocks.criarSessao, destruirSessao: vi.fn() }))
vi.mock("@/lib/services/usuario.service", () => ({
  alterarSenhaPropria: vi.fn(),
  atualizarFotoUsuario: vi.fn(),
  redefinirSenhaUsuario: vi.fn(),
}))
vi.mock("@/lib/services/matricula-trancada.service", () => ({
  trancarAvulsosExpirados: mocks.trancar,
}))
vi.mock("@/lib/db", () => ({
  db: { usuario: { findUnique: mocks.usuario }, aluno: { findUnique: mocks.aluno } },
}))

import { entrar } from "./auth"

const usuario = {
  id: "usuario-1",
  ativo: true,
  papel: "ALUNO",
  nome: "Aluno",
  senhaHash: "hash",
  aluno: { id: "aluno-1", status: "ATIVO" },
}
const dados = () => {
  const form = new FormData()
  form.set("email", "aluno@example.com")
  form.set("senha", "senha-teste")
  return form
}
beforeEach(() => {
  vi.clearAllMocks()
  mocks.usuario.mockImplementation(async () => ({ ...usuario, aluno: { ...usuario.aluno } }))
  mocks.aluno.mockResolvedValue({ status: "TRANCADO" })
  mocks.senha.mockResolvedValue(true)
  mocks.trancar.mockResolvedValue({ trancados: 1 })
})

describe("login de aluno avulso vencido", () => {
  it("autentica, sincroniza o vencimento e encaminha ao pagamento sem abrir a área normal", async () => {
    await expect(entrar(undefined, dados())).rejects.toThrow("redirect:/reativar-matricula")
    expect(mocks.trancar).toHaveBeenCalledWith({ alunoId: "aluno-1" })
    expect(mocks.criarSessao).toHaveBeenCalledWith({
      sub: usuario.id,
      papel: "ALUNO",
      nome: usuario.nome,
    })
  })
  it("senha incorreta não tranca conta nem cria sessão", async () => {
    mocks.senha.mockResolvedValue(false)
    expect(await entrar(undefined, dados())).toEqual({ erro: "E-mail ou senha incorretos." })
    expect(mocks.trancar).not.toHaveBeenCalled()
    expect(mocks.criarSessao).not.toHaveBeenCalled()
  })
  it("aluno operacional continua entrando normalmente", async () => {
    mocks.aluno.mockResolvedValue({ status: "ATIVO" })
    await expect(entrar(undefined, dados())).rejects.toThrow("redirect:/aluno")
  })
  it("aluno cancelado permanece bloqueado sem acesso à reativação", async () => {
    mocks.usuario.mockResolvedValue({ ...usuario, aluno: { id: "aluno-1", status: "CANCELADO" } })
    expect(await entrar(undefined, dados())).toEqual({
      erro: "Matrícula cancelada. Procure a gestão.",
    })
    expect(mocks.criarSessao).not.toHaveBeenCalled()
  })
})

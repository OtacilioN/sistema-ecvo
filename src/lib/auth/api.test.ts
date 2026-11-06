import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({ lerSessao: vi.fn(), usuario: vi.fn(), autorizar: vi.fn() }))
vi.mock("server-only", () => ({}))
vi.mock("./session", () => ({ lerSessao: mocks.lerSessao }))
vi.mock("./sessao-dispositivo", () => ({ autorizarSessaoDispositivo: mocks.autorizar }))
vi.mock("@/lib/db", () => ({ db: { usuario: { findUnique: mocks.usuario } } }))

import { obterUsuarioAtualApi } from "./api"

const usuario = { id: "usuario-1", papel: "ALUNO", ativo: true, sessaoVersao: 0 }

beforeEach(() => {
  vi.clearAllMocks()
  mocks.lerSessao.mockResolvedValue({ sub: usuario.id, papel: "ALUNO" })
  mocks.usuario.mockResolvedValue(usuario)
  mocks.autorizar.mockResolvedValue(true)
})

describe("autenticação da API após recuperação de senha", () => {
  it("rejeita sessão revogada no dispositivo", async () => {
    mocks.autorizar.mockResolvedValue(false)
    expect(await obterUsuarioAtualApi()).toBeNull()
  })
  it("preserva a sessão sem versão quando a conta está na versão zero", async () => {
    expect(await obterUsuarioAtualApi()).toEqual(usuario)
  })

  it.each([undefined, 0])("rejeita versão antiga %s após a recuperação", async (versao) => {
    mocks.lerSessao.mockResolvedValue({ sub: usuario.id, papel: "ALUNO", versao })
    mocks.usuario.mockResolvedValue({ ...usuario, sessaoVersao: 1 })

    expect(await obterUsuarioAtualApi()).toBeNull()
  })

  it("aceita uma nova sessão com a versão atual", async () => {
    mocks.lerSessao.mockResolvedValue({ sub: usuario.id, papel: "ALUNO", versao: 1 })
    mocks.usuario.mockResolvedValue({ ...usuario, sessaoVersao: 1 })

    expect(await obterUsuarioAtualApi()).toEqual({ ...usuario, sessaoVersao: 1 })
  })

  it("não consulta o banco sem sessão", async () => {
    mocks.lerSessao.mockResolvedValue(null)

    expect(await obterUsuarioAtualApi()).toBeNull()
    expect(mocks.usuario).not.toHaveBeenCalled()
  })

  it("não aceita conta inativa mesmo com a versão correta", async () => {
    mocks.usuario.mockResolvedValue({ ...usuario, ativo: false })

    expect(await obterUsuarioAtualApi()).toBeNull()
  })
})

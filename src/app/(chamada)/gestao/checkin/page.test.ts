import * as React from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  sessao: vi.fn(),
  exigirPapel: vi.fn(),
  chave: vi.fn(),
  permissao: vi.fn(),
  painel: vi.fn(),
  acesso: vi.fn(),
  shell: vi.fn(),
}))
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`redirect:${url}`)
  },
}))
vi.mock("@/lib/auth/dal", () => ({ sessaoOpcional: mocks.sessao, exigirPapel: mocks.exigirPapel }))
vi.mock("@/lib/auth/chamada-rapida", () => ({
  chaveChamadaValida: mocks.chave,
  temPermissaoChamada: mocks.permissao,
}))
vi.mock("@/components/checkin/painel-chamada", () => ({ PainelChamada: mocks.painel }))
vi.mock("@/components/checkin/acesso-chamada", () => ({ AcessoChamada: mocks.acesso }))
vi.mock("@/components/layout/painel-shell", () => ({ PainelShell: mocks.shell }))
vi.mock("@/components/layout/navs", () => ({
  NAV_GESTOR: ["gestor"],
  NAV_SECRETARIA: ["secretaria"],
  NAV_PROFESSOR: ["professor"],
}))
vi.mock("@/components/marca", () => ({ Marca: () => null }))

import CheckinPage from "./page"

async function renderizar(acesso?: string | string[]) {
  return renderToStaticMarkup(await CheckinPage({ searchParams: Promise.resolve({ acesso }) }))
}

describe("autorização da página de chamada", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal("React", React)
    mocks.sessao.mockResolvedValue(null)
    mocks.chave.mockImplementation((valor: unknown) => valor === "chave-valida")
    mocks.permissao.mockResolvedValue(false)
    mocks.painel.mockImplementation(() => React.createElement("div", null, "Lista de alunos"))
    mocks.acesso.mockImplementation(() => React.createElement("div", null, "Confirmar acesso"))
    mocks.shell.mockImplementation(({ children }: { children: React.ReactNode }) =>
      React.createElement("section", null, children),
    )
  })
  afterEach(() => vi.unstubAllGlobals())

  it.each([
    undefined,
    "incorreta",
    ["chave-valida", "outra"],
  ])("não carrega dados de chamada para visitante sem chave única válida (%j)", async (chave) => {
    await expect(renderizar(chave)).rejects.toThrow("redirect:/login")
    expect(mocks.permissao).not.toHaveBeenCalled()
    expect(mocks.painel).not.toHaveBeenCalled()
    expect(mocks.acesso).not.toHaveBeenCalled()
  })

  it("chave válida sem permissão mostra apenas a barreira de acesso", async () => {
    const html = await renderizar("chave-valida")
    expect(html).toContain("Confirmar acesso")
    expect(html).not.toContain("Lista de alunos")
    expect(mocks.painel).not.toHaveBeenCalled()
    expect(mocks.permissao).toHaveBeenCalledWith("consulta")
    expect(mocks.acesso.mock.calls[0][0]).toEqual({ chave: "chave-valida" })
  })

  it("permite ao visitante autorizado apenas o painel rápido sem edição", async () => {
    mocks.permissao.mockResolvedValue(true)
    expect(await renderizar("chave-valida")).toContain("Lista de alunos")
    expect(mocks.painel.mock.calls[0][0]).toMatchObject({ podeEditar: false, acessoRapido: true })
    expect(mocks.acesso).not.toHaveBeenCalled()
    expect(mocks.shell).not.toHaveBeenCalled()
    expect(mocks.exigirPapel).not.toHaveBeenCalled()
  })

  it.each([
    ["GESTOR", "Gestor", true, "gestor"],
    ["SECRETARIA", "Secretaria", false, "secretaria"],
    ["PROFESSOR", "Professor", false, "professor"],
  ])("usa a DAL e o perfil do usuário autenticado %s sem exigir QR", async (papel, rotulo, editar, nav) => {
    mocks.sessao.mockResolvedValue({ sub: "usuario", papel })
    mocks.exigirPapel.mockResolvedValue({ id: "usuario", papel, nome: "Pessoa autenticada" })
    expect(await renderizar()).toContain("Lista de alunos")
    expect(mocks.exigirPapel).toHaveBeenCalledWith("GESTOR", "SECRETARIA", "PROFESSOR")
    expect(mocks.shell.mock.calls[0][0]).toMatchObject({
      usuarioNome: "Pessoa autenticada",
      papelRotulo: rotulo,
      itens: [nav],
    })
    expect(mocks.painel.mock.calls[0][0]).toMatchObject({ podeEditar: editar })
    expect(mocks.painel.mock.calls[0][0].acessoRapido).not.toBe(true)
    expect(mocks.chave).not.toHaveBeenCalled()
    expect(mocks.permissao).not.toHaveBeenCalled()
  })

  it("não permite que aluno autenticado contorne a DAL com a chave do QR", async () => {
    mocks.sessao.mockResolvedValue({ sub: "aluno", papel: "ALUNO" })
    mocks.exigirPapel.mockImplementation(async (...papeis: string[]) => {
      if (!papeis.includes("ALUNO")) throw new Error("redirect:/aluno")
    })
    await expect(renderizar("chave-valida")).rejects.toThrow("redirect:/aluno")
    expect(mocks.painel).not.toHaveBeenCalled()
    expect(mocks.chave).not.toHaveBeenCalled()
  })
})

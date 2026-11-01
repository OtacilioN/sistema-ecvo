import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({ obterPlano: vi.fn() }))
vi.mock("@/lib/services/matricula.service", () => ({
  listarOpcoesPublicasMatricula: async () => [],
}))
vi.mock("@/lib/services/matricula-familia.service", () => ({ obterPlanoFamilia: async () => null }))
vi.mock("@/lib/services/pagamento-matricula.service", () => ({
  obterPlanoAlunoAntigo: mocks.obterPlano,
  obterPlanoPadraoMatricula: async () => null,
  obterPlanosMatriculaMensalista: async () => [],
}))
vi.mock("./form-matricula", () => ({
  FormMatricula: ({
    descontoAlunoAntigo,
    planosMensalista,
  }: {
    descontoAlunoAntigo: boolean
    planosMensalista: { valor: number; valorBase: number; quantidadeModalidades: number }[]
  }) =>
    createElement(
      "div",
      { "data-desconto": String(descontoAlunoAntigo) },
      JSON.stringify(planosMensalista),
    ),
}))
vi.mock("./form-matricula-familia", () => ({ FormMatriculaFamilia: () => null }))

import Page from "./page"

describe("link de matrícula para alunos antigos", () => {
  it("não exibe a oferta na escolha comum de matrícula", async () => {
    const html = renderToStaticMarkup(await Page({ searchParams: Promise.resolve({}) }))
    expect(html).not.toContain("alunos-antigos")
    expect(html).not.toContain("Matrícula para alunos antigos")
  })

  it("abre somente pelo cupom correto e usa os valores do plano persistido", async () => {
    mocks.obterPlano.mockResolvedValue({
      id: "plano",
      nome: "Aluno antigo",
      valor: 90,
      valorBase: 120,
    })
    const html = renderToStaticMarkup(
      await Page({ searchParams: Promise.resolve({ cupom: "alunos-antigos" }) }),
    )
    expect(html).toContain("Matrícula para alunos antigos")
    expect(html).toContain('data-desconto="true"')
    expect(html).toContain("&quot;valor&quot;:90")
    expect(html).toContain("&quot;valorBase&quot;:120")
    expect(html).toContain("&quot;quantidadeModalidades&quot;:1")
  })

  it("não reconhece cupom incorreto", async () => {
    const html = renderToStaticMarkup(
      await Page({ searchParams: Promise.resolve({ cupom: "incorreto" }) }),
    )
    expect(html).not.toContain("Matrícula para alunos antigos")
  })
})

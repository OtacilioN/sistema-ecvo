import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { beforeEach, describe, expect, it, vi } from "vitest"

const estadoInicial = vi.hoisted(() => ({ modalidades: [] as string[], pessoas: 2 }))

vi.mock("@/app/actions/matriculas", () => ({
  acaoSolicitarMatricula: vi.fn(),
  acaoSolicitarMatriculaFamilia: vi.fn(),
}))
vi.mock("react", async (importOriginal) => {
  const react = await importOriginal<typeof import("react")>()
  return {
    ...react,
    useState: (inicial: unknown) => {
      const valor =
        Array.isArray(inicial) && inicial.length === 0
          ? estadoInicial.modalidades
          : inicial === 2
            ? estadoInicial.pessoas
            : inicial
      return [valor, vi.fn()]
    },
  }
})

import { FormMatricula } from "./form-matricula"
import { FormMatriculaFamilia } from "./form-matricula-familia"

const modalidades = ["Jiu-Jitsu", "Muay Thai", "Boxe"].map((nome, indice) => ({
  id: `modalidade-${indice + 1}`,
  nome,
  descricao: null,
  turmas: [],
}))
const planos = [
  { id: "plano-1", nome: "1 modalidade", quantidadeModalidades: 1, valor: 100, valorBase: 120 },
  { id: "plano-2", nome: "2 modalidades", quantidadeModalidades: 2, valor: 175, valorBase: 175 },
  { id: "plano-3", nome: "3 modalidades", quantidadeModalidades: 3, valor: 270, valorBase: 290 },
]

function renderizarIndividual(
  tipoPagamento: "MENSALISTA" | "AULA_AVULSA" | "WELLHUB" | "TOTALPASS",
) {
  return renderToStaticMarkup(
    createElement(FormMatricula, {
      modalidades,
      planoPadrao: { nome: "Plano padrão", valor: 100, valorBase: 120 },
      planosMensalista: planos,
      tipoPagamento,
    }),
  )
}

beforeEach(() => {
  estadoInicial.modalidades = []
  estadoInicial.pessoas = 2
})

describe("aviso compacto de bônus na matrícula", () => {
  it("explica o preço mensal com bônus ao lado da primeira mensalidade", () => {
    const html = renderizarIndividual("MENSALISTA")
    const preco = html.match(/data-testid="plano-matricula"[\s\S]*?<\/div>/)?.[0] ?? ""

    expect(preco).toContain("100,00")
    expect(preco).toContain(
      "Mensalidade com bônus de adimplência até o vencimento. A partir do dia seguinte ao vencimento:",
    )
    expect(preco).toContain("120,00/mês")
    expect(preco).toContain("text-xs leading-relaxed text-muted-foreground")
  })

  it("atualiza a explicação para R$ 270 / R$ 290 ao selecionar três modalidades", () => {
    estadoInicial.modalidades = modalidades.map((modalidade) => modalidade.id)

    const html = renderizarIndividual("MENSALISTA")
    const preco = html.match(/data-testid="plano-matricula"[\s\S]*?<\/div>/)?.[0] ?? ""

    expect(preco).toContain("3 modalidades")
    expect(preco).toContain("270,00")
    expect(preco).toContain("290,00/mês")
    expect(preco).not.toContain("120,00")
  })

  it("omite a explicação para um plano que não tem bônus", () => {
    estadoInicial.modalidades = modalidades.slice(0, 2).map((modalidade) => modalidade.id)

    expect(renderizarIndividual("MENSALISTA")).not.toContain("bônus de adimplência")
  })

  it.each(["WELLHUB", "TOTALPASS"] as const)("omite o aviso no fluxo %s", (tipo) => {
    expect(renderizarIndividual(tipo)).not.toContain("bônus de adimplência")
  })

  it("na aula avulsa associa o bônus à oferta mensal, preservando os R$ 20 da aula", () => {
    const html = renderizarIndividual("AULA_AVULSA")
    const preco = html.match(/data-testid="plano-matricula"[\s\S]*?<\/div>/)?.[0] ?? ""

    expect(preco).toContain("20,00")
    expect(preco).toMatch(/plano mensal de R\$ 100,00[\s\S]*Mensalidade com bônus de adimplência/)
    expect(preco).toContain("120,00/mês")
  })

  it.each([
    { pessoas: 2, total: "180,00", base: "200,00" },
    { pessoas: 3, total: "270,00", base: "300,00" },
    { pessoas: 4, total: "360,00", base: "400,00" },
  ])("mostra o total mensal e o valor sem bônus para $pessoas pessoas", (caso) => {
    estadoInicial.pessoas = caso.pessoas
    const html = renderToStaticMarkup(
      createElement(FormMatriculaFamilia, {
        modalidades,
        plano: { id: "familia", nome: "Plano família", valor: 90, valorBase: 100 },
      }),
    )
    const preco = html.match(/data-testid="plano-matricula-familia"[\s\S]*?<\/div>/)?.[0] ?? ""

    expect(preco).toContain(caso.total)
    expect(preco).toContain(
      "Total mensal com bônus de adimplência até o vencimento. A partir do dia seguinte ao vencimento:",
    )
    expect(preco).toContain(`${caso.base}/mês`)
  })
})

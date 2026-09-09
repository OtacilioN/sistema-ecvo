import { describe, expect, it } from "vitest"
import { filtrarReceitasPorProfessor, normalizarProfessorFiltro } from "./filtros-repasse"

const receitas = [
  { chave: "mensalidade:1", professorIds: ["professor-a"] },
  { chave: "mensalidade:2", professorIds: ["professor-a", "professor-b"] },
  { chave: "externo:1", professorIds: ["professor-b"] },
]

describe("filtros do extrato de repasse", () => {
  it("mantém todas as receitas quando nenhum professor está selecionado", () => {
    expect(filtrarReceitasPorProfessor(receitas, undefined)).toEqual(receitas)
  })

  it("inclui receitas compartilhadas que tenham o professor selecionado", () => {
    expect(filtrarReceitasPorProfessor(receitas, "professor-b")).toEqual([receitas[1], receitas[2]])
  })

  it("ignora um identificador que não pertence aos professores do repasse", () => {
    expect(normalizarProfessorFiltro("professor-inexistente", ["professor-a"])).toBeUndefined()
    expect(normalizarProfessorFiltro("professor-a", ["professor-a"])).toBe("professor-a")
  })
})

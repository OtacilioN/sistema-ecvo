import { describe, expect, it } from "vitest"
import { ratearTaxaMatriculaFamilia, snapshotPessoaMatriculaFamilia } from "./matricula-familia"

describe("alocações financeiras família", () => {
  it.each([
    [3.58, 2],
    [5.37, 3],
    [7.16, 4],
    [0.01, 4],
    [1, 3],
  ])("conserva exatamente %s para %s pessoas", (taxa, quantidade) => {
    const valores = ratearTaxaMatriculaFamilia(taxa, quantidade)
    expect(valores.reduce((soma, valor) => soma + Math.round(valor * 100), 0)).toBe(
      Math.round(taxa * 100),
    )
    expect(valores).toHaveLength(quantidade)
  })
  it("rejeita uma pessoa e restaura snapshot individual antes do teto agregado", () => {
    expect(() => ratearTaxaMatriculaFamilia(1, 1)).toThrow()
    expect(
      snapshotPessoaMatriculaFamilia(
        [
          {
            solicitacaoFamiliaId: "pessoa",
            valorRepasseProfessor: 45,
            valorRepasseProfessorOriginal: 60,
            modalidadeId: "jiu",
          },
        ],
        "pessoa",
      ),
    ).toEqual([{ modalidadeId: "jiu", valorRepasseProfessor: 60 }])
    expect(() => snapshotPessoaMatriculaFamilia([], "pessoa")).toThrow()
  })
})

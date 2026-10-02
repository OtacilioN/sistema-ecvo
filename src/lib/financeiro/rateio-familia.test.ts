import { describe, expect, it } from "vitest"
import { ratearCentavos } from "./rateio-familia"

describe("rateio em centavos da matrícula família", () => {
  it.each([
    [358, 2],
    [537, 3],
    [716, 4],
    [1, 4],
    [1001, 3],
  ])("conserva %i centavos em %i pessoas", (total, quantidade) => {
    const parcelas = ratearCentavos(total, Array(quantidade).fill(1))
    expect(parcelas.reduce((soma, valor) => soma + valor, 0)).toBe(total)
    expect(Math.max(...parcelas) - Math.min(...parcelas)).toBeLessThanOrEqual(1)
  })
  it("rateia somente os direitos dos professores daquela cobrança", () => {
    expect(ratearCentavos(10001, [60, 40, 0])).toEqual([6001, 4000, 0])
  })
  it("recusa pesos ou totais inválidos", () => {
    expect(() => ratearCentavos(1, [0, 0])).toThrow()
    expect(() => ratearCentavos(-1, [1])).toThrow()
    expect(() => ratearCentavos(1.5, [1])).toThrow()
    expect(() => ratearCentavos(1, [Number.NaN])).toThrow()
  })
})

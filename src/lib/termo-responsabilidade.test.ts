import { describe, expect, it } from "vitest"
import { menorDeIdade } from "./termo-responsabilidade"

describe("menorDeIdade", () => {
  it("usa a data civil legada sem antecipar o aniversário por fuso", () => {
    const nascimentoLegado = new Date("2008-02-25T00:00:00.000Z")

    expect(menorDeIdade(nascimentoLegado, new Date("2026-02-24T15:00:00.000Z"))).toBe(true)
    expect(menorDeIdade(nascimentoLegado, new Date("2026-02-25T15:00:00.000Z"))).toBe(false)
  })

  it("interpreta a referência no fuso da academia", () => {
    const nascimento = new Date("2008-02-25T15:00:00.000Z")

    expect(menorDeIdade(nascimento, new Date("2026-02-25T01:00:00.000Z"))).toBe(true)
  })
})

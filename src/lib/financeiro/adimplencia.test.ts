import { describe, expect, it } from "vitest"
import { resumoAdimplencia } from "./adimplencia"

const mensalidade = {
  status: "EM_ABERTO" as const,
  vencimento: new Date("2026-10-10T12:00:00Z"),
  valor: 100,
  valorBase: 120,
  valorComDesconto: 100,
}

describe("desconto de adimplência", () => {
  it.each([
    ["2026-10-10T23:59:59-03:00", 100, 0],
    ["2026-10-11T00:00:00-03:00", 100, 1],
    ["2026-10-14T23:59:59.999-03:00", 100, 4],
    ["2026-10-15T00:00:00-03:00", 120, 5],
    ["2026-10-15T23:59:59.999-03:00", 120, 5],
  ])("calcula o preço em %s", (data, valor, diasAtraso) => {
    expect(resumoAdimplencia(mensalidade, new Date(data))).toMatchObject({
      valorAtual: valor,
      diasAtraso,
    })
  })

  it.each([
    [90, 120],
    [180, 200],
    [270, 290],
    [90, 100], // plano família unitário: duas pessoas somam 180/200
  ])("preserva os preços %i/%i", (valorComDesconto, valorBase) => {
    const m = { ...mensalidade, valor: valorComDesconto, valorComDesconto, valorBase }
    expect(resumoAdimplencia(m, new Date("2026-10-14T12:00:00Z")).valorAtual).toBe(valorComDesconto)
    expect(resumoAdimplencia(m, new Date("2026-10-15T12:00:00Z")).valorAtual).toBe(valorBase)
  })

  it("respeita virada de mês e ano", () => {
    const resumo = resumoAdimplencia(
      { ...mensalidade, vencimento: new Date("2026-12-30T12:00:00Z") },
      new Date("2027-01-04T03:00:00Z"),
    )
    expect(resumo.perdeDescontoEm.toISOString()).toBe("2027-01-04T03:00:00.000Z")
    expect(resumo.valorAtual).toBe(120)
    expect(resumo.diasAtraso).toBe(5)
  })

  it.each(["PAGA", "CANCELADA", "ISENTA"] as const)("preserva valor histórico de %s", (status) => {
    expect(
      resumoAdimplencia({ ...mensalidade, status }, new Date("2027-01-01T12:00:00Z")).valorAtual,
    ).toBe(100)
  })

  it("não reajusta faturas legadas sem snapshots nem planos sem desconto", () => {
    expect(
      resumoAdimplencia(
        { ...mensalidade, valorBase: null, valorComDesconto: null },
        new Date("2027-01-01T12:00:00Z"),
      ),
    ).toMatchObject({ valorAtual: 100, temDesconto: false })
    expect(
      resumoAdimplencia({ ...mensalidade, valorBase: 100 }, new Date("2027-01-01T12:00:00Z")),
    ).toMatchObject({ valorAtual: 100, temDesconto: false })
  })
})

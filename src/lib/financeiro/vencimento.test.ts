import { describe, expect, it } from "vitest"
import { statusMensalidadeEfetivo } from "@/lib/services/financeiro.service"
import { vencimentoDaCompetencia, vencimentoDoPagamentoInicial } from "./vencimento"

describe("vencimento de mensalidades por competência", () => {
  it.each([1, 10, 28])("mantém o dia %i no mesmo mês", (dia) => {
    const regra = vencimentoDoPagamentoInicial(
      new Date(`2026-10-${String(dia).padStart(2, "0")}T12:00:00Z`),
    )
    expect(regra).toEqual({ diaVencimento: dia, vencimentoMesSeguinte: false })
    expect(
      vencimentoDaCompetencia(
        "2026-09",
        regra.diaVencimento,
        regra.vencimentoMesSeguinte,
      ).toISOString(),
    ).toBe(`2026-09-${String(dia).padStart(2, "0")}T12:00:00.000Z`)
  })

  it.each([29, 30, 31])("dia %i passa para 01 do mês seguinte sem alterar referência", (dia) => {
    const regra = vencimentoDoPagamentoInicial(new Date(`2026-10-${dia}T12:00:00Z`))
    expect(regra).toEqual({ diaVencimento: 1, vencimentoMesSeguinte: true })
    expect(
      vencimentoDaCompetencia(
        "2026-09",
        regra.diaVencimento,
        regra.vencimentoMesSeguinte,
      ).toISOString(),
    ).toBe("2026-10-01T12:00:00.000Z")
  })

  it.each([
    ["2026-12", "2027-01-01"],
    ["2027-02", "2027-03-01"],
    ["2028-02", "2028-03-01"],
  ])("atravessa ano e fevereiro: %s", (competencia, esperado) => {
    expect(vencimentoDaCompetencia(competencia, 1, true).toISOString()).toBe(
      `${esperado}T12:00:00.000Z`,
    )
  })

  it("preserva o dia 01 do próprio mês nos cadastros antigos", () => {
    expect(vencimentoDaCompetencia("2026-09", 1).toISOString()).toBe("2026-09-01T12:00:00.000Z")
  })

  it("usa o dia civil da academia, inclusive na virada UTC", () => {
    expect(vencimentoDoPagamentoInicial(new Date("2026-10-29T01:00:00Z"))).toEqual({
      diaVencimento: 28,
      vencimentoMesSeguinte: false,
    })
    expect(vencimentoDoPagamentoInicial(new Date("2026-11-01T01:00:00Z"))).toEqual({
      diaVencimento: 1,
      vencimentoMesSeguinte: true,
    })
  })

  it("só considera setembro vencido depois de 01/10", () => {
    const mensalidade = {
      status: "EM_ABERTO" as const,
      vencimento: vencimentoDaCompetencia("2026-09", 1, true),
    }
    expect(statusMensalidadeEfetivo(mensalidade, new Date("2026-09-30T12:00:00Z"))).toBe(
      "EM_ABERTO",
    )
    expect(statusMensalidadeEfetivo(mensalidade, new Date("2026-10-01T20:00:00Z"))).toBe(
      "EM_ABERTO",
    )
    expect(statusMensalidadeEfetivo(mensalidade, new Date("2026-10-02T12:00:00Z"))).toBe("VENCIDA")
  })
})

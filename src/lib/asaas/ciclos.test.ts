import { describe, expect, it } from "vitest"
import {
  competenciasDoCicloPixAutomatico,
  competenciasDoSemestre,
  estaNaJanelaDeCriacaoPixAutomatico,
  somarMesesCompetencia,
  tipoPixAutomaticoDoContrato,
  totalCiclosPixAutomatico,
} from "./ciclos"

describe("ciclos de cobrança Asaas", () => {
  it("gera três competências e termina no mês correto na virada do ano", () => {
    expect(competenciasDoCicloPixAutomatico("2026-12", 3)).toEqual([
      "2026-12",
      "2027-01",
      "2027-02",
    ])
    expect(totalCiclosPixAutomatico("AUTOMATICO_TRIMESTRAL")).toBe(3)
    expect(totalCiclosPixAutomatico("AUTOMATICO_SEMESTRAL")).toBe(6)
    expect(tipoPixAutomaticoDoContrato(3)).toBe("AUTOMATICO_TRIMESTRAL")
    expect(tipoPixAutomaticoDoContrato(6)).toBe("AUTOMATICO_SEMESTRAL")
  })

  it.each([0, 1, 2, 4, 5, 7, 12])("recusa %i ciclos fora das opções contratáveis", (total) => {
    expect(() => competenciasDoCicloPixAutomatico("2026-10", total)).toThrow()
  })
  it("gera exatamente seis competências, inclusive na virada do ano", () => {
    expect(competenciasDoSemestre("2026-10")).toEqual([
      "2026-10",
      "2026-11",
      "2026-12",
      "2027-01",
      "2027-02",
      "2027-03",
    ])
  })

  it("soma meses em ambos os sentidos", () => {
    expect(somarMesesCompetencia("2026-01", -1)).toBe("2025-12")
    expect(somarMesesCompetencia("2026-12", 1)).toBe("2027-01")
  })

  it("seleciona somente a janela conservadora de emissão", () => {
    const hoje = new Date("2026-08-20T12:00:00.000Z")
    expect(estaNaJanelaDeCriacaoPixAutomatico(new Date("2026-08-22T12:00:00.000Z"), hoje)).toBe(
      true,
    )
    expect(estaNaJanelaDeCriacaoPixAutomatico(new Date("2026-09-03T12:00:00.000Z"), hoje)).toBe(
      true,
    )
    expect(estaNaJanelaDeCriacaoPixAutomatico(new Date("2026-09-04T12:00:00.000Z"), hoje)).toBe(
      false,
    )
  })
})

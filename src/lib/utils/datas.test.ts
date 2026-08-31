import { describe, expect, it } from "vitest"
import { formatarCompetencia, formatarMinutos, minutosParaHoras, rotuloDiaSemana } from "./datas"

describe("formatarCompetencia", () => {
  it("transforma a chave técnica em mês e ano legíveis", () => {
    expect(formatarCompetencia("2026-06")).toBe("junho de 2026")
    expect(formatarCompetencia("2026-12")).toBe("dezembro de 2026")
  })

  it("preserva valores fora do formato esperado", () => {
    expect(formatarCompetencia("2026-13")).toBe("2026-13")
    expect(formatarCompetencia("junho de 2026")).toBe("junho de 2026")
  })
})

describe("formatarMinutos", () => {
  it("formata horas e minutos", () => {
    expect(formatarMinutos(90)).toBe("1h30")
    expect(formatarMinutos(60)).toBe("1h")
    expect(formatarMinutos(45)).toBe("45min")
    expect(formatarMinutos(150)).toBe("2h30")
  })
})

describe("minutosParaHoras", () => {
  it("converte para horas decimais", () => {
    expect(minutosParaHoras(90)).toBe(1.5)
    expect(minutosParaHoras(7200)).toBe(120)
  })
})

describe("rotuloDiaSemana", () => {
  it("retorna o nome do dia", () => {
    expect(rotuloDiaSemana(1)).toBe("Segunda")
    expect(rotuloDiaSemana(0)).toBe("Domingo")
  })
})

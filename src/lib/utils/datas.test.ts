import { describe, expect, it } from "vitest"
import {
  dataCivilParaDate,
  formatarCompetencia,
  formatarDataCivil,
  formatarDataCivilInput,
  formatarMinutos,
  minutosParaHoras,
  partesDataCivil,
  rotuloDiaSemana,
} from "./datas"

describe("datas civis", () => {
  it("preserva o dia de um cadastro legado gravado à meia-noite UTC", () => {
    const nascimentoLegado = new Date("2007-02-25T00:00:00.000Z")

    expect(partesDataCivil(nascimentoLegado)).toEqual({ ano: 2007, mes: 2, dia: 25 })
    expect(formatarDataCivilInput(nascimentoLegado)).toBe("2007-02-25")
    expect(formatarDataCivil(nascimentoLegado)).toBe("25/02/2007")
  })

  it("mantém o round-trip de uma data civil atual no fuso da academia", () => {
    const nascimento = dataCivilParaDate("2007-02-25")

    expect(nascimento.toISOString()).toBe("2007-02-25T15:00:00.000Z")
    expect(formatarDataCivilInput(nascimento)).toBe("2007-02-25")
    expect(formatarDataCivil(nascimento)).toBe("25/02/2007")
  })
})

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

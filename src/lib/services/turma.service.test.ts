import { describe, expect, it } from "vitest"
import {
  duracaoEntreHoras,
  gerarOcorrencias,
  parseHoraMin,
  validarDuracaoAula,
} from "./turma.service"

describe("parseHoraMin", () => {
  it("converte HH:mm", () => {
    expect(parseHoraMin("19:00")).toEqual({ horas: 19, minutos: 0 })
    expect(parseHoraMin("07:30")).toEqual({ horas: 7, minutos: 30 })
  })
  it("rejeita formato inválido", () => {
    expect(() => parseHoraMin("25:00")).toThrow()
    expect(() => parseHoraMin("abc")).toThrow()
  })
})

describe("duracaoEntreHoras", () => {
  it("calcula a duração em minutos", () => {
    expect(duracaoEntreHoras("19:00", "20:30")).toBe(90)
    expect(duracaoEntreHoras("07:00", "08:00")).toBe(60)
  })
  it("trata virada de meia-noite", () => {
    expect(duracaoEntreHoras("23:30", "00:30")).toBe(60)
  })
})

describe("gerarOcorrencias", () => {
  it("gera uma aula por semana no dia certo", () => {
    // 2026-06-01 é segunda-feira. Janela de ~3 semanas.
    const ocorrencias = gerarOcorrencias({
      diaSemana: 1, // segunda
      horaInicio: "19:00",
      horaFim: "20:30",
      de: new Date("2026-06-01T00:00:00Z"),
      ate: new Date("2026-06-21T23:59:59Z"),
    })
    expect(ocorrencias).toHaveLength(3) // 01, 08, 15 de junho (segundas)
    for (const oc of ocorrencias) {
      expect(oc.duracaoMin).toBe(90)
      // 19:00 em São Paulo (UTC-3) = 22:00 UTC
      expect(oc.inicio.getUTCHours()).toBe(22)
    }
  })

  it("retorna vazio quando não há o dia da semana na janela", () => {
    const ocorrencias = gerarOcorrencias({
      diaSemana: 0, // domingo
      horaInicio: "10:00",
      horaFim: "11:00",
      de: new Date("2026-06-01T00:00:00Z"), // segunda
      ate: new Date("2026-06-03T23:59:59Z"), // quarta
    })
    expect(ocorrencias).toHaveLength(0)
  })
})

describe("validarDuracaoAula", () => {
  it("calcula duração positiva de aula avulsa", () => {
    expect(
      validarDuracaoAula({
        inicio: new Date("2026-06-10T19:00:00Z"),
        fim: new Date("2026-06-10T20:30:00Z"),
      }),
    ).toEqual({ ok: true, duracaoMin: 90 })
  })

  it("rejeita fim anterior ao início e duração acima de 24h", () => {
    expect(
      validarDuracaoAula({
        inicio: new Date("2026-06-10T20:30:00Z"),
        fim: new Date("2026-06-10T19:00:00Z"),
      }),
    ).toMatchObject({ ok: false })

    expect(
      validarDuracaoAula({
        inicio: new Date("2026-06-10T19:00:00Z"),
        fim: new Date("2026-06-12T20:00:00Z"),
      }),
    ).toMatchObject({ ok: false })
  })
})

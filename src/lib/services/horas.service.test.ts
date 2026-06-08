import { describe, expect, it } from "vitest"
import {
  META_DEZ_MIL_HORAS_MIN,
  minutosDeEstorno,
  podeAjustarHoras,
  podeProfessorLancarHoras,
  progressoDezMil,
  proximoMarco,
  totaisPorModalidade,
  totalMinutos,
} from "./horas.service"

describe("minutosDeEstorno", () => {
  it("retorna o simétrico negativo de um crédito", () => {
    expect(minutosDeEstorno(90)).toBe(-90)
    expect(minutosDeEstorno(60)).toBe(-60)
  })
  it("é idempotente quanto ao sinal de entrada", () => {
    expect(minutosDeEstorno(-90)).toBe(-90)
  })
})

describe("totalMinutos", () => {
  it("soma o ledger (crédito + estorno = zero)", () => {
    const movimentos = [
      { minutos: 90, modalidadeId: "jiu" },
      { minutos: -90, modalidadeId: "jiu" },
      { minutos: 60, modalidadeId: "kick" },
    ]
    expect(totalMinutos(movimentos)).toBe(60)
  })
  it("é zero quando vazio", () => {
    expect(totalMinutos([])).toBe(0)
  })
})

describe("totaisPorModalidade", () => {
  it("agrega minutos por modalidade", () => {
    const mapa = totaisPorModalidade([
      { minutos: 90, modalidadeId: "jiu" },
      { minutos: 90, modalidadeId: "jiu" },
      { minutos: -90, modalidadeId: "jiu" },
      { minutos: 60, modalidadeId: "kick" },
    ])
    expect(mapa.get("jiu")).toBe(90)
    expect(mapa.get("kick")).toBe(60)
  })
})

describe("progressoDezMil", () => {
  it("é 0 sem horas e 1 ao atingir a meta", () => {
    expect(progressoDezMil(0)).toBe(0)
    expect(progressoDezMil(-10)).toBe(0)
    expect(progressoDezMil(META_DEZ_MIL_HORAS_MIN)).toBe(1)
  })
  it("nunca passa de 1", () => {
    expect(progressoDezMil(META_DEZ_MIL_HORAS_MIN * 2)).toBe(1)
  })
  it("é proporcional no meio do caminho", () => {
    expect(progressoDezMil(META_DEZ_MIL_HORAS_MIN / 2)).toBeCloseTo(0.5)
  })
})

describe("proximoMarco", () => {
  it("retorna o primeiro marco acima das horas atuais", () => {
    expect(proximoMarco(0)).toBe(10)
    expect(proximoMarco(11 * 60)).toBe(25)
    expect(proximoMarco(600 * 60)).toBe(1000)
  })
  it("retorna null após 10 mil horas", () => {
    expect(proximoMarco(10_000 * 60)).toBeNull()
  })
})

describe("podeAjustarHoras", () => {
  it("permite ajuste positivo ou negativo para modalidade do aluno", () => {
    expect(
      podeAjustarHoras({
        minutos: -30,
        motivo: "Correção de lançamento",
        alunoModalidadeIds: ["jiu"],
        modalidadeId: "jiu",
      }),
    ).toEqual({ ok: true })

    expect(
      podeAjustarHoras({
        minutos: 60,
        motivo: "Crédito manual",
        alunoModalidadeIds: ["jiu"],
        modalidadeId: "jiu",
      }),
    ).toEqual({ ok: true })
  })

  it("bloqueia zero, motivo curto e modalidade não vinculada", () => {
    expect(
      podeAjustarHoras({
        minutos: 0,
        motivo: "Correção",
        alunoModalidadeIds: ["jiu"],
        modalidadeId: "jiu",
      }),
    ).toMatchObject({ ok: false })

    expect(
      podeAjustarHoras({
        minutos: 30,
        motivo: "abc",
        alunoModalidadeIds: ["jiu"],
        modalidadeId: "jiu",
      }),
    ).toMatchObject({ ok: false })

    expect(
      podeAjustarHoras({
        minutos: 30,
        motivo: "Correção",
        alunoModalidadeIds: ["boxe"],
        modalidadeId: "jiu",
      }),
    ).toMatchObject({ ok: false })
  })
})

describe("podeProfessorLancarHoras", () => {
  it("permite lançamento positivo quando aluno e professor compartilham a modalidade", () => {
    expect(
      podeProfessorLancarHoras({
        minutos: 75,
        motivo: "Treino avulso",
        alunoModalidadeIds: ["jiu", "boxe"],
        professorModalidadeIds: ["jiu"],
        modalidadeId: "jiu",
      }),
    ).toEqual({ ok: true })
  })

  it("bloqueia minuto negativo e modalidade fora do professor ou do aluno", () => {
    expect(
      podeProfessorLancarHoras({
        minutos: -30,
        motivo: "Treino avulso",
        alunoModalidadeIds: ["jiu"],
        professorModalidadeIds: ["jiu"],
        modalidadeId: "jiu",
      }),
    ).toMatchObject({ ok: false })

    expect(
      podeProfessorLancarHoras({
        minutos: 30,
        motivo: "Treino avulso",
        alunoModalidadeIds: ["jiu"],
        professorModalidadeIds: ["boxe"],
        modalidadeId: "jiu",
      }),
    ).toMatchObject({ ok: false })

    expect(
      podeProfessorLancarHoras({
        minutos: 30,
        motivo: "Treino avulso",
        alunoModalidadeIds: ["boxe"],
        professorModalidadeIds: ["jiu"],
        modalidadeId: "jiu",
      }),
    ).toMatchObject({ ok: false })
  })
})

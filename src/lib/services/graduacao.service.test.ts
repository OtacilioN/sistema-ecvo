import { describe, expect, it } from "vitest"
import {
  avaliarElegibilidade,
  avaliarInscricaoExame,
  graduacaoAtualEfetiva,
  proximaGraduacao,
} from "./graduacao.service"

describe("avaliarElegibilidade", () => {
  it("sugere elegibilidade por horas e tempo sem graduar automaticamente", () => {
    const resultado = avaliarElegibilidade({
      graduacao: { minHoras: 100, minTempoNoGrauDias: 30 },
      minutosNaModalidade: 120 * 60,
      concedidaEmAtual: new Date("2026-01-01T00:00:00Z"),
      agora: new Date("2026-02-15T00:00:00Z"),
    })

    expect(resultado).toMatchObject({
      horasOk: true,
      tempoOk: true,
      elegivel: true,
      horasAtuais: 120,
      horasMinimas: 100,
      diasNoGrau: 45,
    })
  })

  it("mantém sugestão negativa quando falta requisito", () => {
    const resultado = avaliarElegibilidade({
      graduacao: { minHoras: 100, minTempoNoGrauDias: null },
      minutosNaModalidade: 90 * 60,
    })

    expect(resultado.horasOk).toBe(false)
    expect(resultado.elegivel).toBe(false)
  })
})

describe("avaliarInscricaoExame", () => {
  const exameData = new Date("2026-06-10T19:00:00Z")
  const agora = new Date("2026-06-01T12:00:00Z")

  it("permite aluno ativo da modalidade em exame futuro", () => {
    expect(
      avaliarInscricaoExame({
        statusAluno: "ATIVO",
        alunoModalidadeIds: ["jiu"],
        exameModalidadeId: "jiu",
        exameData,
        jaInscrito: false,
        agora,
      }),
    ).toEqual({ ok: true })
  })

  it("bloqueia aluno fora da modalidade", () => {
    expect(
      avaliarInscricaoExame({
        statusAluno: "ATIVO",
        alunoModalidadeIds: ["boxe"],
        exameModalidadeId: "jiu",
        exameData,
        jaInscrito: false,
        agora,
      }),
    ).toMatchObject({ ok: false })
  })

  it("bloqueia exame passado e inscrição duplicada", () => {
    expect(
      avaliarInscricaoExame({
        statusAluno: "ATIVO",
        alunoModalidadeIds: ["jiu"],
        exameModalidadeId: "jiu",
        exameData: new Date("2026-05-10T19:00:00Z"),
        jaInscrito: false,
        agora,
      }),
    ).toMatchObject({ ok: false })

    expect(
      avaliarInscricaoExame({
        statusAluno: "ATIVO",
        alunoModalidadeIds: ["jiu"],
        exameModalidadeId: "jiu",
        exameData,
        jaInscrito: true,
        agora,
      }),
    ).toMatchObject({ ok: false })
  })
})

describe("graduação efetiva", () => {
  const catalogo = [
    { id: "branca", nome: "Branca", ordem: 1 },
    { id: "amarela", nome: "Amarela", ordem: 2 },
    { id: "laranja", nome: "Laranja", ordem: 3 },
  ]

  it("assume a primeira graduação do catálogo quando não há registro atual", () => {
    expect(graduacaoAtualEfetiva(catalogo)?.nome).toBe("Branca")
    expect(proximaGraduacao(catalogo)?.nome).toBe("Amarela")
  })

  it("usa o registro atual para calcular a próxima graduação", () => {
    expect(proximaGraduacao(catalogo, catalogo[1])?.nome).toBe("Laranja")
    expect(proximaGraduacao(catalogo, catalogo[2])).toBeNull()
  })

  it("não presume graduação quando a modalidade não tem catálogo", () => {
    expect(graduacaoAtualEfetiva([])).toBeNull()
    expect(proximaGraduacao([])).toBeNull()
  })
})

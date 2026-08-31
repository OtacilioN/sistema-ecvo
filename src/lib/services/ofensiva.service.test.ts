import { describe, expect, it } from "vitest"
import {
  calcularOfensivas,
  montarRankingOfensivas,
  type PresencaOfensiva,
} from "./ofensiva.service"

const modalidade = "kickboxing"

function presenca(alunoId: string, dia: string, modalidadeId = modalidade): PresencaOfensiva {
  return { alunoId, modalidadeId, dia }
}

describe("calcularOfensivas", () => {
  it("conta dias corridos inclusivos na sequência segunda, quarta, sexta e segunda", () => {
    const dias = ["2026-08-24", "2026-08-26", "2026-08-28", "2026-08-31"]
    const resultadosParciais = dias.map(
      (_, indice) =>
        calcularOfensivas(
          dias.slice(0, indice + 1).map((dia) => presenca("ana", dia)),
          dias[indice],
        )[0],
    )

    expect(resultadosParciais.map((item) => item.diasAtuais)).toEqual([1, 3, 5, 8])
    expect(resultadosParciais.at(-1)).toMatchObject({
      inicioAtual: "2026-08-24",
      ultimoTreino: "2026-08-31",
      maximoDias: 8,
    })
  })

  it("quebra depois de uma falta em dia ativo e preserva o recorde alcançado", () => {
    const resultado = calcularOfensivas(
      [presenca("ana", "2026-08-24"), presenca("ana", "2026-08-26"), presenca("bia", "2026-08-28")],
      "2026-08-29",
    ).find((item) => item.alunoId === "ana")

    expect(resultado).toMatchObject({
      diasAtuais: 0,
      maximoDias: 3,
      inicioAtual: null,
      ultimoTreino: "2026-08-26",
    })
  })

  it("não quebra quando ninguém fez check-in na modalidade", () => {
    const [resultado] = calcularOfensivas(
      [presenca("ana", "2026-08-24"), presenca("ana", "2026-08-28")],
      "2026-08-28",
    )

    expect(resultado).toMatchObject({ diasAtuais: 5, maximoDias: 5 })
  })

  it("conta no máximo uma vez por aluno e modalidade no mesmo dia", () => {
    const [resultado] = calcularOfensivas(
      [presenca("ana", "2026-08-24"), presenca("ana", "2026-08-24"), presenca("ana", "2026-08-26")],
      "2026-08-26",
    )

    expect(resultado).toMatchObject({ diasAtuais: 3, maximoDias: 3 })
  })

  it("não quebra a ofensiva de quem ainda pode treinar mais tarde no dia atual", () => {
    const resultadoHoje = calcularOfensivas(
      [presenca("ana", "2026-08-24"), presenca("bia", "2026-08-26")],
      "2026-08-26",
    ).find((item) => item.alunoId === "ana")
    const resultadoAmanha = calcularOfensivas(
      [presenca("ana", "2026-08-24"), presenca("bia", "2026-08-26")],
      "2026-08-27",
    ).find((item) => item.alunoId === "ana")

    expect(resultadoHoje?.diasAtuais).toBe(1)
    expect(resultadoAmanha?.diasAtuais).toBe(0)
  })

  it("mantém ofensivas independentes por modalidade", () => {
    const resultados = calcularOfensivas(
      [
        presenca("ana", "2026-08-24", "kickboxing"),
        presenca("ana", "2026-08-26", "kickboxing"),
        presenca("ana", "2026-08-25", "jiu-jitsu"),
      ],
      "2026-08-26",
    )

    expect(resultados.find((item) => item.modalidadeId === "kickboxing")?.diasAtuais).toBe(3)
    expect(resultados.find((item) => item.modalidadeId === "jiu-jitsu")?.diasAtuais).toBe(1)
  })

  it("recalcula segmentos quando uma presença retroativa é adicionada ou removida", () => {
    const semQuarta = calcularOfensivas(
      [presenca("ana", "2026-08-24"), presenca("bia", "2026-08-26"), presenca("ana", "2026-08-28")],
      "2026-08-29",
    ).find((item) => item.alunoId === "ana")
    const comQuarta = calcularOfensivas(
      [
        presenca("ana", "2026-08-24"),
        presenca("ana", "2026-08-26"),
        presenca("bia", "2026-08-26"),
        presenca("ana", "2026-08-28"),
      ],
      "2026-08-29",
    ).find((item) => item.alunoId === "ana")

    expect(semQuarta).toMatchObject({ diasAtuais: 1, maximoDias: 1 })
    expect(comQuarta).toMatchObject({ diasAtuais: 5, maximoDias: 5 })
  })

  it("calcula corretamente através de mudança de mês e ano", () => {
    const [resultado] = calcularOfensivas(
      [presenca("ana", "2026-12-31"), presenca("ana", "2027-01-02")],
      "2027-01-02",
    )

    expect(resultado.diasAtuais).toBe(3)
  })
})

describe("montarRankingOfensivas", () => {
  const alunos = [
    {
      id: "ana",
      nome: "Ana Beatriz Silva",
      modalidades: [
        { id: "kickboxing", nome: "Kickboxing" },
        { id: "jiu-jitsu", nome: "Jiu-jitsu" },
      ],
    },
    {
      id: "bia",
      nome: "Beatriz Souza",
      modalidades: [{ id: "kickboxing", nome: "Kickboxing" }],
    },
    {
      id: "caio",
      nome: "Caio Lima",
      modalidades: [{ id: "jiu-jitsu", nome: "Jiu-jitsu" }],
    },
  ]
  const estados = [
    {
      alunoId: "ana",
      modalidadeId: "kickboxing",
      diasAtuais: 5,
      maximoDias: 8,
      inicioAtual: "2026-08-24",
      ultimoTreino: "2026-08-28",
    },
    {
      alunoId: "ana",
      modalidadeId: "jiu-jitsu",
      diasAtuais: 2,
      maximoDias: 10,
      inicioAtual: "2026-08-27",
      ultimoTreino: "2026-08-28",
    },
    {
      alunoId: "bia",
      modalidadeId: "kickboxing",
      diasAtuais: 5,
      maximoDias: 8,
      inicioAtual: "2026-08-24",
      ultimoTreino: "2026-08-28",
    },
  ]

  it("usa a maior ofensiva histórica por aluno no ranking geral", () => {
    const ranking = montarRankingOfensivas({ alunos, estados })

    expect(ranking.map((linha) => [linha.alunoId, linha.posicao, linha.maximoDias])).toEqual([
      ["ana", 1, 10],
      ["bia", 2, 8],
      ["caio", 3, 0],
    ])
    expect(ranking[0]).toMatchObject({
      nome: "Ana S.",
      modalidadeNome: "Jiu-jitsu",
      diasAtuais: 2,
    })
  })

  it("mantém no topo quem quebrou uma ofensiva histórica maior", () => {
    const ranking = montarRankingOfensivas({
      alunos: alunos.slice(0, 2),
      estados: [
        { ...estados[0], diasAtuais: 5, maximoDias: 50 },
        { ...estados[2], diasAtuais: 30, maximoDias: 30 },
      ],
    })

    expect(ranking.map((linha) => [linha.alunoId, linha.maximoDias, linha.diasAtuais])).toEqual([
      ["ana", 50, 5],
      ["bia", 30, 30],
    ])
  })

  it("compartilha posição quando o recorde histórico é igual", () => {
    const ranking = montarRankingOfensivas({
      alunos: alunos.slice(0, 2),
      estados: [
        { ...estados[0], diasAtuais: 1, maximoDias: 50 },
        { ...estados[2], diasAtuais: 20, maximoDias: 50 },
      ],
    })

    expect(ranking.map((linha) => [linha.alunoId, linha.posicao])).toEqual([
      ["bia", 1],
      ["ana", 1],
    ])
  })

  it("inclui somente alunos vinculados no ranking por modalidade", () => {
    const ranking = montarRankingOfensivas({ alunos, estados, modalidadeId: "kickboxing" })

    expect(ranking.map((linha) => linha.alunoId)).toEqual(["ana", "bia"])
  })
})

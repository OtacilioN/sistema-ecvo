import { describe, expect, it } from "vitest"
import {
  type AulaCandidataCheckinLivre,
  selecionarAulaReferenciaCheckinLivre,
} from "./checkin-horario"

function aula(
  id: string,
  inicio: string,
  fim: string,
  override: Partial<AulaCandidataCheckinLivre> = {},
): AulaCandidataCheckinLivre {
  return {
    id,
    inicio: new Date(inicio),
    fim: new Date(fim),
    cancelada: false,
    temAgendamento: false,
    temCheckin: false,
    vagasDisponiveis: null,
    ...override,
  }
}

const aulas = [
  aula("09", "2026-07-15T12:00:00Z", "2026-07-15T13:00:00Z"),
  aula("15", "2026-07-15T18:00:00Z", "2026-07-15T19:00:00Z"),
  aula("21", "2026-07-16T00:00:00Z", "2026-07-16T01:00:00Z"),
]

describe("selecionarAulaReferenciaCheckinLivre", () => {
  it("usa a primeira aula do dia antes do primeiro horário", () => {
    const selecionada = selecionarAulaReferenciaCheckinLivre(
      aulas,
      new Date("2026-07-15T11:00:00Z"),
    )
    expect(selecionada?.id).toBe("09")
  })

  it("associa 11h a aula das 15h", () => {
    const selecionada = selecionarAulaReferenciaCheckinLivre(
      aulas,
      new Date("2026-07-15T14:00:00Z"),
    )
    expect(selecionada?.id).toBe("15")
  })

  it("mantem a aula que esta em andamento", () => {
    const selecionada = selecionarAulaReferenciaCheckinLivre(
      aulas,
      new Date("2026-07-15T18:30:00Z"),
    )
    expect(selecionada?.id).toBe("15")
  })

  it("associa 16h30 a aula das 21h", () => {
    const selecionada = selecionarAulaReferenciaCheckinLivre(
      aulas,
      new Date("2026-07-15T19:30:00Z"),
    )
    expect(selecionada?.id).toBe("21")
  })

  it("usa a ultima aula do dia depois do ultimo horario", () => {
    const selecionada = selecionarAulaReferenciaCheckinLivre(
      aulas,
      new Date("2026-07-16T02:00:00Z"),
    )
    expect(selecionada?.id).toBe("21")
  })

  it("prioriza o agendamento confirmado do aluno", () => {
    const candidatas = aulas.map((item) =>
      item.id === "21" ? { ...item, temAgendamento: true } : item,
    )
    const selecionada = selecionarAulaReferenciaCheckinLivre(
      candidatas,
      new Date("2026-07-15T14:00:00Z"),
    )
    expect(selecionada?.id).toBe("21")
  })

  it("pula o proximo horario lotado quando ha outro disponivel", () => {
    const candidatas = aulas.map((item) => ({
      ...item,
      vagasDisponiveis: item.id === "15" ? 0 : 1,
    }))
    const selecionada = selecionarAulaReferenciaCheckinLivre(
      candidatas,
      new Date("2026-07-15T14:00:00Z"),
    )
    expect(selecionada?.id).toBe("21")
  })

  it("mantem o primeiro futuro lotado para bloquear quando nao existe outro futuro com vaga", () => {
    const candidatas = aulas.map((item) => ({
      ...item,
      vagasDisponiveis: item.id === "09" ? 1 : 0,
    }))
    const selecionada = selecionarAulaReferenciaCheckinLivre(
      candidatas,
      new Date("2026-07-15T14:00:00Z"),
    )
    expect(selecionada?.id).toBe("15")
  })

  it("nao desvia uma duplicidade para outro horario", () => {
    const candidatas = aulas.map((item) =>
      item.id === "15"
        ? { ...item, temCheckin: true, vagasDisponiveis: 0 }
        : { ...item, vagasDisponiveis: 1 },
    )
    const selecionada = selecionarAulaReferenciaCheckinLivre(
      candidatas,
      new Date("2026-07-15T14:00:00Z"),
    )
    expect(selecionada?.id).toBe("15")
  })

  it("ignora aulas canceladas", () => {
    const candidatas = aulas.map((item) => (item.id === "15" ? { ...item, cancelada: true } : item))
    const selecionada = selecionarAulaReferenciaCheckinLivre(
      candidatas,
      new Date("2026-07-15T14:00:00Z"),
    )
    expect(selecionada?.id).toBe("21")
  })

  it("retorna nulo quando nao ha aula oficial candidata", () => {
    expect(selecionarAulaReferenciaCheckinLivre([], new Date("2026-07-15T14:00:00Z"))).toBeNull()
  })
})

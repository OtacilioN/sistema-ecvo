import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({ aula: vi.fn(), alunos: vi.fn() }))
vi.mock("@/lib/db", () => ({
  db: { aula: { findFirst: mocks.aula }, aluno: { findMany: mocks.alunos } },
}))

import { carregarChamadaRapida } from "./chamada-rapida.service"

const aluno = (id: string) => ({ id, usuario: { nome: `Aluno ${id}` } })
const checkin = (alunoId: string, status: string) => ({
  alunoId,
  status,
  aluno: aluno(alunoId),
})

describe("consulta mínima da chamada rápida", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    // Ainda é dia 4 em Fortaleza; o dia UTC já virou.
    vi.setSystemTime(new Date("2026-11-05T01:00:00Z"))
    mocks.alunos.mockResolvedValue([aluno("a"), aluno("b"), aluno("c"), aluno("d"), aluno("e")])
    mocks.aula.mockResolvedValue({
      turma: { modalidadeId: "modalidade" },
      comparecimentos: [
        { alunoId: "a", status: "CONFIRMADO" },
        { alunoId: "e", status: "CONFIRMADO" },
      ],
      checkins: [
        checkin("a", "VALIDO"),
        checkin("b", "VALIDO"),
        checkin("c", "PENDENTE_REVISAO"),
        checkin("d", "INVALIDADO"),
        checkin("externo", "VALIDO"),
      ],
    })
  })
  afterEach(() => vi.useRealTimers())

  it("considera presentes com ou sem agendamento, inclusive aluno de outra modalidade", async () => {
    const chamada = await carregarChamadaRapida("aula")
    expect(
      chamada?.lista.filter((linha) => linha.status === "PRESENTE").map((linha) => linha.alunoId),
    ).toEqual(["a", "b", "externo"])
    expect(chamada?.lista.find((linha) => linha.alunoId === "a")?.temComparecimento).toBe(true)
    expect(chamada?.lista.find((linha) => linha.alunoId === "b")?.temComparecimento).toBe(false)
    expect(chamada?.lista.find((linha) => linha.alunoId === "c")?.status).toBe("PENDENTE_REVISAO")
    expect(chamada?.lista.find((linha) => linha.alunoId === "d")?.status).toBe("INVALIDADO")
    expect(chamada?.lista.find((linha) => linha.alunoId === "e")?.status).toBe("COMPARECEU")
  })

  it("restringe a consulta à aula ativa do dia atual no fuso da academia", async () => {
    await carregarChamadaRapida("aula-antiga")
    expect(mocks.aula).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: "aula-antiga",
          inicio: { gte: new Date("2026-11-04T03:00:00Z"), lt: new Date("2026-11-05T03:00:00Z") },
          turma: { ativa: true, modalidade: { ativa: true } },
        },
      }),
    )
    mocks.aula.mockResolvedValue(null)
    mocks.alunos.mockClear()
    expect(await carregarChamadaRapida("aula-antiga")).toBeNull()
    expect(mocks.alunos).not.toHaveBeenCalled()
  })

  it("não busca nem devolve observações, fotos, financeiro ou tentativas de inadimplência", async () => {
    // Mesmo um mock de banco com dados extras não pode repassá-los ao painel.
    mocks.alunos.mockResolvedValue([
      { ...aluno("a"), observacoesTecnicas: "privado", fotoUrl: "privado" },
    ])
    const chamada = await carregarChamadaRapida("aula")
    const consulta = mocks.aula.mock.calls[0][0]
    expect(consulta.include).toBeUndefined()
    expect(Object.keys(consulta.select).sort()).toEqual(["checkins", "comparecimentos", "turma"])
    expect(consulta.select.checkins.select.aluno.select).toEqual({
      usuario: { select: { nome: true } },
    })
    expect(mocks.alunos.mock.calls[0][0].select).toEqual({
      id: true,
      usuario: { select: { nome: true } },
    })
    expect(chamada?.tentativasInadimplentes).toEqual([])
    for (const linha of chamada?.lista ?? []) {
      expect(linha.observacoesTecnicas).toBeNull()
      expect(linha.historicoObservacoesTecnicas).toEqual([])
    }
    expect(JSON.stringify(chamada)).not.toContain("privado")
  })
})

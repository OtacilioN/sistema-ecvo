import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  exigirGestao: vi.fn(),
  findMany: vi.fn(),
  carregarMonitoramentoAula: vi.fn(),
}))

vi.mock("@/lib/auth/dal", () => ({ exigirGestao: mocks.exigirGestao }))
vi.mock("@/lib/db", () => ({ db: { aula: { findMany: mocks.findMany } } }))
vi.mock("@/lib/services/aula-monitoramento.service", () => ({
  carregarMonitoramentoAula: mocks.carregarMonitoramentoAula,
}))
vi.mock("@/components/checkin/acoes-card-aluno", () => ({ AcoesCardAlunoCheckin: () => null }))

import Page from "./page"

describe("consulta de check-ins por data", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    // Já é dia 22 em UTC, mas ainda é dia 21 no fuso da academia.
    vi.setSystemTime(new Date("2026-10-22T01:00:00Z"))
    vi.clearAllMocks()
    mocks.exigirGestao.mockResolvedValue({ papel: "GESTOR" })
    mocks.findMany.mockResolvedValue([])
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("usa o dia atual da academia quando não há filtro", async () => {
    await Page({ searchParams: Promise.resolve({}) })

    expect(mocks.exigirGestao).toHaveBeenCalled()
    expect(mocks.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          inicio: {
            gte: new Date("2026-10-21T03:00:00Z"),
            lt: new Date("2026-10-22T03:00:00Z"),
          },
        }),
      }),
    )
  })

  it.each([
    ["2026-10-20", "2026-10-20T03:00:00Z", "2026-10-21T03:00:00Z"],
    ["2026-12-31", "2026-12-31T03:00:00Z", "2027-01-01T03:00:00Z"],
    ["2028-02-29", "2028-02-29T03:00:00Z", "2028-03-01T03:00:00Z"],
  ])("consulta apenas o dia selecionado: %s", async (data, inicio, fim) => {
    await Page({ searchParams: Promise.resolve({ data }) })

    expect(mocks.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ inicio: { gte: new Date(inicio), lt: new Date(fim) } }),
      }),
    )
  })

  it.each([
    "2026-02-30",
    "2026-13-01",
    "20/10/2026",
    "",
  ])("volta para hoje sem consultar datas inválidas: %s", async (data) => {
    await Page({ searchParams: Promise.resolve({ data }) })

    expect(mocks.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          inicio: {
            gte: new Date("2026-10-21T03:00:00Z"),
            lt: new Date("2026-10-22T03:00:00Z"),
          },
        }),
      }),
    )
  })

  it("aceita parâmetros repetidos e não carrega uma aula fora do resultado da data", async () => {
    await Page({
      searchParams: Promise.resolve({
        data: ["2026-10-20", "2026-10-21"],
        aulaId: "aula-de-outro-dia",
      }),
    })

    expect(mocks.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          inicio: {
            gte: new Date("2026-10-20T03:00:00Z"),
            lt: new Date("2026-10-21T03:00:00Z"),
          },
        }),
      }),
    )
    expect(mocks.carregarMonitoramentoAula).not.toHaveBeenCalled()
  })
})

import { renderToStaticMarkup } from "react-dom/server"
import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({ exigir: vi.fn(), saude: vi.fn(), historico: vi.fn() }))
vi.mock("@/lib/auth/dal", () => ({ exigirPapel: mocks.exigir }))
vi.mock("@/lib/db", () => ({ db: { execucaoTarefaAgendada: { findMany: mocks.historico } } }))
vi.mock("@/lib/services/monitoramento-tarefas.service", () => ({ listarSaudeTarefas: mocks.saude }))

import Page from "./page"

beforeEach(() => {
  vi.clearAllMocks()
  mocks.exigir.mockResolvedValue({ papel: "GESTOR" })
  mocks.saude.mockResolvedValue([
    {
      tarefa: "lembretes-treino",
      nome: "Lembretes de treino",
      frequencia: "A cada 15 minutos",
      saude: "EM_DIA",
      controle: { ultimoSucessoEm: new Date("2026-10-29T12:00:00Z") },
    },
  ])
  mocks.historico.mockResolvedValue([
    {
      id: "execucao-1",
      tarefa: "lembretes-treino",
      status: "CONCLUIDA",
      iniciadoEm: new Date("2026-10-29T12:00:00Z"),
      duracaoMs: 1500,
      erroSeguro: null,
      contadores: { total: 12 },
    },
  ])
})

describe("tela de tarefas automáticas", () => {
  it("exige gestor antes de consultar dados operacionais", async () => {
    mocks.exigir.mockRejectedValue(new Error("acesso negado"))
    await expect(Page()).rejects.toThrow("acesso negado")
    expect(mocks.exigir).toHaveBeenCalledWith("GESTOR")
    expect(mocks.saude).not.toHaveBeenCalled()
    expect(mocks.historico).not.toHaveBeenCalled()
  })
  it("renderiza saúde, horário da academia, duração e contadores legíveis", async () => {
    const html = renderToStaticMarkup(await Page())
    expect(html).toContain("Em dia")
    expect(html).toContain("29/10/2026 às 09:00")
    expect(html).toContain("1.5 s")
    expect(html).toContain("Total: 12")
    expect(html).not.toContain('"total":')
    expect(mocks.historico).toHaveBeenCalledWith({ orderBy: { iniciadoEm: "desc" }, take: 50 })
  })
})

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({ executar: vi.fn() }))
vi.mock("@/lib/services/tarefa-agendada.service", () => ({
  executarTarefaAgendada: mocks.executar,
}))

import { responderTarefaAgendada } from "./tarefa-agendada-http"

const request = (authorization?: string) =>
  new Request("https://ecvo.test/api/tarefas/teste", {
    headers: authorization ? { authorization } : {},
  })
beforeEach(() => {
  vi.clearAllMocks()
  vi.stubEnv("CRON_SECRET", "segredo-teste")
})
afterEach(() => vi.unstubAllEnvs())

describe("autenticação e resposta das tarefas", () => {
  it("não adquire reserva sem bearer válido ou segredo configurado", async () => {
    const trabalho = vi.fn()
    for (const token of [undefined, "Bearer errado"]) {
      expect(
        (await responderTarefaAgendada(request(token), "lembretes-treino", trabalho)).status,
      ).toBe(401)
    }
    vi.stubEnv("CRON_SECRET", "")
    expect((await responderTarefaAgendada(request(), "lembretes-treino", trabalho)).status).toBe(
      500,
    )
    expect(mocks.executar).not.toHaveBeenCalled()
    expect(trabalho).not.toHaveBeenCalled()
  })
  it("não mascara falha persistida com resultado de domínio bem sucedido", async () => {
    mocks.executar.mockResolvedValue({
      status: "FALHOU",
      resultado: { ok: true },
      erro: "Erro seguro",
    })
    const resposta = await responderTarefaAgendada(
      request("Bearer segredo-teste"),
      "lembretes-treino",
      vi.fn(),
    )
    expect(resposta.status).toBe(500)
    expect(await resposta.json()).toMatchObject({ ok: false, erro: "Erro seguro" })
  })
  it("responde 202 quando outra execução detém a reserva", async () => {
    mocks.executar.mockResolvedValue({ status: "IGNORADA", motivo: "EM_EXECUCAO" })
    const resposta = await responderTarefaAgendada(
      request("Bearer segredo-teste"),
      "lembretes-treino",
      vi.fn(),
    )
    expect(resposta.status).toBe(202)
    expect(await resposta.json()).toMatchObject({ ignorada: true })
  })
  it("preserva contadores de sucesso com a identidade da execução", async () => {
    mocks.executar.mockResolvedValue({
      status: "CONCLUIDA",
      resultado: { ok: true, total: 7 },
      execucaoId: "execucao-1",
    })
    const resposta = await responderTarefaAgendada(
      request("Bearer segredo-teste"),
      "lembretes-treino",
      vi.fn(),
    )
    expect(resposta.status).toBe(200)
    expect(await resposta.json()).toEqual({ ok: true, total: 7, execucaoId: "execucao-1" })
  })
})

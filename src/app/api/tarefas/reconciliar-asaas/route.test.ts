import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({ isencoes: vi.fn(), reativacoes: vi.fn(), asaas: vi.fn() }))
vi.mock("@/lib/services/isencao-trancamento.service", () => ({
  processarIsencoesTrancamento: mocks.isencoes,
}))
vi.mock("@/lib/services/cobranca-reativacao.service", () => ({
  reconciliarCobrancasReativacao: mocks.reativacoes,
}))
vi.mock("@/lib/services/asaas.service", () => ({ reconciliarPendenciasAsaas: mocks.asaas }))
vi.mock("@/lib/services/rotinas-agendadas.service", () => ({
  executarEtapasIndependentes: async (etapas: Record<string, () => Promise<unknown>>) => {
    const resultados = await Promise.all(
      Object.entries(etapas).map(async ([nome, fn]) => [nome, await fn()]),
    )
    return { ok: true, ...Object.fromEntries(resultados) }
  },
}))
vi.mock("@/lib/services/tarefa-agendada.service", () => ({
  executarTarefaAgendada: async ({ executar }: { executar: () => Promise<unknown> }) => ({
    status: "CONCLUIDA",
    resultado: await executar(),
    execucaoId: "teste",
  }),
}))

import { GET } from "./route"

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubEnv("CRON_SECRET", "segredo-teste")
  mocks.isencoes.mockResolvedValue({ ok: true, concluidas: 1, falhas: 0 })
  mocks.reativacoes.mockResolvedValue({ processadas: 1, concluidas: 1, falhas: 0 })
  mocks.asaas.mockResolvedValue({ ok: true })
})
afterEach(() => vi.unstubAllEnvs())

describe("recuperação financeira agendada", () => {
  it("não processa cobranças sem autenticação", async () => {
    const resposta = await GET(new Request("https://ecvo.test/api/tarefas/reconciliar-asaas"))
    expect(resposta.status).toBe(401)
    expect(mocks.isencoes).not.toHaveBeenCalled()
    expect(mocks.reativacoes).not.toHaveBeenCalled()
  })
  it("executa recuperação das isenções e reativações na rotina autorizada", async () => {
    const resposta = await GET(
      new Request("https://ecvo.test/api/tarefas/reconciliar-asaas", {
        headers: { authorization: "Bearer segredo-teste" },
      }),
    )
    expect(resposta.status).toBe(200)
    expect(mocks.isencoes).toHaveBeenCalledOnce()
    expect(mocks.reativacoes).toHaveBeenCalledOnce()
    expect(mocks.asaas).toHaveBeenCalledWith({ somenteRecuperacao: true })
  })
})

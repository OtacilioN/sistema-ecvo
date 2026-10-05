import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({ trancar: vi.fn() }))
vi.mock("@/lib/services/matricula-trancada.service", () => ({
  trancarAvulsosExpirados: mocks.trancar,
}))

import { GET } from "./route"

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubEnv("CRON_SECRET", "segredo-teste")
  mocks.trancar.mockResolvedValue({ trancados: 3 })
})
afterEach(() => vi.unstubAllEnvs())

describe("tarefa de trancamento de avulsos", () => {
  it("recusa execução sem autenticação", async () => {
    const resposta = await GET(new Request("https://ecvo.test/api/tarefas/trancar-aulas-avulsas"))
    expect(resposta.status).toBe(401)
    expect(mocks.trancar).not.toHaveBeenCalled()
  })
  it("não executa quando o segredo não está configurado", async () => {
    vi.stubEnv("CRON_SECRET", "")
    const resposta = await GET(new Request("https://ecvo.test/api/tarefas/trancar-aulas-avulsas"))
    expect(resposta.status).toBe(500)
    expect(mocks.trancar).not.toHaveBeenCalled()
  })
  it("tranca avulsos vencidos com a autenticação da tarefa agendada", async () => {
    const resposta = await GET(
      new Request("https://ecvo.test/api/tarefas/trancar-aulas-avulsas", {
        headers: { authorization: "Bearer segredo-teste" },
      }),
    )
    expect(resposta.status).toBe(200)
    expect(await resposta.json()).toEqual({ ok: true, trancados: 3 })
    expect(mocks.trancar).toHaveBeenCalledOnce()
  })
})

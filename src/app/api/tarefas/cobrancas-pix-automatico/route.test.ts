import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/services/asaas.service", () => ({
  processarCobrancasPixAutomaticoPendentes: vi.fn(),
  reconciliarPendenciasAsaas: vi.fn(),
}))

import {
  processarCobrancasPixAutomaticoPendentes,
  reconciliarPendenciasAsaas,
} from "@/lib/services/asaas.service"
import { GET } from "./route"

describe("cron de cobranças PIX Automático", () => {
  beforeEach(() => {
    vi.stubEnv("CRON_SECRET", "segredo-cron")
    vi.mocked(reconciliarPendenciasAsaas).mockResolvedValue({
      ok: true,
      pagamentosAnalisados: 0,
      pagamentosAtualizados: 0,
      autorizacoesAtualizadas: 0,
      falhasPagamentos: [],
      falhasAutorizacoes: [],
    })
    vi.mocked(processarCobrancasPixAutomaticoPendentes).mockResolvedValue({
      ok: true,
      analisadas: 0,
      criadas: 0,
      falhas: [],
    })
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.clearAllMocks()
  })

  it("falha fechado sem o bearer correto", async () => {
    const resposta = await GET(new Request("https://app.ecvo.com.br/api/tarefas/teste"))

    expect(resposta.status).toBe(401)
    expect(reconciliarPendenciasAsaas).not.toHaveBeenCalled()
    expect(processarCobrancasPixAutomaticoPendentes).not.toHaveBeenCalled()
  })

  it("executa a criação mesmo quando a reconciliação falha", async () => {
    vi.mocked(reconciliarPendenciasAsaas).mockRejectedValue(new Error("falha temporária"))

    const resposta = await GET(
      new Request("https://app.ecvo.com.br/api/tarefas/teste", {
        headers: { authorization: "Bearer segredo-cron" },
      }),
    )
    const corpo = await resposta.json()

    expect(resposta.status).toBe(500)
    expect(processarCobrancasPixAutomaticoPendentes).toHaveBeenCalledOnce()
    expect(corpo.erros).toEqual([{ etapa: "RECONCILIACAO", motivo: "falha temporária" }])
  })

  it("retorna sucesso apenas quando as duas etapas terminam sem pendências", async () => {
    const resposta = await GET(
      new Request("https://app.ecvo.com.br/api/tarefas/teste", {
        headers: { authorization: "Bearer segredo-cron" },
      }),
    )

    expect(resposta.status).toBe(200)
    expect(reconciliarPendenciasAsaas).toHaveBeenCalledOnce()
    expect(processarCobrancasPixAutomaticoPendentes).toHaveBeenCalledOnce()
  })
})

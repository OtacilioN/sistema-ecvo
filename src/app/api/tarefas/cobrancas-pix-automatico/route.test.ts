import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/services/asaas.service", () => ({
  processarCobrancasPixAutomaticoPendentes: vi.fn(),
  reconciliarPendenciasAsaas: vi.fn(),
  sincronizarCobrancasDescontoAdimplencia: vi.fn(),
}))
vi.mock("@/lib/services/financeiro.service", () => ({
  sincronizarValoresAdimplencia: vi.fn(),
}))

import {
  processarCobrancasPixAutomaticoPendentes,
  reconciliarPendenciasAsaas,
  sincronizarCobrancasDescontoAdimplencia,
} from "@/lib/services/asaas.service"
import { sincronizarValoresAdimplencia } from "@/lib/services/financeiro.service"
import { GET } from "./route"

describe("cron de cobranças PIX Automático", () => {
  beforeEach(() => {
    vi.stubEnv("CRON_SECRET", "segredo-cron")
    vi.mocked(sincronizarValoresAdimplencia).mockResolvedValue({ ok: true, atualizadas: 0 })
    vi.mocked(sincronizarCobrancasDescontoAdimplencia).mockResolvedValue({
      ok: true,
      analisadas: 0,
      canceladas: 0,
      falhas: [],
    })
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

  it("concilia, sincroniza o desconto e só então cria cobranças", async () => {
    const resposta = await GET(
      new Request("https://app.ecvo.com.br/api/tarefas/teste", {
        headers: { authorization: "Bearer segredo-cron" },
      }),
    )

    expect(resposta.status).toBe(200)
    expect(reconciliarPendenciasAsaas).toHaveBeenCalledOnce()
    expect(processarCobrancasPixAutomaticoPendentes).toHaveBeenCalledOnce()
    expect(sincronizarCobrancasDescontoAdimplencia).toHaveBeenCalledOnce()
    expect(vi.mocked(reconciliarPendenciasAsaas).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(sincronizarValoresAdimplencia).mock.invocationCallOrder[0],
    )
    expect(
      vi.mocked(sincronizarCobrancasDescontoAdimplencia).mock.invocationCallOrder[0],
    ).toBeLessThan(vi.mocked(processarCobrancasPixAutomaticoPendentes).mock.invocationCallOrder[0])
  })

  it("sinaliza falha na atualização de preço sem ocultar o resultado das outras etapas", async () => {
    vi.mocked(sincronizarCobrancasDescontoAdimplencia).mockResolvedValueOnce({
      ok: false,
      analisadas: 1,
      canceladas: 0,
      falhas: [{ cobrancaId: "cobranca-1", motivo: "Cancelamento pendente" }],
    })
    const resposta = await GET(
      new Request("https://app.ecvo.com.br/api/tarefas/teste", {
        headers: { authorization: "Bearer segredo-cron" },
      }),
    )
    expect(resposta.status).toBe(500)
    expect((await resposta.json()).erros).toEqual([
      { etapa: "ADIMPLENCIA", motivo: "Existem cobranças com preço pendente de sincronização." },
    ])
    expect(processarCobrancasPixAutomaticoPendentes).toHaveBeenCalledOnce()
  })
})

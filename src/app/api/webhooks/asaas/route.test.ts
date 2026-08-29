import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/services/asaas.service", () => ({
  processarWebhookAsaas: vi.fn().mockResolvedValue({ ok: true, duplicado: false }),
}))

import { processarWebhookAsaas } from "@/lib/services/asaas.service"
import { POST } from "./route"

const segredo = "token-webhook-asaas-com-tamanho-seguro"

function request(body: string, token = segredo, headers: Record<string, string> = {}) {
  return new Request("https://ecvo.example/api/webhooks/asaas", {
    method: "POST",
    body,
    headers: { "asaas-access-token": token, ...headers },
  })
}

describe("webhook Asaas", () => {
  beforeEach(() => {
    process.env.ASAAS_WEBHOOK_TOKEN = segredo
    vi.mocked(processarWebhookAsaas).mockClear()
  })

  afterEach(() => {
    delete process.env.ASAAS_WEBHOOK_TOKEN
  })

  it("falha fechado quando o segredo não está configurado", async () => {
    delete process.env.ASAAS_WEBHOOK_TOKEN
    expect((await POST(request("{}"))).status).toBe(500)
  })

  it("falha fechado quando o segredo não atende ao tamanho exigido pelo Asaas", async () => {
    process.env.ASAAS_WEBHOOK_TOKEN = "curto"
    expect((await POST(request("{}", "curto"))).status).toBe(500)
  })

  it("recusa token incorreto", async () => {
    expect((await POST(request("{}", "incorreto"))).status).toBe(401)
  })

  it("recusa JSON inválido e payload acima do limite", async () => {
    expect((await POST(request("{"))).status).toBe(400)
    expect(
      (await POST(request("{}", segredo, { "content-length": String(257 * 1024) }))).status,
    ).toBe(413)
  })

  it("processa evento válido sem expor detalhes", async () => {
    const evento = { id: "evt_1", event: "PAYMENT_RECEIVED", payment: { id: "pay_1" } }
    const resposta = await POST(request(JSON.stringify(evento)))

    expect(resposta.status).toBe(200)
    expect(await resposta.json()).toEqual({ received: true })
    expect(processarWebhookAsaas).toHaveBeenCalledOnce()
  })

  it("solicita reentrega quando o evento autenticado não foi processado", async () => {
    vi.mocked(processarWebhookAsaas).mockResolvedValueOnce({
      ok: false,
      duplicado: false,
      motivo: "Divergência interna que não deve ser exposta.",
    })
    const evento = { id: "evt_2", event: "PAYMENT_RECEIVED", payment: { id: "pay_2" } }

    const resposta = await POST(request(JSON.stringify(evento)))

    expect(resposta.status).toBe(500)
    expect(await resposta.json()).toEqual({ erro: "Evento não processado." })
  })

  it("responde 500 genérico quando o processamento falha", async () => {
    const erroConsole = vi.spyOn(console, "error").mockImplementation(() => undefined)
    vi.mocked(processarWebhookAsaas).mockRejectedValueOnce(new Error("falha transitória"))
    const evento = { id: "evt_3", event: "PAYMENT_RECEIVED", payment: { id: "pay_3" } }

    const resposta = await POST(request(JSON.stringify(evento)))

    expect(resposta.status).toBe(500)
    expect(await resposta.json()).toEqual({ erro: "Evento não processado." })
    expect(erroConsole).toHaveBeenCalledOnce()
    erroConsole.mockRestore()
  })
})

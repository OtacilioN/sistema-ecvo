import { describe, expect, it } from "vitest"
import { idAutorizacaoDoWebhook, webhookAsaasSchema } from "./asaas"

describe("webhook Asaas", () => {
  it("aceita campos futuros sem relaxar os identificadores usados", () => {
    const resultado = webhookAsaasSchema.parse({
      id: "evt_1",
      event: "PAYMENT_RECEIVED",
      payment: { id: "pay_1", value: 150, novoCampo: true },
      campoFuturo: "ok",
    })
    expect(resultado.payment?.id).toBe("pay_1")
  })

  it("normaliza o identificador de autorização em string ou objeto", () => {
    expect(
      idAutorizacaoDoWebhook(
        webhookAsaasSchema.parse({
          id: "evt_1",
          event: "PIX_AUTOMATIC_RECURRING_AUTHORIZATION_ACTIVATED",
          pixAutomaticAuthorization: { id: "aut_1" },
        }),
      ),
    ).toBe("aut_1")
  })
})

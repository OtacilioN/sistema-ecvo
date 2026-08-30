import { describe, expect, it } from "vitest"
import { idAutorizacaoDoWebhook, idPagamentoInstrucaoDoWebhook, webhookAsaasSchema } from "./asaas"

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

  it("aceita os campos oficiais de autorização e instrução do PIX Automático", () => {
    const autorizacao = webhookAsaasSchema.parse({
      id: "evt_aut_1",
      event: "PIX_AUTOMATIC_RECURRING_AUTHORIZATION_ACTIVATED",
      authorization: { id: "aut_1", status: "ACTIVE" },
    })
    expect(idAutorizacaoDoWebhook(autorizacao)).toBe("aut_1")

    const instrucao = webhookAsaasSchema.parse({
      id: "evt_inst_1",
      event: "PIX_AUTOMATIC_RECURRING_PAYMENT_INSTRUCTION_SCHEDULED",
      paymentInstruction: {
        id: "inst_1",
        status: "SCHEDULED",
        payment: "pay_1",
        authorization: { id: "aut_1" },
      },
    })
    expect(idAutorizacaoDoWebhook(instrucao)).toBe("aut_1")
    expect(idPagamentoInstrucaoDoWebhook(instrucao)).toBe("pay_1")

    const instrucaoComPaymentId = webhookAsaasSchema.parse({
      id: "evt_inst_2",
      event: "PIX_AUTOMATIC_RECURRING_PAYMENT_INSTRUCTION_SCHEDULED",
      paymentInstruction: {
        id: "inst_2",
        status: "SCHEDULED",
        paymentId: "pay_2",
        authorization: "aut_1",
      },
    })
    expect(idPagamentoInstrucaoDoWebhook(instrucaoComPaymentId)).toBe("pay_2")
  })
})

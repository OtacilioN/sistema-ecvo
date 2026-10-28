import { describe, expect, it } from "vitest"
import {
  ativarPixAutomaticoAlunoSchema,
  idAutorizacaoDoWebhook,
  idPagamentoInstrucaoDoWebhook,
  tipoCobrancaPixSchema,
  webhookAsaasSchema,
} from "./asaas"

describe("prazo do Pix recorrente", () => {
  it.each([3, 6, "3", "6"])("aceita a duração %s", (totalCiclos) => {
    expect(ativarPixAutomaticoAlunoSchema.parse({ totalCiclos }).totalCiclos).toBe(
      Number(totalCiclos),
    )
  })

  it.each([
    "",
    0,
    1,
    4,
    12,
    3.5,
    "trimestre",
    [3],
  ])("rejeita duração inválida %j", (totalCiclos) => {
    expect(ativarPixAutomaticoAlunoSchema.safeParse({ totalCiclos }).success).toBe(false)
  })

  it("preserva os seis meses solicitados por formulários antigos sem o campo", () => {
    expect(ativarPixAutomaticoAlunoSchema.parse({}).totalCiclos).toBe(6)
    expect(ativarPixAutomaticoAlunoSchema.parse({ totalCiclos: null }).totalCiclos).toBe(6)
  })

  it("permite a configuração trimestral também pela gestão", () => {
    expect(
      tipoCobrancaPixSchema.parse({ alunoId: "aluno-1", tipoCobrancaPix: "AUTOMATICO_TRIMESTRAL" }),
    ).toMatchObject({
      tipoCobrancaPix: "AUTOMATICO_TRIMESTRAL",
    })
  })
})

describe("webhook Asaas", () => {
  it("aceita ownerId nulo conforme o payload oficial de cobrança", () => {
    const resultado = webhookAsaasSchema.parse({
      id: "evt_split",
      event: "PAYMENT_SPLIT_DONE",
      account: { id: "conta", ownerId: null },
      payment: { id: "pay_1" },
      additionalInfo: { splitId: "split_1" },
    })
    expect(resultado.account?.ownerId).toBeNull()
    expect(resultado.additionalInfo?.splitId).toBe("split_1")
    expect(
      webhookAsaasSchema.safeParse({
        ...resultado,
        account: { id: "conta", ownerId: "" },
      }).success,
    ).toBe(false)
  })

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

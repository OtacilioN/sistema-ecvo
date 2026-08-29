import { z } from "zod"

const identificador = z.string().trim().min(1).max(255)
const referenciaPorId = z.union([identificador, z.object({ id: identificador }).passthrough()])

export const tipoCobrancaPixSchema = z.object({
  alunoId: z.string().min(1, "Selecione o aluno"),
  tipoCobrancaPix: z.enum(["MENSAL", "AUTOMATICO_SEMESTRAL"]),
})

export const gerarCobrancaPixSchema = z.object({
  mensalidadeId: z.string().min(1, "Mensalidade inválida"),
})

export const cancelarCobrancaAsaasSchema = z.object({
  cobrancaId: z.string().min(1, "Cobrança Asaas inválida"),
})

export const webhookAsaasSchema = z
  .object({
    id: identificador,
    event: identificador,
    dateCreated: z.string().optional(),
    payment: z.preprocess(
      (valor) => (typeof valor === "string" ? { id: valor } : valor),
      z
        .object({
          id: identificador,
          customer: identificador.optional(),
          billingType: identificador.optional(),
          externalReference: z.string().nullish(),
          status: z.string().optional(),
          value: z.number().nonnegative().optional(),
          refundedValue: z.number().nonnegative().nullish(),
          dueDate: z.string().optional(),
          paymentDate: z.string().nullish(),
          conciliationIdentifier: identificador.nullish(),
          pixAutomaticAuthorizationId: identificador.nullish(),
        })
        .passthrough()
        .optional(),
    ),
    // `authorization` e `paymentInstruction` são os nomes documentados atualmente pelo Asaas.
    // O alias legado é mantido para aceitar eventos já observados em homologação.
    authorization: referenciaPorId.optional(),
    pixAutomaticAuthorization: referenciaPorId.optional(),
    paymentInstruction: z
      .object({
        id: identificador,
        status: identificador,
        payment: referenciaPorId.optional(),
        paymentId: referenciaPorId.optional(),
        authorization: referenciaPorId.optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough()

export type WebhookAsaas = z.infer<typeof webhookAsaasSchema>

export function idAutorizacaoDoWebhook(webhook: WebhookAsaas): string | null {
  if (webhook.authorization) {
    return typeof webhook.authorization === "string"
      ? webhook.authorization
      : webhook.authorization.id
  }
  if (webhook.pixAutomaticAuthorization) {
    return typeof webhook.pixAutomaticAuthorization === "string"
      ? webhook.pixAutomaticAuthorization
      : webhook.pixAutomaticAuthorization.id
  }
  if (webhook.paymentInstruction?.authorization) {
    return typeof webhook.paymentInstruction.authorization === "string"
      ? webhook.paymentInstruction.authorization
      : webhook.paymentInstruction.authorization.id
  }
  return webhook.payment?.pixAutomaticAuthorizationId ?? null
}

export function idPagamentoInstrucaoDoWebhook(webhook: WebhookAsaas): string | null {
  const pagamento = webhook.paymentInstruction?.payment ?? webhook.paymentInstruction?.paymentId
  if (!pagamento) return null
  return typeof pagamento === "string" ? pagamento : pagamento.id
}

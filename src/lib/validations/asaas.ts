import { z } from "zod"

const identificador = z.string().trim().min(1).max(255)

export const tipoCobrancaPixSchema = z.object({
  alunoId: z.string().min(1, "Selecione o aluno"),
  tipoCobrancaPix: z.enum(["MENSAL", "AUTOMATICO_SEMESTRAL"]),
})

export const gerarCobrancaPixSchema = z.object({
  mensalidadeId: z.string().min(1, "Mensalidade inválida"),
})

export const webhookAsaasSchema = z
  .object({
    id: identificador,
    event: identificador,
    payment: z.preprocess(
      (valor) => (typeof valor === "string" ? { id: valor } : valor),
      z
        .object({
          id: identificador,
          customer: identificador.optional(),
          externalReference: z.string().nullish(),
          status: z.string().optional(),
          value: z.number().nonnegative().optional(),
          dueDate: z.string().optional(),
          pixAutomaticAuthorizationId: identificador.nullish(),
        })
        .passthrough()
        .optional(),
    ),
    pixAutomaticAuthorization: z
      .union([identificador, z.object({ id: identificador }).passthrough()])
      .optional(),
  })
  .passthrough()

export type WebhookAsaas = z.infer<typeof webhookAsaasSchema>

export function idAutorizacaoDoWebhook(webhook: WebhookAsaas): string | null {
  if (webhook.pixAutomaticAuthorization) {
    return typeof webhook.pixAutomaticAuthorization === "string"
      ? webhook.pixAutomaticAuthorization
      : webhook.pixAutomaticAuthorization.id
  }
  return webhook.payment?.pixAutomaticAuthorizationId ?? null
}

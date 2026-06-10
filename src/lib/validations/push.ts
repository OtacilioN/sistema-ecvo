import { z } from "zod"

export const inscricaoPushSchema = z.object({
  endpoint: z.url("Endpoint de push inválido."),
  expirationTime: z.number().nullable().optional(),
  keys: z.object({
    p256dh: z.string().min(1, "Chave pública ausente."),
    auth: z.string().min(1, "Segredo de autenticação ausente."),
  }),
})

export const removerInscricaoPushSchema = z.object({
  endpoint: z.url("Endpoint de push inválido."),
})

export type InscricaoPushInput = z.infer<typeof inscricaoPushSchema>

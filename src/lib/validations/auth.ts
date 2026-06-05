import { z } from "zod"

export const loginSchema = z.object({
  email: z.email("E-mail inválido").trim().toLowerCase(),
  senha: z.string().min(1, "Informe a senha"),
})

export type LoginInput = z.infer<typeof loginSchema>

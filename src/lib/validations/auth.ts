import { z } from "zod"
import { fotoPathnameDeUrl, pathnameFotoValido } from "@/lib/fotos"

export const loginSchema = z.object({
  email: z.email("E-mail inválido").trim().toLowerCase(),
  senha: z.string().min(1, "Informe a senha"),
})

export type LoginInput = z.infer<typeof loginSchema>

const novaSenhaSchema = z.string().min(6, "Senha de no mínimo 6 caracteres")

export const alterarMinhaSenhaSchema = z
  .object({
    senhaAtual: z.string().min(1, "Informe a senha atual"),
    novaSenha: novaSenhaSchema,
    confirmarSenha: z.string().min(1, "Confirme a nova senha"),
  })
  .superRefine((dados, ctx) => {
    if (dados.novaSenha !== dados.confirmarSenha) {
      ctx.addIssue({
        code: "custom",
        message: "As senhas não conferem",
        path: ["confirmarSenha"],
      })
    }
    if (dados.senhaAtual === dados.novaSenha) {
      ctx.addIssue({
        code: "custom",
        message: "A nova senha deve ser diferente da senha atual",
        path: ["novaSenha"],
      })
    }
  })
export type AlterarMinhaSenhaInput = z.infer<typeof alterarMinhaSenhaSchema>

export const redefinirSenhaUsuarioSchema = z
  .object({
    usuarioId: z.string().min(1, "Selecione o usuário"),
    novaSenha: novaSenhaSchema,
    confirmarSenha: z.string().min(1, "Confirme a nova senha"),
  })
  .refine((dados) => dados.novaSenha === dados.confirmarSenha, {
    message: "As senhas não conferem",
    path: ["confirmarSenha"],
  })
export type RedefinirSenhaUsuarioInput = z.infer<typeof redefinirSenhaUsuarioSchema>

const fotoUrlOpcional = z
  .union([
    z.url("Informe uma URL válida"),
    z.string().refine((url) => {
      const pathname = fotoPathnameDeUrl(url)
      return Boolean(pathname && pathnameFotoValido(pathname))
    }, "Informe uma foto válida"),
    z.literal(""),
    z.null(),
    z.undefined(),
  ])
  .transform((v) => (typeof v === "string" && v.length > 0 ? v : null))

export const atualizarMinhaFotoSchema = z.object({
  fotoUrl: fotoUrlOpcional,
})
export type AtualizarMinhaFotoInput = z.infer<typeof atualizarMinhaFotoSchema>

export const atualizarFotoUsuarioSchema = atualizarMinhaFotoSchema.extend({
  usuarioId: z.string().min(1, "Selecione o usuário"),
})
export type AtualizarFotoUsuarioInput = z.infer<typeof atualizarFotoUsuarioSchema>

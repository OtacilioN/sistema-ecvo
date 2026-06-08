import { describe, expect, it } from "vitest"
import { alterarMinhaSenhaSchema, redefinirSenhaUsuarioSchema } from "./auth"

describe("alterarMinhaSenhaSchema", () => {
  it("aceita troca de senha própria válida", () => {
    const resultado = alterarMinhaSenhaSchema.safeParse({
      senhaAtual: "senha-atual",
      novaSenha: "nova-senha",
      confirmarSenha: "nova-senha",
    })

    expect(resultado.success).toBe(true)
  })

  it("rejeita confirmação divergente", () => {
    const resultado = alterarMinhaSenhaSchema.safeParse({
      senhaAtual: "senha-atual",
      novaSenha: "nova-senha",
      confirmarSenha: "outra-senha",
    })

    expect(resultado.success).toBe(false)
  })

  it("rejeita senha nova igual à atual", () => {
    const resultado = alterarMinhaSenhaSchema.safeParse({
      senhaAtual: "mesma-senha",
      novaSenha: "mesma-senha",
      confirmarSenha: "mesma-senha",
    })

    expect(resultado.success).toBe(false)
  })
})

describe("redefinirSenhaUsuarioSchema", () => {
  it("aceita redefinição administrativa válida", () => {
    const resultado = redefinirSenhaUsuarioSchema.safeParse({
      usuarioId: "usuario-1",
      novaSenha: "nova-senha",
      confirmarSenha: "nova-senha",
    })

    expect(resultado.success).toBe(true)
  })

  it("exige usuário alvo", () => {
    const resultado = redefinirSenhaUsuarioSchema.safeParse({
      usuarioId: "",
      novaSenha: "nova-senha",
      confirmarSenha: "nova-senha",
    })

    expect(resultado.success).toBe(false)
  })
})

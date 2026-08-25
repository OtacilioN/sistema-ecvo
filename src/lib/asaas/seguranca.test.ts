import { describe, expect, it } from "vitest"
import { mensagemErroAsaasSegura, tokenWebhookValido } from "./seguranca"

describe("segurança Asaas", () => {
  it("compara o token sem aceitar ausente ou prefixo", () => {
    expect(
      tokenWebhookValido("segredo-com-32-caracteres-123456", "segredo-com-32-caracteres-123456"),
    ).toBe(true)
    expect(tokenWebhookValido("segredo", "segredo-com-32-caracteres-123456")).toBe(false)
    expect(tokenWebhookValido(null, "segredo-com-32-caracteres-123456")).toBe(false)
  })

  it("remove chaves e documentos de mensagens persistidas", () => {
    expect(
      mensagemErroAsaasSegura(new Error("token $aact_hmlg_segredissimo CPF 12345678901 inválido")),
    ).toBe("token [CHAVE_ASAAS_OCULTA] CPF [DOCUMENTO_OCULTO] inválido")
  })
})

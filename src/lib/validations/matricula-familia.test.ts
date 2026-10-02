import { describe, expect, it } from "vitest"
import { solicitacaoMatriculaFamiliaSchema } from "./matricula-familia"

const cpfs = ["52998224725", "11144477735", "12345678909", "98765432100"]
const pessoa = (indice: number) => ({
  nome: `Pessoa ${indice + 1}`,
  email: `pessoa${indice}@exemplo.com`,
  cpf: cpfs[indice],
  senha: "123456",
  confirmarSenha: "123456",
  modalidadeIds: ["jiu"],
  tipoPagamento: "MENSALISTA",
  beneficioAtivoDeclarado: false,
  aceiteDados: "on",
})

describe("solicitacaoMatriculaFamiliaSchema", () => {
  it.each([2, 3, 4])("aceita %i pessoas com identidades próprias", (quantidade) => {
    expect(
      solicitacaoMatriculaFamiliaSchema.safeParse({
        pessoas: Array.from({ length: quantidade }, (_, indice) => pessoa(indice)),
      }).success,
    ).toBe(true)
  })

  it.each([0, 1, 5])("recusa %i pessoas", (quantidade) => {
    expect(
      solicitacaoMatriculaFamiliaSchema.safeParse({
        pessoas: Array.from({ length: quantidade }, (_, indice) => pessoa(indice % 4)),
      }).success,
    ).toBe(false)
  })

  it("recusa e-mails repetidos após normalizar espaços e caixa", () => {
    const resultado = solicitacaoMatriculaFamiliaSchema.safeParse({
      pessoas: [pessoa(0), { ...pessoa(1), email: " PESSOA0@EXEMPLO.COM " }],
    })
    expect(resultado.success).toBe(false)
    if (!resultado.success) {
      expect(resultado.error.issues).toEqual(
        expect.arrayContaining([expect.objectContaining({ path: ["pessoas", 1, "email"] })]),
      )
    }
  })

  it("recusa CPFs repetidos após remover pontuação", () => {
    const resultado = solicitacaoMatriculaFamiliaSchema.safeParse({
      pessoas: [pessoa(0), { ...pessoa(1), cpf: "529.982.247-25" }],
    })
    expect(resultado.success).toBe(false)
    if (!resultado.success) {
      expect(resultado.error.issues).toEqual(
        expect.arrayContaining([expect.objectContaining({ path: ["pessoas", 1, "cpf"] })]),
      )
    }
  })

  it("recusa benefício externo e mais de uma modalidade por pessoa", () => {
    expect(
      solicitacaoMatriculaFamiliaSchema.safeParse({
        pessoas: [
          pessoa(0),
          { ...pessoa(1), tipoPagamento: "WELLHUB", beneficioAtivoDeclarado: true },
        ],
      }).success,
    ).toBe(false)
    expect(
      solicitacaoMatriculaFamiliaSchema.safeParse({
        pessoas: [pessoa(0), { ...pessoa(1), modalidadeIds: ["jiu", "boxe"] }],
      }).success,
    ).toBe(false)
  })

  it("permite revalidar saída normalizada sem perder validação individual", () => {
    const dados = solicitacaoMatriculaFamiliaSchema.parse({ pessoas: [pessoa(0), pessoa(1)] })
    expect(solicitacaoMatriculaFamiliaSchema.parse(dados)).toEqual(dados)
    expect(
      solicitacaoMatriculaFamiliaSchema.safeParse({
        pessoas: [pessoa(0), { ...pessoa(1), confirmarSenha: "diferente" }],
      }).success,
    ).toBe(false)
  })
})

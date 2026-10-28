import { describe, expect, it } from "vitest"
import { planoEdicaoSchema, planoExclusaoSchema, planoSchema } from "./financeiro"

describe("planoSchema", () => {
  const planoBase = {
    nome: "Plano mensal",
    valor: "187.53",
    valorBase: "207.53",
    periodicidade: "MENSAL",
    limiteAulas: null,
    padrao: false,
  }

  it.each([1, 2, 3])("aceita associação com %i modalidade(s) na matrícula", (quantidade) => {
    expect(
      planoSchema.parse({
        ...planoBase,
        quantidadeModalidadesMatricula: String(quantidade),
      }).quantidadeModalidadesMatricula,
    ).toBe(quantidade)
  })

  it("normaliza associação vazia e rejeita quantidade fora do limite", () => {
    expect(
      planoSchema.parse({ ...planoBase, quantidadeModalidadesMatricula: "" })
        .quantidadeModalidadesMatricula,
    ).toBeNull()
    expect(
      planoSchema.safeParse({ ...planoBase, quantidadeModalidadesMatricula: "4" }).success,
    ).toBe(false)
  })

  it("aceita preços iguais para um plano sem desconto", () => {
    expect(planoSchema.parse({ ...planoBase, valorBase: planoBase.valor }).valorBase).toBe(187.53)
  })

  it.each([
    undefined,
    null,
    "",
    "0",
    "-1",
    "187.52",
  ])("rejeita valor base ausente, não positivo ou menor que o valor com desconto: %s", (valorBase) => {
    expect(planoSchema.safeParse({ ...planoBase, valorBase }).success).toBe(false)
  })

  it("também impede editar um plano com desconto maior que o valor base", () => {
    const resultado = planoEdicaoSchema.safeParse({
      ...planoBase,
      planoId: "plano-1",
      ativo: "true",
      valorBase: "180",
    })

    expect(resultado.success).toBe(false)
    if (!resultado.success) expect(resultado.error.issues[0]?.path).toEqual(["valorBase"])
  })
})

describe("planoExclusaoSchema", () => {
  it("aceita plano sem destino quando o campo não existe no FormData", () => {
    const parsed = planoExclusaoSchema.parse({
      planoId: "plano-1",
      planoDestinoId: null,
    })

    expect(parsed).toEqual({
      planoId: "plano-1",
      planoDestinoId: null,
    })
  })

  it("normaliza destino vazio como ausente", () => {
    const parsed = planoExclusaoSchema.parse({
      planoId: "plano-1",
      planoDestinoId: "",
    })

    expect(parsed.planoDestinoId).toBeNull()
  })
})

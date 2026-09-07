import { describe, expect, it } from "vitest"
import { planoExclusaoSchema, planoSchema } from "./financeiro"

describe("planoSchema", () => {
  const planoBase = {
    nome: "Plano mensal",
    valor: "187.53",
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

import { describe, expect, it } from "vitest"
import { planoExclusaoSchema } from "./financeiro"

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

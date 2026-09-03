import { describe, expect, it } from "vitest"
import {
  planoCompativelComAulaAvulsa,
  situacaoConversaoAulaAvulsa,
  VALOR_AULA_AVULSA,
  VALOR_COMPLEMENTO_AULA_AVULSA,
  VALOR_MENSALIDADE_AULA_AVULSA,
} from "./aula-avulsa"

describe("aula avulsa", () => {
  const inicioAula = new Date("2026-09-05T12:00:00.000Z")

  it("mantém o acordo financeiro fixo em R$ 20 + R$ 80 = R$ 100", () => {
    expect(VALOR_AULA_AVULSA + VALOR_COMPLEMENTO_AULA_AVULSA).toBe(VALOR_MENSALIDADE_AULA_AVULSA)
    expect(planoCompativelComAulaAvulsa(100)).toBe(true)
    expect(planoCompativelComAulaAvulsa(99.99)).toBe(false)
  })

  it("libera a conversão somente na semana civil da aula", () => {
    expect(
      situacaoConversaoAulaAvulsa({
        inicioAula,
        agora: new Date("2026-08-31T02:59:59.999Z"),
      }),
    ).toBe("AGUARDANDO_SEMANA")
    expect(
      situacaoConversaoAulaAvulsa({
        inicioAula,
        agora: new Date("2026-08-31T03:00:00.000Z"),
      }),
    ).toBe("DISPONIVEL")
    expect(
      situacaoConversaoAulaAvulsa({
        inicioAula,
        agora: new Date("2026-09-07T03:00:00.000Z"),
      }),
    ).toBe("EXPIRADA")
  })
})

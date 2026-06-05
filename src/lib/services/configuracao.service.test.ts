import { describe, expect, it } from "vitest"
import { resolverRegrasTreino } from "./configuracao.service"

describe("resolverRegrasTreino", () => {
  const global = {
    janelaComparecimentoHoras: 24,
    prazoCancelamentoHoras: 2,
    exigirComparecimentoParaCheckin: false,
    politicaCheckinSemComparecimento: "PERMITIR" as const,
    listaEsperaAtiva: false,
  }

  it("herda regras globais quando a modalidade não define override", () => {
    expect(
      resolverRegrasTreino(global, {
        janelaComparecimentoHoras: null,
        prazoCancelamentoHoras: null,
        exigirComparecimentoParaCheckin: null,
        politicaCheckinSemComparecimento: null,
        listaEsperaAtiva: null,
      }),
    ).toEqual(global)
  })

  it("prioriza overrides da modalidade", () => {
    expect(
      resolverRegrasTreino(global, {
        janelaComparecimentoHoras: 6,
        prazoCancelamentoHoras: 1,
        exigirComparecimentoParaCheckin: true,
        politicaCheckinSemComparecimento: "APENAS_COM_APROVACAO",
        listaEsperaAtiva: true,
      }),
    ).toEqual({
      janelaComparecimentoHoras: 6,
      prazoCancelamentoHoras: 1,
      exigirComparecimentoParaCheckin: true,
      politicaCheckinSemComparecimento: "APENAS_COM_APROVACAO",
      listaEsperaAtiva: true,
    })
  })
})

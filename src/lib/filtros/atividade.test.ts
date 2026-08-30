import { describe, expect, it } from "vitest"
import { correspondeFiltroAtividade, FILTRO_ATIVIDADE_PADRAO } from "@/lib/filtros/atividade"

describe("filtro de atividade", () => {
  it("usa somente registros ativos como padrão", () => {
    expect(FILTRO_ATIVIDADE_PADRAO).toBe("ATIVAS")
    expect(correspondeFiltroAtividade(true, FILTRO_ATIVIDADE_PADRAO)).toBe(true)
    expect(correspondeFiltroAtividade(false, FILTRO_ATIVIDADE_PADRAO)).toBe(false)
  })

  it("permite mostrar somente inativos ou todos", () => {
    expect(correspondeFiltroAtividade(true, "INATIVAS")).toBe(false)
    expect(correspondeFiltroAtividade(false, "INATIVAS")).toBe(true)
    expect(correspondeFiltroAtividade(true, "TODAS")).toBe(true)
    expect(correspondeFiltroAtividade(false, "TODAS")).toBe(true)
  })
})

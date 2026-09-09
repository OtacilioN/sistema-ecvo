import { describe, expect, it } from "vitest"
import { NAV_GESTOR, NAV_LOJA } from "./navs"

describe("navegação da loja", () => {
  it("não expõe o painel da loja no menu do gestor", () => {
    expect(NAV_GESTOR.some((item) => item.href.startsWith("/loja"))).toBe(false)
  })

  it("mantém uma navegação exclusiva para a loja", () => {
    expect(NAV_LOJA.map((item) => item.href)).toEqual(["/loja/painel"])
  })
})

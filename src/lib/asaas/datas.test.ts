import { describe, expect, it } from "vitest"
import { interpretarDataAsaas } from "@/lib/asaas/datas"

describe("datas retornadas pelo Asaas", () => {
  it("interpreta data sem offset no fuso da academia", () => {
    expect(interpretarDataAsaas("2026-08-31 21:13:00")?.toISOString()).toBe(
      "2026-09-01T00:13:00.000Z",
    )
  })

  it("preserva o instante quando o offset é explícito", () => {
    expect(interpretarDataAsaas("2026-08-31T21:13:00-03:00")?.toISOString()).toBe(
      "2026-09-01T00:13:00.000Z",
    )
  })

  it("rejeita data inválida", () => {
    expect(interpretarDataAsaas("data inválida")).toBeNull()
  })
})

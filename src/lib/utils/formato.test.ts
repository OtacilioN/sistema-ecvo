import { describe, expect, it } from "vitest"
import { cpfValido, formatarBRL, formatarCPF } from "./formato"

describe("cpfValido", () => {
  it("aceita CPF válido", () => {
    expect(cpfValido("390.533.447-05")).toBe(true)
    expect(cpfValido("39053344705")).toBe(true)
  })
  it("rejeita CPF inválido ou repetido", () => {
    expect(cpfValido("111.111.111-11")).toBe(false)
    expect(cpfValido("123")).toBe(false)
    expect(cpfValido("39053344700")).toBe(false)
  })
})

describe("formatarCPF", () => {
  it("aplica máscara", () => {
    expect(formatarCPF("39053344705")).toBe("390.533.447-05")
  })
})

describe("formatarBRL", () => {
  it("formata em reais", () => {
    expect(formatarBRL(199.9)).toContain("199,90")
    expect(formatarBRL(199.9)).toContain("R$")
  })
})

import { describe, expect, it } from "vitest"
import { formatarDataCivilInput } from "@/lib/utils/datas"
import { contaAsaasProfessorSchema } from "./conta-asaas-professor"

const dadosValidos = {
  nomeTitular: "Marcus Vinicius de Oliveira Ferreira",
  emailContaAsaas: "TREINADOR@EXEMPLO.COM",
  cpfCnpj: "133.535.297-05",
  dataNascimento: "1991-01-29",
  celular: "(21) 98152-3409",
  rendaMensal: "3000",
  logradouro: "Rua Poeta Antônio Pereira Sobrinho",
  numeroEndereco: "150",
  complemento: "Ap 102F",
  bairro: "Gramame",
  cep: "58068-448",
  consentimento: "on",
}

describe("contaAsaasProfessorSchema", () => {
  it("normaliza todos os dados exigidos para uma subconta de pessoa física", () => {
    const dados = contaAsaasProfessorSchema.parse(dadosValidos)

    expect(dados).toMatchObject({
      emailContaAsaas: "treinador@exemplo.com",
      cpfCnpj: "13353529705",
      celular: "21981523409",
      rendaMensal: 3000,
      cep: "58068448",
    })
    expect(formatarDataCivilInput(dados.dataNascimento)).toBe("1991-01-29")
  })

  it("aceita complemento vazio sem transformá-lo em dado cadastral", () => {
    expect(
      contaAsaasProfessorSchema.parse({ ...dadosValidos, complemento: "" }).complemento,
    ).toBeNull()
  })

  it.each([
    "3.000",
    "3.000,00",
    "3000",
    "3000.00",
  ])("interpreta %s como três mil reais", (rendaMensal) => {
    expect(contaAsaasProfessorSchema.parse({ ...dadosValidos, rendaMensal }).rendaMensal).toBe(3000)
  })

  it.each([
    ["cpfCnpj", "111.111.111-11"],
    ["celular", "123"],
    ["cep", "58068"],
    ["rendaMensal", "0"],
    ["consentimento", null],
  ])("rejeita %s inválido ou ausente", (campo, valor) => {
    expect(contaAsaasProfessorSchema.safeParse({ ...dadosValidos, [campo]: valor }).success).toBe(
      false,
    )
  })
})

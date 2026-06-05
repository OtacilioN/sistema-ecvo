import { describe, expect, it } from "vitest"
import {
  classificarConciliacao,
  identificarAluno,
  normalizarLinha,
  parseCsv,
  parseXlsx,
} from "./conciliacao.service"

describe("parseCsv", () => {
  it("lê CSV com vírgula e aspas", () => {
    const linhas = parseCsv('nome,email,data\n"Ana Silva",ana@ecvo.com.br,10/06/2026')
    expect(linhas).toEqual([{ nome: "Ana Silva", email: "ana@ecvo.com.br", data: "10/06/2026" }])
  })
})

describe("parseXlsx", () => {
  it("lê XLSX pela primeira aba", async () => {
    const arquivo = Buffer.from(
      "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",
      "base64",
    )

    await expect(parseXlsx(arquivo)).resolves.toEqual([
      { nome: "Ana Silva", email: "ana@ecvo.com.br", data: "10/06/2026", hora: "19:15" },
    ])
  })
})

describe("identificarAluno", () => {
  const alunos = [
    {
      id: "1",
      cpf: "11122233344",
      email: "ana@ecvo.com.br",
      nome: "Ana Silva",
      telefone: "85999990000",
      idExterno: "WH-1",
    },
  ]

  it("prioriza CPF antes dos demais identificadores", () => {
    const linha = normalizarLinha({
      cpf: "111.222.333-44",
      email: "outra@ecvo.com.br",
      nome: "Outra Pessoa",
      repasse: "R$ 37,50",
    })
    expect(identificarAluno(linha, alunos)?.id).toBe("1")
    expect(linha.valorRepasse).toBe(37.5)
  })
})

describe("classificarConciliacao", () => {
  const aluno = {
    id: "1",
    cpf: null,
    email: "ana@ecvo.com.br",
    nome: "Ana Silva",
    telefone: null,
    idExterno: null,
  }

  it("concilia check-in válido", () => {
    expect(
      classificarConciliacao({
        aluno,
        checkins: [
          { id: "checkin-1", status: "VALIDO", aula: { inicio: new Date("2026-06-10T19:00:00Z") } },
        ],
        horarioReferencia: "19:15",
        duplicadoPlanilha: false,
      }),
    ).toEqual({ status: "CONCILIADO", checkinId: "checkin-1" })
  })

  it("marca check-in invalidado como divergência", () => {
    expect(
      classificarConciliacao({
        aluno,
        checkins: [
          {
            id: "checkin-1",
            status: "INVALIDADO",
            aula: { inicio: new Date("2026-06-10T19:00:00Z") },
          },
        ],
        horarioReferencia: null,
        duplicadoPlanilha: false,
      }),
    ).toEqual({ status: "CHECKIN_INVALIDADO", checkinId: "checkin-1" })
  })

  it("mantém check-in pendente como conciliação pendente", () => {
    expect(
      classificarConciliacao({
        aluno,
        checkins: [
          {
            id: "checkin-1",
            status: "PENDENTE_REVISAO",
            aula: { inicio: new Date("2026-06-10T19:00:00Z") },
          },
        ],
        horarioReferencia: null,
        duplicadoPlanilha: false,
      }),
    ).toEqual({ status: "PENDENTE", checkinId: "checkin-1" })
  })
})

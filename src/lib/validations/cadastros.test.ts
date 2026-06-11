import { describe, expect, it } from "vitest"
import { formatarData } from "@/lib/utils/datas"
import {
  dadosAlunoSchema,
  dadosTurmaSchema,
  meusDadosAlunoSchema,
  turmaRecorrenteSchema,
} from "./cadastros"

const turmaValida = {
  modalidadeId: "modalidade-1",
  professorId: "",
  nome: "Kickboxing 20h",
  horaInicio: "20:00",
  horaFim: "21:00",
  capacidade: "0",
  local: "",
  nivel: "",
}

describe("turmaRecorrenteSchema", () => {
  it("aceita múltiplos dias da semana", () => {
    const parsed = turmaRecorrenteSchema.parse({
      ...turmaValida,
      diasSemana: ["1", "3", "5", "3"],
    })

    expect(parsed.diasSemana).toEqual([1, 3, 5])
  })

  it("exige ao menos um dia da semana", () => {
    const parsed = turmaRecorrenteSchema.safeParse({
      ...turmaValida,
      diasSemana: [],
    })

    expect(parsed.success).toBe(false)
  })
})

describe("dadosTurmaSchema", () => {
  it("aceita edição dos dados e da grade da turma", () => {
    const parsed = dadosTurmaSchema.parse({
      ...turmaValida,
      turmaId: "turma-1",
      diasSemana: ["1", "3", "5"],
      ativa: "true",
    })

    expect(parsed).toMatchObject({
      turmaId: "turma-1",
      modalidadeId: "modalidade-1",
      diasSemana: [1, 3, 5],
      horaInicio: "20:00",
      horaFim: "21:00",
      ativa: true,
    })
  })
})

describe("dadosAlunoSchema", () => {
  it("interpreta nascimento e início como datas civis da academia", () => {
    const parsed = dadosAlunoSchema.parse({
      alunoId: "aluno-1",
      nome: "Otacilio Maia",
      tipo: "MENSALISTA",
      status: "ATIVO",
      fotoUrl: "",
      dataNascimento: "1996-12-14",
      dataInicio: "2026-06-10",
      modalidadeIds: ["modalidade-1"],
      cobrancasModalidades: [],
    })

    expect(formatarData(parsed.dataNascimento as Date)).toBe("14/12/1996")
    expect(formatarData(parsed.dataInicio as Date)).toBe("10/06/2026")
  })
})

describe("meusDadosAlunoSchema", () => {
  it("normaliza dados pessoais editáveis pelo aluno", () => {
    const parsed = meusDadosAlunoSchema.parse({
      nome: "  Aluno ECVO  ",
      email: "ALUNO@ECVO.COM.BR",
      cpf: "390.533.447-05",
      telefone: "  (85) 99999-0000  ",
      dataNascimento: "1996-12-14",
      endereco: "  Rua A  ",
      contatoEmergencia: "",
      restricoesMedicas: "  Asma  ",
      responsavel: {
        nome: "Responsável",
        cpf: "",
        telefone: "",
        email: "",
        grauParentesco: "Pai",
        responsavelFinanceiro: true,
      },
    })

    expect(parsed).toMatchObject({
      nome: "Aluno ECVO",
      email: "aluno@ecvo.com.br",
      cpf: "39053344705",
      telefone: "(85) 99999-0000",
      endereco: "Rua A",
      contatoEmergencia: null,
      restricoesMedicas: "Asma",
      responsavel: {
        cpf: null,
        email: null,
        telefone: null,
        responsavelFinanceiro: true,
      },
    })
    expect(formatarData(parsed.dataNascimento as Date)).toBe("14/12/1996")
  })
})

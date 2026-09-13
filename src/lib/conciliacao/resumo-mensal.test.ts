import { describe, expect, it } from "vitest"
import { consolidarResumoMensal } from "./resumo-mensal"

function registro(id: string, valorRepasse: number, conta: string, competencia = "2026-08") {
  return {
    id,
    alunoId: "aluno1" as string | null,
    nome: "Nome da planilha",
    idExterno: "123" as string | null,
    valorRepasse,
    totalCheckins: 2,
    statusConciliacao: "CONCILIADO",
    aluno: { usuario: { nome: "Maria" } } as { usuario: { nome: string } } | null,
    importacao: {
      plataforma: "WELLHUB" as "WELLHUB" | "TOTALPASS",
      competencia,
      unidadeExternaId: conta,
      unidadeExternaNome: conta,
      arquivo: `${conta}.xlsx`,
    },
  }
}

describe("consolidação mensal exibida", () => {
  it("separa plataformas e preserva CPF TotalPass com zero inicial e check-ins ausentes", () => {
    const wellhub = registro("wh", 100, "conta1")
    const totalpass = {
      ...registro("tp", 30.39, "TOTALPASS_MENSAL"),
      cpf: "01234567890",
      idExterno: null,
      totalCheckins: null,
      importacao: { ...wellhub.importacao, plataforma: "TOTALPASS" as const },
    }
    const grupos = consolidarResumoMensal([wellhub, totalpass])
    expect(grupos).toHaveLength(2)
    const tp = grupos.find((g) => g.plataforma === "TOTALPASS")
    expect(tp).toMatchObject({ receitaCentavos: 3039, checkinsInformados: false })
    expect([...tp!.documentos]).toEqual(["01234567890"])
  })
  it("soma contas em centavos por aluno, mantendo os meses separados", () => {
    const grupos = consolidarResumoMensal([
      registro("1", 120.1, "conta1"),
      registro("2", 79.9, "conta2"),
      registro("3", 10, "conta1", "2026-09"),
    ])
    expect(grupos).toHaveLength(2)
    const agosto = grupos.find((grupo) => grupo.competencia === "2026-08")
    expect(agosto).toMatchObject({ receitaCentavos: 20000, totalCheckins: 4, nome: "Maria" })
    expect(agosto?.contas.size).toBe(2)
  })

  it("mantém receita zero e agrupa aluno não identificado por ID consistente", () => {
    const linhas = [registro("1", 0, "conta1"), registro("2", 0, "conta2")].map((linha) => ({
      ...linha,
      alunoId: null,
      aluno: null,
    }))
    const grupos = consolidarResumoMensal(linhas)
    expect(grupos).toHaveLength(1)
    expect(grupos[0]).toMatchObject({ receitaCentavos: 0, alunoId: null, nome: "Nome da planilha" })
    expect(grupos[0].contas.size).toBe(2)
  })

  it("não une homônimos sem identificação externa ou vínculo", () => {
    const linhas = [registro("1", 10, "conta1"), registro("2", 20, "conta2")].map((linha) => ({
      ...linha,
      alunoId: null,
      aluno: null,
      idExterno: null,
    }))
    expect(consolidarResumoMensal(linhas)).toHaveLength(2)
  })

  it("soma o mesmo ID entre contas mesmo durante a identificação manual de uma das linhas", () => {
    const pendente = { ...registro("1", 80, "conta1"), alunoId: null, aluno: null }
    const grupos = consolidarResumoMensal([pendente, registro("2", 120, "conta2")])
    expect(grupos).toHaveLength(1)
    expect(grupos[0]).toMatchObject({ receitaCentavos: 20000, nome: "Maria", alunoId: "aluno1" })
  })
})

import type { StatusMensalidade } from "@prisma/client"
import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  mensalidade: { findMany: vi.fn(), groupBy: vi.fn(), aggregate: vi.fn() },
  transaction: vi.fn(),
}))
vi.mock("@/lib/db", () => ({
  db: { mensalidade: mocks.mensalidade, $transaction: mocks.transaction },
}))

import {
  classificarEvolucaoPagantes,
  competenciaAtualPagantes,
  competenciaPadraoPagantes,
  consultarEvolucaoPagantes,
  deslocarCompetencia,
  type RegistroMensalidadePagante,
  rotularCompetencia,
  validarCompetencia,
} from "./evolucao-pagantes.service"

function mensalidade(
  alunoId: string,
  competencia: string,
  status: StatusMensalidade = "PAGA",
  nome = alunoId,
): RegistroMensalidadePagante {
  return { alunoId, competencia, status, nome }
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.mensalidade.findMany.mockResolvedValue([])
  mocks.mensalidade.groupBy.mockResolvedValue([])
  mocks.mensalidade.aggregate.mockResolvedValue({ _min: { competencia: null } })
  mocks.transaction.mockImplementation((operacoes: Promise<unknown>[]) => Promise.all(operacoes))
})

describe("evolução mensal da base pagante", () => {
  it("reconcilia saídas, recorrentes, novos e retornos sem contar isenção", () => {
    const registros = [
      mensalidade("recorrente", "2026-09"),
      mensalidade("recorrente", "2026-10"),
      mensalidade("saida-isenta", "2026-09"),
      mensalidade("saida-isenta", "2026-10", "ISENTA"),
      mensalidade("saida-sem-mensalidade", "2026-09"),
      mensalidade("novo", "2026-10"),
      mensalidade("retorno", "2026-08"),
      mensalidade("retorno", "2026-09", "ISENTA"),
      mensalidade("retorno", "2026-10"),
      mensalidade("nao-pagou", "2026-09", "ISENTA"),
      mensalidade("nao-pagou", "2026-10", "ISENTA"),
    ]
    const { resumo, listas } = classificarEvolucaoPagantes(registros, "2026-10")
    expect(resumo).toEqual({
      pagantesAnterior: 3,
      pagantesAtual: 3,
      saidas: 2,
      recorrentes: 1,
      novos: 1,
      retornos: 1,
      entradas: 2,
      saldo: 0,
      retencao: (1 / 3) * 100,
    })
    expect(listas.saidas.map((aluno) => aluno.situacaoAtual)).toEqual(["ISENTA", "SEM_MENSALIDADE"])
    expect(listas.retornos[0]).toMatchObject({
      id: "retorno",
      situacaoAnterior: "ISENTA",
      primeiraCompetenciaPaga: "2026-08",
    })
  })

  it.each([
    "ISENTA",
    "EM_ABERTO",
    "VENCIDA",
    "CANCELADA",
  ] as const)("%s não compõe a base pagante", (status) => {
    const resultado = classificarEvolucaoPagantes(
      [mensalidade("aluno", "2026-09", status), mensalidade("aluno", "2026-10")],
      "2026-10",
    )
    expect(resultado.resumo.pagantesAnterior).toBe(0)
    expect(resultado.resumo.novos).toBe(1)
    expect(resultado.resumo.retencao).toBeNull()
  })

  it("considera retorno quem já pagou antes da janela de tendência", () => {
    const { resumo, listas } = classificarEvolucaoPagantes(
      [mensalidade("antigo", "2026-10")],
      "2026-10",
      new Map([["antigo", "2024-01"]]),
    )
    expect(resumo.novos).toBe(0)
    expect(resumo.retornos).toBe(1)
    expect(listas.retornos[0].primeiraCompetenciaPaga).toBe("2024-01")
  })

  it("usa ID do aluno, mantém homônimos e ignora competências futuras", () => {
    const { resumo, listas } = classificarEvolucaoPagantes(
      [
        mensalidade("id-1", "2026-09", "PAGA", "Ana"),
        mensalidade("id-1", "2026-10", "PAGA", "Ana"),
        mensalidade("id-2", "2026-10", "PAGA", "Ana"),
        mensalidade("futuro", "2026-11"),
      ],
      "2026-10",
    )
    expect(resumo.pagantesAtual).toBe(2)
    expect(listas.recorrentes[0].id).toBe("id-1")
    expect(listas.novos[0].id).toBe("id-2")
  })

  it("compara janeiro com dezembro e não transforma ausência de base em retenção zero", () => {
    const resultado = classificarEvolucaoPagantes(
      [mensalidade("aluno", "2026-12"), mensalidade("aluno", "2027-01")],
      "2027-01",
    )
    expect(resultado.resumo.retencao).toBe(100)
    const vazio = classificarEvolucaoPagantes([], "2027-01")
    expect(vazio.resumo.retencao).toBeNull()
    expect(vazio.resumo.pagantesAtual).toBe(0)
  })
})

describe("competências do relatório", () => {
  it("usa o último mês encerrado no horário de Fortaleza", () => {
    const antesDaViradaLocal = new Date("2027-01-01T02:59:59Z")
    expect(competenciaAtualPagantes(antesDaViradaLocal)).toBe("2026-12")
    expect(competenciaPadraoPagantes(antesDaViradaLocal)).toBe("2026-11")
    expect(competenciaPadraoPagantes(new Date("2027-01-01T03:00:00Z"))).toBe("2026-12")
    expect(deslocarCompetencia("2027-01", -1)).toBe("2026-12")
    expect(deslocarCompetencia("2026-12", 1)).toBe("2027-01")
    expect(rotularCompetencia("2026-10")).toBe("outubro de 2026")
  })

  it.each([
    "2026-00",
    "2026-13",
    "26-10",
    "2026-1",
    "2026-10-01",
    "qualquer",
  ])("rejeita a competência inválida %s", (competencia) =>
    expect(validarCompetencia(competencia)).toBe(false))
})

describe("consulta do relatório", () => {
  const agora = new Date("2026-11-15T15:00:00Z")

  it("consulta histórico anterior completo e devolve listas e tendência reconciliadas", async () => {
    mocks.mensalidade.findMany.mockResolvedValue([
      {
        alunoId: "antigo",
        competencia: "2026-10",
        status: "PAGA",
        aluno: { usuario: { nome: "Castro" } },
      },
      {
        alunoId: "novo",
        competencia: "2026-10",
        status: "PAGA",
        aluno: { usuario: { nome: "Ana" } },
      },
    ])
    mocks.mensalidade.groupBy.mockResolvedValue([
      { alunoId: "antigo", _min: { competencia: "2024-01" } },
      { alunoId: "novo", _min: { competencia: "2026-10" } },
    ])
    mocks.mensalidade.aggregate.mockResolvedValue({ _min: { competencia: "2024-01" } })
    const resultado = await consultarEvolucaoPagantes(undefined, agora)
    expect(resultado.competencia).toBe("2026-10")
    expect(resultado.resumo).toMatchObject({ retornos: 1, novos: 1, pagantesAtual: 2 })
    expect(resultado.listas.retornos[0].nome).toBe("Castro")
    expect(resultado.historico).toHaveLength(12)
    expect(resultado.historico[0].competencia).toBe("2025-11")
    expect(resultado.historico.at(-1)).toMatchObject(resultado.resumo)
    expect(resultado.competenciasDisponiveis[0]).toBe("2026-11")
    expect(resultado.competenciasDisponiveis.at(-1)).toBe("2024-01")
    expect(mocks.mensalidade.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({ where: { status: "PAGA", competencia: { lte: "2026-10" } } }),
    )
    expect(mocks.transaction).toHaveBeenCalledWith(expect.any(Array), {
      isolationLevel: "RepeatableRead",
    })
  })

  it("sinaliza primeiro mês disponível e mês em andamento", async () => {
    mocks.mensalidade.aggregate.mockResolvedValue({ _min: { competencia: "2026-11" } })
    const resultado = await consultarEvolucaoPagantes("2026-11", agora)
    expect(resultado.mesEmAndamento).toBe(true)
    expect(resultado.temBaseComparacao).toBe(false)
    expect(resultado.historico).toHaveLength(1)
    expect(resultado.historico[0].temBaseComparacao).toBe(false)
    expect(resultado.resumo.retencao).toBeNull()
  })

  it("mantém uma competência consultável sem histórico de mensalidades", async () => {
    const resultado = await consultarEvolucaoPagantes(undefined, agora)
    expect(resultado.primeiraCompetenciaDisponivel).toBeNull()
    expect(resultado.temBaseComparacao).toBe(false)
    expect(resultado.competenciasDisponiveis).toEqual(["2026-11", "2026-10"])
    expect(resultado.resumo.pagantesAtual).toBe(0)
    expect(resultado.historico).toEqual([])
  })

  it("não consulta o banco para competência inválida ou futura", async () => {
    await expect(consultarEvolucaoPagantes("2026-13", agora)).rejects.toThrow("competência válida")
    await expect(consultarEvolucaoPagantes("2026-12", agora)).rejects.toThrow("competência válida")
    await expect(consultarEvolucaoPagantes("1900-01", agora)).rejects.toThrow("competência válida")
    expect(mocks.transaction).not.toHaveBeenCalled()
  })

  it("aceita o primeiro ano selecionável com janela retroativa completa", async () => {
    const resultado = await consultarEvolucaoPagantes("1901-01", agora)
    expect(resultado.competenciaAnterior).toBe("1900-12")
    expect(mocks.mensalidade.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { competencia: { gte: "1900-01", lte: "1901-01" } },
      }),
    )
  })
})

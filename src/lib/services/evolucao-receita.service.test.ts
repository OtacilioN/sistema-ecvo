import { beforeEach, describe, expect, it, vi } from "vitest"
import {
  construirComparativoReceita,
  type DadosEvolucaoReceita,
  type MesEvolucaoReceita,
} from "@/lib/financeiro/evolucao-receita"

const mocks = vi.hoisted(() => ({
  mensalidade: { findMany: vi.fn(), findFirst: vi.fn() },
  cobrancaReativacaoAsaas: { findMany: vi.fn(), findFirst: vi.fn() },
}))
vi.mock("@/lib/db", () => ({ db: mocks }))

import { obterEvolucaoReceita } from "./evolucao-receita.service"

function mes(competencia: string, entradas: Record<number, number> = {}): MesEvolucaoReceita {
  const [ano, numeroMes] = competencia.split("-").map(Number)
  const diasNoMes = new Date(Date.UTC(ano, numeroMes, 0)).getUTCDate()
  return {
    competencia,
    diasNoMes,
    recebidoPorDia: Array.from({ length: diasNoMes }, (_, indice) => entradas[indice + 1] ?? 0),
  }
}

const opcoes = { agrupamento: "dia", janela: 3, medida: "media" } as const

function dados(meses: MesEvolucaoReceita[], diaAtual = 16): DadosEvolucaoReceita {
  return {
    competenciaAtual: meses[meses.length - 1].competencia,
    primeiraCompetenciaComRecebimento: meses[0].competencia,
    diaAtual,
    meses,
  }
}

describe("comparativo de receita acumulada", () => {
  it("compara o mesmo dia e interrompe a linha atual após hoje", () => {
    const resultado = construirComparativoReceita(
      dados([mes("2026-10", { 1: 100, 16: 50, 20: 999 }), mes("2026-11", { 1: 200, 16: 25 })]),
      opcoes,
    )
    expect(resultado.resumo).toEqual({ atual: 225, anterior: 150, historico: 150 })
    expect(resultado.pontos[15]).toMatchObject({ dia: 16, atual: 225, anterior: 150 })
    expect(resultado.pontos[16].atual).toBeNull()
    expect(resultado.pontos[30]).toMatchObject({ dia: 31, atual: null, anterior: 1149 })
  })

  it("mantém o total final de fevereiro nos dias excedentes", () => {
    const resultado = construirComparativoReceita(
      dados([mes("2026-02", { 28: 280 }), mes("2026-03", { 31: 310 })], 31),
      opcoes,
    )
    expect(resultado.pontos[30]).toMatchObject({ atual: 310, anterior: 280, historico: 280 })
  })

  it("preserva fevereiro bissexto e compara janeiro de outro ano", () => {
    const resultado = construirComparativoReceita(
      dados([mes("2023-12", { 31: 10 }), mes("2024-01", { 31: 20 })], 31),
      opcoes,
    )
    expect(resultado.resumo).toEqual({ atual: 20, anterior: 10, historico: 10 })
    expect(mes("2024-02").recebidoPorDia).toHaveLength(29)
  })

  it("mede a média e a mediana das curvas acumuladas, incluindo meses zerados", () => {
    const fonte = dados([
      mes("2026-08", { 1: 100 }),
      mes("2026-09"),
      mes("2026-10", { 1: 800 }),
      mes("2026-11", { 1: 75 }),
    ])
    const media = construirComparativoReceita(fonte, opcoes)
    const mediana = construirComparativoReceita(fonte, { ...opcoes, medida: "mediana" })
    expect(media.resumo.historico).toBe(300)
    expect(mediana.resumo.historico).toBe(100)
    expect(media.mesesHistorico).toBe(3)
  })

  it("calcula mediana de quantidade par e arredonda para centavos", () => {
    const fonte = dados([mes("2026-09", { 1: 0.1 }), mes("2026-10", { 1: 0.11 }), mes("2026-11")])
    expect(
      construirComparativoReceita(fonte, { ...opcoes, medida: "mediana" }).resumo.historico,
    ).toBe(0.11)
  })

  it("soma centavos sem resíduos e não altera os dados de origem", () => {
    const fonte = dados([mes("2026-10"), mes("2026-11", { 1: 0.1, 2: 0.2 })])
    const copia = structuredClone(fonte)
    expect(construirComparativoReceita(fonte, opcoes).resumo.atual).toBe(0.3)
    expect(fonte).toEqual(copia)
  })

  it("troca a janela entre 3 e 6 meses completos sem incluir o mês vigente", () => {
    const fonte = dados([
      mes("2026-05", { 1: 500 }),
      mes("2026-06", { 1: 500 }),
      mes("2026-07", { 1: 500 }),
      mes("2026-08", { 1: 100 }),
      mes("2026-09", { 1: 100 }),
      mes("2026-10", { 1: 100 }),
      mes("2026-11", { 1: 9000 }),
    ])
    expect(construirComparativoReceita(fonte, opcoes).resumo.historico).toBe(100)
    expect(construirComparativoReceita(fonte, { ...opcoes, janela: 6 }).resumo.historico).toBe(300)
  })

  it("exclui meses anteriores ao início do histórico, mantendo meses zerados posteriores", () => {
    const fonte = dados([
      mes("2026-08"),
      mes("2026-09", { 1: 100 }),
      mes("2026-10"),
      mes("2026-11"),
    ])
    fonte.primeiraCompetenciaComRecebimento = "2026-09"
    const resultado = construirComparativoReceita(fonte, opcoes)
    expect(resultado.mesesHistorico).toBe(2)
    expect(resultado.resumo.historico).toBe(50)
    expect(resultado.temMesAnterior).toBe(true)
  })

  it("sinaliza ausência de histórico sem inventar meses na média", () => {
    const fonte = dados([mes("2026-10"), mes("2026-11")])
    fonte.primeiraCompetenciaComRecebimento = null
    const resultado = construirComparativoReceita(fonte, opcoes)
    expect(resultado.mesesHistorico).toBe(0)
    expect(resultado.temMesAnterior).toBe(false)
    expect(resultado.resumo.historico).toBe(0)
  })

  it("adiciona o corte parcial da semana e mantém semanas futuras sem valor atual", () => {
    const resultado = construirComparativoReceita(
      dados([mes("2026-10", { 15: 100, 18: 900 }), mes("2026-11", { 15: 50 })], 16),
      { ...opcoes, agrupamento: "semana" },
    )
    expect(resultado.pontos.map((ponto) => ponto.dia)).toEqual([7, 14, 16, 21, 28, 31])
    expect(resultado.pontos[2]).toEqual({
      dia: 16,
      rotulo: "15–16 (parcial)",
      atual: 50,
      anterior: 100,
      historico: 100,
    })
    expect(resultado.pontos[3]).toMatchObject({ atual: null, anterior: 1000 })
  })

  it("não duplica ponto ao terminar a semana ou o mês", () => {
    for (const diaAtual of [7, 14, 21, 28, 31]) {
      const resultado = construirComparativoReceita(
        dados([mes("2026-10"), mes("2026-11")], diaAtual),
        { ...opcoes, agrupamento: "semana" },
      )
      expect(resultado.pontos.filter((ponto) => ponto.dia === diaAtual)).toHaveLength(1)
    }
  })
})

describe("consulta da receita do painel", () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mocks.mensalidade.findMany.mockResolvedValue([])
    mocks.cobrancaReativacaoAsaas.findMany.mockResolvedValue([])
    mocks.mensalidade.findFirst.mockResolvedValue(null)
    mocks.cobrancaReativacaoAsaas.findFirst.mockResolvedValue(null)
  })

  it("consulta somente recebimentos confirmados no intervalo sem mutações nem dados pessoais", async () => {
    const agora = new Date("2026-11-16T18:00:00Z")
    const inicio = new Date("2026-05-01T03:00:00Z")
    const resultado = await obterEvolucaoReceita(agora)
    expect(mocks.mensalidade.findMany).toHaveBeenCalledWith({
      where: { status: "PAGA", pagoEm: { gte: inicio, lte: agora } },
      select: { valor: true, pagoEm: true },
    })
    expect(mocks.cobrancaReativacaoAsaas.findMany).toHaveBeenCalledWith({
      where: { status: "RECEBIDA", recebidaEmAsaas: { gte: inicio, lte: agora } },
      select: { valor: true, recebidaEmAsaas: true },
    })
    expect(mocks.mensalidade.findFirst).toHaveBeenCalledWith({
      where: { status: "PAGA", pagoEm: { not: null, lte: agora } },
      orderBy: { pagoEm: "asc" },
      select: { pagoEm: true },
    })
    expect(mocks.cobrancaReativacaoAsaas.findFirst).toHaveBeenCalledWith({
      where: { status: "RECEBIDA", recebidaEmAsaas: { not: null, lte: agora } },
      orderBy: { recebidaEmAsaas: "asc" },
      select: { recebidaEmAsaas: true },
    })
    expect(resultado.meses.map((item) => item.competencia)).toEqual([
      "2026-05",
      "2026-06",
      "2026-07",
      "2026-08",
      "2026-09",
      "2026-10",
      "2026-11",
    ])
    expect(resultado.primeiraCompetenciaComRecebimento).toBeNull()
  })

  it("agrupa pela data do recebimento no fuso da academia e soma fontes em centavos", async () => {
    mocks.mensalidade.findMany.mockResolvedValue([
      { valor: "0.10", pagoEm: new Date("2026-11-01T02:59:59Z") },
      { valor: "0.10", pagoEm: new Date("2026-11-01T03:00:00Z") },
      { valor: "999", pagoEm: null },
      { valor: "999", pagoEm: new Date("2026-11-17T03:00:00Z") },
    ])
    mocks.cobrancaReativacaoAsaas.findMany.mockResolvedValue([
      { valor: "0.20", recebidaEmAsaas: new Date("2026-11-01T03:00:00Z") },
    ])
    mocks.mensalidade.findFirst.mockResolvedValue({ pagoEm: new Date("2026-09-02T03:00:00Z") })
    mocks.cobrancaReativacaoAsaas.findFirst.mockResolvedValue({
      recebidaEmAsaas: new Date("2026-08-10T03:00:00Z"),
    })
    const resultado = await obterEvolucaoReceita(new Date("2026-11-16T18:00:00Z"))
    expect(resultado.meses[5].recebidoPorDia[30]).toBe(0.1)
    expect(resultado.meses[6].recebidoPorDia[0]).toBe(0.3)
    expect(resultado.meses[6].recebidoPorDia.reduce((total, valor) => total + valor, 0)).toBe(0.3)
    expect(resultado.primeiraCompetenciaComRecebimento).toBe("2026-08")
  })

  it("respeita a virada do ano e a data local quando UTC já está no mês seguinte", async () => {
    const resultado = await obterEvolucaoReceita(new Date("2027-02-01T02:30:00Z"))
    expect(resultado.competenciaAtual).toBe("2027-01")
    expect(resultado.diaAtual).toBe(31)
    expect(resultado.meses[0].competencia).toBe("2026-07")
    expect(resultado.meses[6].diasNoMes).toBe(31)
  })
})

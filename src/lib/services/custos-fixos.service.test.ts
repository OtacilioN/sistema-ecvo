import { Prisma } from "@prisma/client"
import { beforeEach, describe, expect, it, vi } from "vitest"
import {
  CUSTOS_FIXOS_PADRAO,
  custosFixosMensaisSchema,
  totalizarCustosFixos,
  type ValoresCustosFixos,
} from "@/lib/financeiro/custos-fixos"

const mocks = vi.hoisted(() => {
  const custoFixoMensal = { findUnique: vi.fn(), upsert: vi.fn() }
  const tx = { custoFixoMensal, $executeRaw: vi.fn() }
  return {
    db: { custoFixoMensal, $transaction: vi.fn() },
    tx,
    registrarLog: vi.fn(),
  }
})

vi.mock("@/lib/db", () => ({ db: mocks.db }))
vi.mock("@/lib/services/auditoria.service", () => ({ registrarLog: mocks.registrarLog }))

import { obterCustosFixosMensais, salvarCustosFixosMensais } from "./custos-fixos.service"

const competencia = "2026-09"
const dados = { competencia, ...CUSTOS_FIXOS_PADRAO }
const zerados: ValoresCustosFixos = {
  aluguel: 0,
  energia: 0,
  agua: 0,
  internet: 0,
  limpeza: 0,
  outros: 0,
}

describe("validação de custos fixos mensais", () => {
  it("usa os padrões solicitados e soma centavos sem resíduo binário", () => {
    expect(CUSTOS_FIXOS_PADRAO).toEqual({
      aluguel: 2200,
      energia: 150,
      agua: 120,
      internet: 90,
      limpeza: 80,
      outros: 0,
    })
    expect(totalizarCustosFixos(CUSTOS_FIXOS_PADRAO)).toBe(2640)
    expect(totalizarCustosFixos({ ...zerados, agua: 0.1, energia: 0.2 })).toBe(0.3)
  })

  it.each([
    "2026-00",
    "2026-13",
    "2026-9",
    "2026-09-01",
    "0000-01",
    "10000-01",
    " 2026-09",
  ])("rejeita a competência inválida %s", (mes) => {
    expect(custosFixosMensaisSchema.safeParse({ ...dados, competencia: mes }).success).toBe(false)
  })

  it.each(["0001-01", "9999-12", "2026-09"])("aceita a competência %s", (mes) => {
    expect(custosFixosMensaisSchema.safeParse({ ...dados, competencia: mes }).success).toBe(true)
  })

  it.each([
    -0.01,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    10000000000,
    1.001,
    1.005,
    9999999999.991,
  ])("rejeita valor inválido %s", (aluguel) => {
    expect(custosFixosMensaisSchema.safeParse({ ...dados, aluguel }).success).toBe(false)
  })

  it.each([0, 1.01, 2.55, 0.29, 150.25, 9999999999.99])("aceita valor %s", (aluguel) => {
    expect(custosFixosMensaisSchema.safeParse({ ...dados, aluguel }).success).toBe(true)
  })

  it("exige todos os valores numéricos, incluindo outros custos", () => {
    expect(custosFixosMensaisSchema.safeParse({ ...dados, outros: undefined }).success).toBe(false)
    expect(custosFixosMensaisSchema.safeParse({ ...dados, agua: "120" }).success).toBe(false)
  })
})

describe("custos fixos por competência", () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mocks.db.$transaction.mockImplementation(async (operacao) => operacao(mocks.tx))
    mocks.db.custoFixoMensal.findUnique.mockResolvedValue(null)
    mocks.tx.$executeRaw.mockResolvedValue(1)
    mocks.registrarLog.mockResolvedValue({ id: "log-1" })
    mocks.db.custoFixoMensal.upsert.mockImplementation(async ({ create }) => create)
  })

  it("retorna padrões sem criar registro ao consultar mês não configurado", async () => {
    expect(await obterCustosFixosMensais(competencia)).toEqual({
      competencia,
      valores: CUSTOS_FIXOS_PADRAO,
      personalizado: false,
      total: 2640,
    })
    expect(mocks.db.custoFixoMensal.findUnique).toHaveBeenCalledWith({ where: { competencia } })
    expect(mocks.db.custoFixoMensal.upsert).not.toHaveBeenCalled()
    expect(mocks.db.$transaction).not.toHaveBeenCalled()
  })

  it("preserva valores zero gravados sem substituí-los pelos padrões", async () => {
    mocks.db.custoFixoMensal.findUnique.mockResolvedValue({
      competencia,
      ...Object.fromEntries(Object.keys(zerados).map((nome) => [nome, new Prisma.Decimal(0)])),
    })
    expect(await obterCustosFixosMensais(competencia)).toEqual({
      competencia,
      valores: zerados,
      personalizado: true,
      total: 0,
    })
  })

  it("salva somente o mês informado e audita a troca dos padrões pela configuração", async () => {
    const valores = { ...CUSTOS_FIXOS_PADRAO, aluguel: 2300, outros: 45.67 }
    const resultado = await salvarCustosFixosMensais("gestor-1", { competencia, ...valores })

    expect(resultado).toEqual({ competencia, valores, personalizado: true, total: 2785.67 })
    expect(mocks.db.custoFixoMensal.upsert).toHaveBeenCalledWith({
      where: { competencia },
      create: { competencia, ...valores },
      update: valores,
    })
    expect(mocks.registrarLog).toHaveBeenCalledWith(
      {
        autorId: "gestor-1",
        acao: "CONFIGURACAO",
        entidade: "CustoFixoMensal",
        entidadeId: competencia,
        valorAntigo: {
          competencia,
          valores: CUSTOS_FIXOS_PADRAO,
          personalizado: false,
          total: 2640,
        },
        valorNovo: resultado,
      },
      mocks.tx,
    )
    expect(mocks.db.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: "ReadCommitted",
    })
    expect(mocks.tx.$executeRaw.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.db.custoFixoMensal.findUnique.mock.invocationCallOrder[0],
    )
  })

  it("editar setembro não altera outubro nem seus padrões", async () => {
    const registros = new Map<string, typeof dados>()
    mocks.db.custoFixoMensal.findUnique.mockImplementation(async ({ where }) => {
      return registros.get(where.competencia) ?? null
    })
    mocks.db.custoFixoMensal.upsert.mockImplementation(async ({ create }) => {
      registros.set(create.competencia, create)
      return create
    })

    await salvarCustosFixosMensais("gestor-1", { ...dados, aluguel: 0, outros: 200 })
    expect((await obterCustosFixosMensais(competencia)).total).toBe(640)
    expect(await obterCustosFixosMensais("2026-10")).toEqual({
      competencia: "2026-10",
      valores: CUSTOS_FIXOS_PADRAO,
      personalizado: false,
      total: 2640,
    })
    expect(registros.size).toBe(1)
  })

  it("audita os valores persistidos anteriores ao editar mês já configurado", async () => {
    mocks.db.custoFixoMensal.findUnique.mockResolvedValue({ competencia, ...zerados })
    await salvarCustosFixosMensais("gestor-1", dados)
    expect(mocks.registrarLog).toHaveBeenCalledWith(
      expect.objectContaining({
        valorAntigo: { competencia, valores: zerados, personalizado: true, total: 0 },
      }),
      mocks.tx,
    )
  })

  it("propaga falha de auditoria dentro da transação para impedir confirmação parcial", async () => {
    mocks.registrarLog.mockRejectedValue(new Error("Falha de auditoria"))
    await expect(salvarCustosFixosMensais("gestor-1", dados)).rejects.toThrow("Falha de auditoria")
    expect(mocks.db.$transaction).toHaveBeenCalledOnce()
    expect(mocks.registrarLog.mock.calls[0][1]).toBe(mocks.tx)
  })

  it("rejeita entradas inválidas antes de acessar o banco", async () => {
    await expect(obterCustosFixosMensais("2026-13")).rejects.toThrow()
    await expect(salvarCustosFixosMensais("gestor-1", { ...dados, outros: -1 })).rejects.toThrow()
    expect(mocks.db.custoFixoMensal.findUnique).not.toHaveBeenCalled()
    expect(mocks.db.$transaction).not.toHaveBeenCalled()
  })
})

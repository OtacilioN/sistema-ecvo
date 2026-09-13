import { Prisma } from "@prisma/client"
import { beforeEach, describe, expect, it, vi } from "vitest"
import {
  obterOutrasReceitasPadrao,
  outrasReceitasMensaisSchema,
  totalizarOutrasReceitas,
} from "@/lib/financeiro/outras-receitas"

const mocks = vi.hoisted(() => {
  const outraReceitaMensal = { findUnique: vi.fn(), upsert: vi.fn() }
  const tx = { outraReceitaMensal, $executeRaw: vi.fn() }
  return { db: { outraReceitaMensal, $transaction: vi.fn() }, tx, registrarLog: vi.fn() }
})

vi.mock("@/lib/db", () => ({ db: mocks.db }))
vi.mock("@/lib/services/auditoria.service", () => ({ registrarLog: mocks.registrarLog }))

import { obterOutrasReceitasMensais, salvarOutrasReceitasMensais } from "./outras-receitas.service"

const competencia = "2026-09"
const padrao = { aluguelHorario: 500, outros: 0 }
const zerados = { aluguelHorario: 0, outros: 0 }
const dados = { competencia, ...padrao }

describe("validação de outras receitas mensais", () => {
  it.each(["2025-09", "2026-01", "2026-08"])("mantém %s sem receita padrão", (mes) => {
    expect(obterOutrasReceitasPadrao(mes)).toEqual(zerados)
  })

  it.each(["2026-09", "2026-10", "2027-01"])("aplica R$ 500 de aluguel em %s", (mes) => {
    expect(obterOutrasReceitasPadrao(mes)).toEqual(padrao)
  })

  it.each([
    "2026-00",
    "2026-13",
    "2026-9",
    "0000-01",
    "10000-01",
    " 2026-09",
  ])("rejeita competência inválida %s", (mes) => {
    expect(outrasReceitasMensaisSchema.safeParse({ ...dados, competencia: mes }).success).toBe(
      false,
    )
    expect(() => obterOutrasReceitasPadrao(mes)).toThrow()
  })

  it.each([
    -0.01,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    10000000000,
    1.001,
    1.005,
  ])("rejeita valor inválido %s", (valor) => {
    expect(outrasReceitasMensaisSchema.safeParse({ ...dados, aluguelHorario: valor }).success).toBe(
      false,
    )
    expect(outrasReceitasMensaisSchema.safeParse({ ...dados, outros: valor }).success).toBe(false)
  })

  it.each([0, 1.01, 2.55, 0.29, 150.25, 9999999999.99])("aceita valor %s", (outros) => {
    expect(outrasReceitasMensaisSchema.safeParse({ ...dados, outros }).success).toBe(true)
  })

  it("exige os dois valores e soma centavos sem resíduo binário", () => {
    expect(outrasReceitasMensaisSchema.safeParse({ ...dados, outros: undefined }).success).toBe(
      false,
    )
    expect(outrasReceitasMensaisSchema.safeParse({ ...dados, aluguelHorario: "500" }).success).toBe(
      false,
    )
    expect(totalizarOutrasReceitas({ aluguelHorario: 0.1, outros: 0.2 })).toBe(0.3)
  })
})

describe("outras receitas por competência", () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mocks.db.$transaction.mockImplementation(async (operacao) => operacao(mocks.tx))
    mocks.db.outraReceitaMensal.findUnique.mockResolvedValue(null)
    mocks.tx.$executeRaw.mockResolvedValue(1)
    mocks.registrarLog.mockResolvedValue({ id: "log-1" })
    mocks.db.outraReceitaMensal.upsert.mockImplementation(async ({ create }) => create)
  })

  it.each([
    ["2026-08", zerados, 0],
    ["2026-09", padrao, 500],
  ])("consulta %s sem criar ou alterar registros", async (mes, valores, total) => {
    expect(await obterOutrasReceitasMensais(mes)).toEqual({
      competencia: mes,
      valores,
      personalizado: false,
      total,
    })
    expect(mocks.db.outraReceitaMensal.findUnique).toHaveBeenCalledWith({
      where: { competencia: mes },
    })
    expect(mocks.db.outraReceitaMensal.upsert).not.toHaveBeenCalled()
    expect(mocks.db.$transaction).not.toHaveBeenCalled()
  })

  it("preserva zero explícito em setembro sem voltar ao aluguel padrão", async () => {
    mocks.db.outraReceitaMensal.findUnique.mockResolvedValue({
      competencia,
      aluguelHorario: new Prisma.Decimal(0),
      outros: new Prisma.Decimal(0),
    })
    expect(await obterOutrasReceitasMensais(competencia)).toEqual({
      competencia,
      valores: zerados,
      personalizado: true,
      total: 0,
    })
  })

  it("salva somente a competência solicitada e audita na mesma transação", async () => {
    const valores = { aluguelHorario: 600, outros: 45.67 }
    const resultado = await salvarOutrasReceitasMensais("gestor-1", { competencia, ...valores })
    expect(resultado).toEqual({ competencia, valores, personalizado: true, total: 645.67 })
    expect(mocks.db.outraReceitaMensal.upsert).toHaveBeenCalledWith({
      where: { competencia },
      create: { competencia, ...valores },
      update: valores,
    })
    expect(mocks.registrarLog).toHaveBeenCalledWith(
      {
        autorId: "gestor-1",
        acao: "CONFIGURACAO",
        entidade: "OutraReceitaMensal",
        entidadeId: competencia,
        valorAntigo: { competencia, valores: padrao, personalizado: false, total: 500 },
        valorNovo: resultado,
      },
      mocks.tx,
    )
    expect(mocks.db.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: "ReadCommitted",
    })
    expect(mocks.tx.$executeRaw.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.db.outraReceitaMensal.findUnique.mock.invocationCallOrder[0],
    )
  })

  it("editar setembro preserva agosto zerado e outubro com seu próprio padrão", async () => {
    const registros = new Map<string, typeof dados>()
    mocks.db.outraReceitaMensal.findUnique.mockImplementation(async ({ where }) => {
      return registros.get(where.competencia) ?? null
    })
    mocks.db.outraReceitaMensal.upsert.mockImplementation(async ({ create }) => {
      registros.set(create.competencia, create)
      return create
    })
    await salvarOutrasReceitasMensais("gestor-1", { ...dados, aluguelHorario: 0, outros: 200 })
    expect((await obterOutrasReceitasMensais(competencia)).total).toBe(200)
    expect((await obterOutrasReceitasMensais("2026-08")).total).toBe(0)
    expect((await obterOutrasReceitasMensais("2026-10")).total).toBe(500)
    expect(registros.size).toBe(1)
  })

  it("registra agosto com zeros sem aplicar o valor padrão de setembro", async () => {
    const resultado = await salvarOutrasReceitasMensais("gestor-1", {
      competencia: "2026-08",
      ...zerados,
    })
    expect(resultado.total).toBe(0)
    expect(mocks.registrarLog).toHaveBeenCalledWith(
      expect.objectContaining({
        valorAntigo: {
          competencia: "2026-08",
          valores: zerados,
          personalizado: false,
          total: 0,
        },
      }),
      mocks.tx,
    )
  })

  it("audita valores persistidos anteriores e propaga falha de auditoria", async () => {
    mocks.db.outraReceitaMensal.findUnique.mockResolvedValue({ competencia, ...zerados })
    mocks.registrarLog.mockRejectedValue(new Error("Falha de auditoria"))
    await expect(salvarOutrasReceitasMensais("gestor-1", dados)).rejects.toThrow(
      "Falha de auditoria",
    )
    expect(mocks.registrarLog).toHaveBeenCalledWith(
      expect.objectContaining({
        valorAntigo: { competencia, valores: zerados, personalizado: true, total: 0 },
      }),
      mocks.tx,
    )
  })

  it("rejeita entradas inválidas antes de acessar o banco", async () => {
    await expect(obterOutrasReceitasMensais("2026-13")).rejects.toThrow()
    await expect(
      salvarOutrasReceitasMensais("gestor-1", { ...dados, outros: -1 }),
    ).rejects.toThrow()
    expect(mocks.db.outraReceitaMensal.findUnique).not.toHaveBeenCalled()
    expect(mocks.db.$transaction).not.toHaveBeenCalled()
  })
})

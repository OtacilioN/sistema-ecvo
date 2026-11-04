import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  operacao: {
    findMany: vi.fn(),
    findUniqueOrThrow: vi.fn(),
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    updateMany: vi.fn(),
    create: vi.fn(),
  },
  aluno: { findUnique: vi.fn() },
  mensalidade: {
    findMany: vi.fn(),
    findUnique: vi.fn(),
    findUniqueOrThrow: vi.fn(),
    updateMany: vi.fn(),
  },
  cobranca: { findMany: vi.fn(), findFirst: vi.fn() },
  contrato: { findFirst: vi.fn() },
  usuario: { findMany: vi.fn() },
  notificacao: { createMany: vi.fn() },
  log: vi.fn(),
  cancelarCobranca: vi.fn(),
  cancelarContrato: vi.fn(),
  raw: vi.fn(),
  transaction: vi.fn(),
}))
vi.mock("@/lib/db", () => ({
  db: {
    operacaoIsencaoTrancamento: mocks.operacao,
    aluno: mocks.aluno,
    mensalidade: mocks.mensalidade,
    cobrancaAsaas: mocks.cobranca,
    contratoPixAutomatico: mocks.contrato,
    $queryRaw: mocks.raw,
    $transaction: mocks.transaction,
  },
}))
vi.mock("@/lib/services/auditoria.service", () => ({ registrarLog: mocks.log }))
vi.mock("@/lib/services/asaas.service", () => ({
  cancelarCobrancaAsaasAntesDeBaixaManual: mocks.cancelarCobranca,
  cancelarPixAutomatico: mocks.cancelarContrato,
}))

import {
  agendarIsencaoTrancamento,
  processarIsencoesTrancamento,
} from "./isencao-trancamento.service"

const operacao = { id: "op", alunoId: "aluno", autorId: "gestor", mensalidadeIds: ["mensalidade"] }
const aberta = {
  id: "mensalidade",
  alunoId: "aluno",
  status: "VENCIDA",
  reativacaoMatricula: false,
  competencia: "2026-10",
  valor: 100,
  atualizadoEm: new Date(),
  aluno: { status: "TRANCADO" },
  cobrancasAsaas: [],
}

beforeEach(() => {
  vi.resetAllMocks()
  mocks.operacao.findMany.mockResolvedValue([{ id: "op" }])
  mocks.operacao.findUniqueOrThrow.mockResolvedValue(operacao)
  mocks.operacao.findUnique.mockResolvedValue({ status: "CONCLUIDA" })
  mocks.operacao.findFirst.mockResolvedValue({ id: "op" })
  mocks.operacao.updateMany.mockResolvedValue({ count: 1 })
  mocks.aluno.findUnique.mockResolvedValue({ status: "TRANCADO" })
  mocks.contrato.findFirst.mockResolvedValue(null)
  mocks.mensalidade.findUnique.mockResolvedValue(aberta)
  mocks.mensalidade.findUniqueOrThrow.mockResolvedValue({
    atualizadoEm: new Date("2026-11-04T01:23:45.123Z"),
  })
  mocks.mensalidade.updateMany.mockResolvedValue({ count: 1 })
  mocks.cobranca.findMany.mockResolvedValue([])
  mocks.cobranca.findFirst.mockResolvedValue(null)
  mocks.cancelarCobranca.mockResolvedValue({ ok: true })
  mocks.cancelarContrato.mockResolvedValue({ ok: true })
  mocks.usuario.findMany.mockResolvedValue([{ id: "gestor" }])
  mocks.transaction.mockImplementation((callback) =>
    callback({
      operacaoIsencaoTrancamento: mocks.operacao,
      mensalidade: mocks.mensalidade,
      usuario: mocks.usuario,
      notificacao: mocks.notificacao,
      $queryRaw: mocks.raw,
    }),
  )
})

describe("isenção após trancamento", () => {
  it("registra só as mensalidades abertas e vencidas na transação", async () => {
    mocks.mensalidade.findMany.mockResolvedValue([{ id: "mensalidade" }])
    mocks.operacao.create.mockResolvedValue({ id: "op" })
    await agendarIsencaoTrancamento(
      { mensalidade: mocks.mensalidade, operacaoIsencaoTrancamento: mocks.operacao } as never,
      "aluno",
      "gestor",
    )
    expect(mocks.mensalidade.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          alunoId: "aluno",
          status: { in: ["EM_ABERTO", "VENCIDA"] },
        },
      }),
    )
    expect(mocks.operacao.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ mensalidadeIds: ["mensalidade"] }),
      }),
    )
  })

  it("cancela a cobrança antes de isentar e audita", async () => {
    mocks.cobranca.findMany.mockResolvedValue([
      { id: "cobranca", status: "PENDENTE", cobrancaFamiliaId: null },
    ])
    const resultado = await processarIsencoesTrancamento({ operacaoId: "op" })
    expect(resultado).toEqual({ ok: true, concluidas: 1, falhas: 0 })
    expect(mocks.cancelarCobranca).toHaveBeenCalledWith({
      cobrancaId: "cobranca",
      autorId: "gestor",
    })
    expect(mocks.cancelarCobranca.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.mensalidade.updateMany.mock.invocationCallOrder[0],
    )
    expect(mocks.mensalidade.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "ISENTA" }) }),
    )
    expect(mocks.log).toHaveBeenCalledWith(
      expect.objectContaining({
        valorNovo: expect.objectContaining({
          operacaoId: "op",
          status: "ISENTA",
          atualizadoEm: "2026-11-04T01:23:45.123Z",
        }),
      }),
      expect.anything(),
    )
  })

  it("preserva mensalidade paga após o trancamento", async () => {
    mocks.mensalidade.findUnique.mockResolvedValue({ ...aberta, status: "PAGA" })
    expect((await processarIsencoesTrancamento()).concluidas).toBe(1)
    expect(mocks.mensalidade.updateMany).not.toHaveBeenCalled()
    expect(mocks.cancelarCobranca).not.toHaveBeenCalled()
  })

  it("não isenta se o Asaas não confirmar o cancelamento e agenda retentativa", async () => {
    mocks.cobranca.findMany.mockResolvedValue([
      { id: "cobranca", status: "PENDENTE", cobrancaFamiliaId: null },
    ])
    mocks.cancelarCobranca.mockResolvedValue({ ok: false, motivo: "Asaas indisponível" })
    expect(await processarIsencoesTrancamento()).toEqual({ ok: false, concluidas: 0, falhas: 1 })
    expect(mocks.mensalidade.updateMany).not.toHaveBeenCalled()
    expect(mocks.operacao.updateMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "PENDENTE", ultimoErro: "Asaas indisponível" }),
      }),
    )
    expect(mocks.notificacao.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        skipDuplicates: true,
        data: [
          expect.objectContaining({
            usuarioId: "gestor",
            chaveDeduplicacao: "isencao-trancamento:op:gestor",
          }),
        ],
      }),
    )
  })

  it("não cancela cobrança compartilhada", async () => {
    mocks.cobranca.findMany.mockResolvedValue([
      { id: "cobranca", status: "PENDENTE", cobrancaFamiliaId: "familia" },
    ])
    expect((await processarIsencoesTrancamento()).falhas).toBe(1)
    expect(mocks.cancelarCobranca).not.toHaveBeenCalled()
    expect(mocks.mensalidade.updateMany).not.toHaveBeenCalled()
  })

  it("encaminha para conciliação tentativa anterior recebida ou estorno parcial", async () => {
    mocks.cobranca.findFirst.mockResolvedValue({ id: "cobranca-anterior" })
    expect((await processarIsencoesTrancamento()).falhas).toBe(1)
    expect(mocks.cancelarCobranca).not.toHaveBeenCalled()
    expect(mocks.mensalidade.updateMany).not.toHaveBeenCalled()
  })

  it("isenta uma tentativa de reativação anterior que estava aberta no trancamento", async () => {
    mocks.mensalidade.findUnique.mockResolvedValue({ ...aberta, reativacaoMatricula: true })
    expect((await processarIsencoesTrancamento()).concluidas).toBe(1)
    expect(mocks.mensalidade.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "ISENTA", reativacaoMatricula: false }),
      }),
    )
  })

  it("interrompe a recorrência antes de isentar e não isenta se falhar", async () => {
    mocks.contrato.findFirst.mockResolvedValue({ id: "contrato" })
    mocks.cancelarContrato.mockResolvedValue({ ok: false, motivo: "Falha de comunicação" })
    expect((await processarIsencoesTrancamento()).falhas).toBe(1)
    expect(mocks.cancelarContrato).toHaveBeenCalledWith({ alunoId: "aluno", autorId: "gestor" })
    expect(mocks.mensalidade.updateMany).not.toHaveBeenCalled()
  })

  it("não isenta quando um pagamento ou cobrança surge antes da transação", async () => {
    mocks.mensalidade.findUnique
      .mockResolvedValueOnce(aberta)
      .mockResolvedValueOnce({ ...aberta, cobrancasAsaas: [{ id: "nova" }] })
    expect((await processarIsencoesTrancamento()).falhas).toBe(1)
    expect(mocks.mensalidade.updateMany).not.toHaveBeenCalled()
  })

  it("não informa conclusão quando outro worker ainda processa a operação", async () => {
    mocks.operacao.findMany.mockResolvedValue([])
    mocks.operacao.findUnique.mockResolvedValue({ status: "PROCESSANDO" })
    expect(await processarIsencoesTrancamento({ operacaoId: "op" })).toEqual({
      ok: false,
      concluidas: 0,
      falhas: 0,
    })
  })
})

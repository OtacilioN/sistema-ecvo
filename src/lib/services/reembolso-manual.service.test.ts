import { Prisma } from "@prisma/client"
import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  tx: {
    $queryRaw: vi.fn(),
    $executeRaw: vi.fn(),
    mensalidade: { findUniqueOrThrow: vi.fn(), update: vi.fn() },
    logAuditoria: { findFirst: vi.fn() },
    custoFixoMensal: { findUnique: vi.fn(), upsert: vi.fn() },
  },
  db: { $transaction: vi.fn() },
  registrarLog: vi.fn(),
}))
vi.mock("@/lib/db", () => ({ db: mocks.db }))
vi.mock("@/lib/services/auditoria.service", () => ({ registrarLog: mocks.registrarLog }))

import { conciliarReembolsoManualIntegral } from "./reembolso-manual.service"

const params = {
  mensalidadeId: "mensalidade-1",
  alunoId: "aluno-1",
  asaasPaymentId: "pay_1",
  valorDevolvido: 100,
  confirmacao: "PIX_SEPARADO_REALIZADO_INFORMADO_PELO_GESTOR" as const,
  autorId: null,
}

function paga() {
  return {
    id: params.mensalidadeId,
    alunoId: params.alunoId,
    status: "PAGA",
    valor: new Prisma.Decimal(100),
    pagoEm: new Date("2026-11-11T02:00:00Z"),
    formaPagamento: "PIX_ASAAS",
    cobrancaQuitacaoAsaasId: "cobranca-1",
    observacao: "Pagamento original",
    cobrancasAsaas: [
      {
        id: "cobranca-1",
        status: "RECEBIDA",
        statusAsaas: "RECEIVED",
        asaasPaymentId: params.asaasPaymentId,
        valorCobrado: new Prisma.Decimal(100),
        taxaAsaas: new Prisma.Decimal(1.99),
        contratoPixAutomaticoId: null,
        cobrancaFamiliaId: null,
        splits: [] as { id: string }[],
      },
    ],
    cobrancaMatriculaAsaas: { splits: [] as { id: string }[] },
  }
}

describe("conciliação de reembolso por Pix separado", () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mocks.db.$transaction.mockImplementation((callback) => callback(mocks.tx))
    mocks.tx.mensalidade.findUniqueOrThrow.mockResolvedValue(paga())
    mocks.tx.logAuditoria.findFirst.mockResolvedValue(null)
    mocks.tx.custoFixoMensal.findUnique.mockResolvedValue(null)
    mocks.tx.mensalidade.update.mockResolvedValue({ status: "CANCELADA" })
    mocks.tx.custoFixoMensal.upsert.mockResolvedValue({ outros: new Prisma.Decimal(1.99) })
    mocks.registrarLog.mockResolvedValue({ id: "auditoria-1" })
  })

  it("retira a receita sem recriar dívida e mantém a taxa como custo", async () => {
    const resultado = await conciliarReembolsoManualIntegral(params)
    expect(resultado).toMatchObject({ receita: 0, repasseProfessor: 0, taxaAsaasMantida: 1.99 })
    const data = mocks.tx.mensalidade.update.mock.calls[0][0].data
    expect(data).toMatchObject({
      status: "CANCELADA",
      pagoEm: null,
      formaPagamento: null,
      cobrancaQuitacaoAsaasId: null,
    })
    expect(data).not.toHaveProperty("valor")
    expect(data).not.toHaveProperty("repasseSnapshot")
    expect(data.observacao).toContain("Sem estorno no Asaas")
    expect(mocks.tx.custoFixoMensal.upsert.mock.calls[0][0].create.outros.toString()).toBe("1.99")
    expect(mocks.registrarLog).toHaveBeenCalledTimes(2)
  })

  it("preserva outros custos e observações já registrados", async () => {
    mocks.tx.custoFixoMensal.findUnique.mockResolvedValue({
      outros: new Prisma.Decimal(25),
      observacoesOutros: "Manutenção",
    })
    await conciliarReembolsoManualIntegral(params)
    const update = mocks.tx.custoFixoMensal.upsert.mock.calls[0][0].update
    expect(update.outros.toString()).toBe("26.99")
    expect(update.observacoesOutros).toContain("Manutenção")
    expect(update).not.toHaveProperty("aluguel")
  })

  it("não soma novamente a taxa nem cancela novamente em reexecução", async () => {
    mocks.tx.mensalidade.findUniqueOrThrow.mockResolvedValue({ ...paga(), status: "CANCELADA" })
    mocks.tx.logAuditoria.findFirst.mockResolvedValue({
      id: "auditoria-1",
      valorNovo: { asaasPaymentId: params.asaasPaymentId, valorDevolvido: 100 },
    })
    await expect(conciliarReembolsoManualIntegral(params)).resolves.toMatchObject({
      duplicado: true,
    })
    expect(mocks.tx.custoFixoMensal.upsert).not.toHaveBeenCalled()
    expect(mocks.tx.mensalidade.update).not.toHaveBeenCalled()
  })

  it("rejeita valor parcial ou pagamento de outro aluno antes de alterar dados", async () => {
    await expect(
      conciliarReembolsoManualIntegral({ ...params, valorDevolvido: 50 }),
    ).rejects.toThrow("divergente")
    await expect(conciliarReembolsoManualIntegral({ ...params, alunoId: "outro" })).rejects.toThrow(
      "Aluno divergente",
    )
    expect(mocks.tx.mensalidade.update).not.toHaveBeenCalled()
    expect(mocks.tx.custoFixoMensal.upsert).not.toHaveBeenCalled()
  })

  it("impede retirar repasse se existe split que exige conciliação separada", async () => {
    const mensalidade = paga()
    mensalidade.cobrancasAsaas[0].splits.push({ id: "split-1" })
    mocks.tx.mensalidade.findUniqueOrThrow.mockResolvedValue(mensalidade)
    await expect(conciliarReembolsoManualIntegral(params)).rejects.toThrow("conciliação própria")
    expect(mocks.tx.mensalidade.update).not.toHaveBeenCalled()
    expect(mocks.tx.custoFixoMensal.upsert).not.toHaveBeenCalled()
  })
})

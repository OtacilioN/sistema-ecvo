import { Prisma } from "@prisma/client"
import { describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))

import {
  payloadSplitAsaas,
  persistirSplitsRemotos,
  prepararSplitsPagamento,
  proximoStatusSplitAsaas,
  statusLocalSplitAsaas,
} from "./split-asaas.service"

describe("split de pagamento Asaas", () => {
  it("monta o payload fixo documentado pelo Asaas", () => {
    expect(
      payloadSplitAsaas([
        {
          id: "split-local-1",
          walletIdSnapshot: "wallet-professor",
          valorFixoSnapshot: new Prisma.Decimal(60),
          externalReference: "mensalidade:1:split:1",
        },
      ]),
    ).toEqual([
      {
        walletId: "wallet-professor",
        fixedValue: 60,
        externalReference: "mensalidade:1:split:1",
        description: "Repasse automático de professor ECVO",
      },
    ])
  })

  it("agrega R$ 50 e R$ 60 na mesma wallet e preserva a composição", async () => {
    const create = vi.fn(async ({ data }) => ({
      id: "split-local-1",
      criadoEm: new Date(),
      ...data,
    }))
    const tx = {
      splitPagamentoAsaas: { findMany: vi.fn().mockResolvedValue([]), create },
      contaAsaasProfessor: {
        findMany: vi
          .fn()
          .mockResolvedValue([
            { id: "conta-1", professorId: "professor-1", walletId: "wallet-professor" },
          ]),
      },
    } as never

    const splits = await prepararSplitsPagamento(tx, {
      cobrancaAsaasId: "cobranca-1",
      externalReferenceCobranca: "mensalidade:1",
      valorCobranca: 198,
      repasseSnapshot: [
        {
          modalidadeId: "jiu-jitsu",
          modalidadeNome: "Jiu-Jitsu",
          professorId: "professor-1",
          professorNome: "Professor",
          plataformaExterna: null,
          valorBase: 100,
          valorRepasseProfessor: 50,
        },
        {
          modalidadeId: "kickboxing",
          modalidadeNome: "Kickboxing",
          professorId: "professor-1",
          professorNome: "Professor",
          plataformaExterna: null,
          valorBase: 100,
          valorRepasseProfessor: 60,
        },
      ],
    })

    expect(splits).toHaveLength(1)
    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        walletIdSnapshot: "wallet-professor",
        valorFixoSnapshot: new Prisma.Decimal(110),
        modalidadesSnapshot: [
          { modalidadeId: "jiu-jitsu", modalidadeNome: "Jiu-Jitsu", valor: 50 },
          { modalidadeId: "kickboxing", modalidadeNome: "Kickboxing", valor: 60 },
        ],
      }),
    })
  })

  it("só confirma o repasse quando o Asaas devolve o split compatível", async () => {
    const update = vi.fn().mockResolvedValue({})
    const tx = { splitPagamentoAsaas: { update } } as never
    await persistirSplitsRemotos(
      tx,
      [
        {
          id: "split-local-1",
          walletIdSnapshot: "wallet-professor",
          valorFixoSnapshot: new Prisma.Decimal(50),
          externalReference: "mensalidade:1:split:1",
        },
      ],
      {
        split: [
          {
            id: "split-remoto-1",
            walletId: "wallet-professor",
            fixedValue: 50,
            status: "AWAITING_CREDIT",
            externalReference: "mensalidade:1:split:1",
          },
        ],
      },
    )
    expect(update).toHaveBeenCalledWith({
      where: { id: "split-local-1" },
      data: expect.objectContaining({
        asaasSplitId: "split-remoto-1",
        status: "AGUARDANDO_CREDITO",
      }),
    })
  })

  it("preserva o erro de uma composição remota divergente para conciliação", async () => {
    const update = vi.fn().mockResolvedValue({})
    const resultado = await persistirSplitsRemotos(
      { splitPagamentoAsaas: { update } } as never,
      [
        {
          id: "split-local-1",
          walletIdSnapshot: "wallet-professor",
          valorFixoSnapshot: new Prisma.Decimal(50),
          externalReference: "mensalidade:1:split:1",
        },
      ],
      { split: [] },
    )

    expect(resultado).toEqual({
      ok: false,
      motivo: "A cobrança Asaas não confirmou o split esperado; concilie antes de cobrar.",
    })
    expect(update).toHaveBeenCalledWith({
      where: { id: "split-local-1" },
      data: { status: "ERRO", motivo: expect.stringContaining("divergente") },
    })
  })

  it("reduz proporcionalmente os tetos quando a cobrança tem desconto", async () => {
    const create = vi.fn(async ({ data }) => ({
      id: data.externalReference,
      criadoEm: new Date(),
      ...data,
    }))
    const tx = {
      splitPagamentoAsaas: { findMany: vi.fn().mockResolvedValue([]), create },
      contaAsaasProfessor: {
        findMany: vi.fn().mockResolvedValue([
          { id: "conta-50", professorId: "professor-50", walletId: "wallet-50" },
          { id: "conta-60", professorId: "professor-60", walletId: "wallet-60" },
        ]),
      },
    } as never

    const splits = await prepararSplitsPagamento(tx, {
      cobrancaAsaasId: "cobranca-desconto",
      externalReferenceCobranca: "mensalidade:desconto",
      valorCobranca: 100,
      repasseSnapshot: [
        {
          modalidadeId: "modalidade-50",
          modalidadeNome: "Modalidade 50",
          professorId: "professor-50",
          professorNome: "Professor 50",
          plataformaExterna: null,
          valorBase: 100,
          valorRepasseProfessor: 50,
        },
        {
          modalidadeId: "modalidade-60",
          modalidadeNome: "Modalidade 60",
          professorId: "professor-60",
          professorNome: "Professor 60",
          plataformaExterna: null,
          valorBase: 100,
          valorRepasseProfessor: 60,
        },
      ],
    })

    expect(splits.map((split) => Number(split.valorFixoSnapshot))).toEqual([45.45, 54.55])
  })

  it("mantém o parser tolerante aos estados adicionais do provedor", () => {
    expect(statusLocalSplitAsaas("DONE")).toBe("CONCLUIDO")
    expect(statusLocalSplitAsaas("BLOCKED_BY_VALUE_DIVERGENCE")).toBe("BLOQUEADO")
    expect(statusLocalSplitAsaas("NOVO_STATUS")).toBe("ERRO")
    expect(proximoStatusSplitAsaas("CONCLUIDO", "PENDENTE")).toBe("CONCLUIDO")
    expect(proximoStatusSplitAsaas("CONCLUIDO", "ESTORNADO")).toBe("ESTORNADO")
  })
})

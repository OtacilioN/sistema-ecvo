import { Prisma } from "@prisma/client"
import { describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))

import {
  payloadSplitAsaas,
  persistirSplitsRemotos,
  prepararSplitsPagamento,
  proximoStatusSplitAsaas,
  reconciliarSplitsWebhook,
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

  it("prepara split para snapshot legado e preserva valor explícito de outra modalidade", async () => {
    const create = vi.fn(async ({ data }) => ({ id: "split-local-1", ...data }))
    const findManyContas = vi.fn().mockResolvedValue([
      { id: "conta-vinicius", professorId: "vinicius", walletId: "wallet-vinicius" },
      { id: "conta-oyama", professorId: "oyama", walletId: "wallet-oyama" },
    ])
    const tx = {
      splitPagamentoAsaas: { findMany: vi.fn().mockResolvedValue([]), create },
      contaAsaasProfessor: { findMany: findManyContas },
    } as never
    const repasseSnapshot = [
      {
        modalidadeId: "kickboxing",
        modalidadeNome: "Kickboxing",
        professorId: "vinicius",
        professorNome: "Vinicius",
        plataformaExterna: null,
        valorBase: 100,
      },
      {
        modalidadeId: "muay-thai",
        modalidadeNome: "Muay Thai",
        professorId: "oyama",
        professorNome: "Oyama",
        plataformaExterna: null,
        valorBase: 100,
        valorRepasseProfessor: 50,
      },
    ]

    const splits = await prepararSplitsPagamento(tx, {
      cobrancaAsaasId: "cobranca-legada",
      externalReferenceCobranca: "mensalidade:legada",
      valorCobranca: 198,
      repasseSnapshot,
    })

    expect(splits).toHaveLength(2)
    expect(findManyContas).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ professorId: { in: ["vinicius", "oyama"] } }),
      }),
    )
    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        walletIdSnapshot: "wallet-vinicius",
        valorFixoSnapshot: new Prisma.Decimal(60),
        modalidadesSnapshot: [
          { modalidadeId: "kickboxing", modalidadeNome: "Kickboxing", valor: 60 },
        ],
      }),
    })
    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        walletIdSnapshot: "wallet-oyama",
        valorFixoSnapshot: new Prisma.Decimal(50),
        modalidadesSnapshot: [
          { modalidadeId: "muay-thai", modalidadeNome: "Muay Thai", valor: 50 },
        ],
      }),
    })
    expect(repasseSnapshot[0]).not.toHaveProperty("valorRepasseProfessor")
  })

  it.each([
    ["sem valorBase", {}],
    ["com repasse zero", { valorBase: 100, valorRepasseProfessor: 0 }],
    ["com repasse nulo", { valorBase: 100, valorRepasseProfessor: null }],
    ["com repasse inválido", { valorBase: 100, valorRepasseProfessor: "inválido" }],
  ])("não inventa split em snapshot %s", async (_caso, campos) => {
    const findManyContas = vi.fn()
    const tx = {
      splitPagamentoAsaas: { findMany: vi.fn().mockResolvedValue([]) },
      contaAsaasProfessor: { findMany: findManyContas },
    } as never

    const splits = await prepararSplitsPagamento(tx, {
      cobrancaAsaasId: "cobranca-invalida",
      externalReferenceCobranca: "mensalidade:invalida",
      valorCobranca: 100,
      repasseSnapshot: [
        {
          modalidadeId: "kickboxing",
          modalidadeNome: "Kickboxing",
          professorId: "vinicius",
          professorNome: "Vinicius",
          plataformaExterna: null,
          ...campos,
        },
      ],
    })

    expect(splits).toEqual([])
    expect(findManyContas).not.toHaveBeenCalled()
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

  it.each([
    "PENDING",
    "AWAITING_CREDIT",
    undefined,
  ])("conclui o split individual mesmo com snapshot %s", async (status) => {
    const update = vi.fn().mockResolvedValue({})
    const tx = {
      splitPagamentoAsaas: {
        findFirst: vi.fn().mockResolvedValue({
          id: "split-local",
          asaasSplitId: "split-remoto",
          status: "PENDENTE",
        }),
        update,
      },
    } as never
    expect(
      await reconciliarSplitsWebhook(tx, {
        evento: "PAYMENT_SPLIT_DONE",
        splitId: "split-remoto",
        splits: [{ id: "split-remoto", walletId: "wallet", fixedValue: 60, status }],
      }),
    ).toEqual(["split-local"])
    expect(update).toHaveBeenCalledWith({
      where: { id: "split-local" },
      data: expect.objectContaining({ status: "CONCLUIDO", statusAsaas: "DONE" }),
    })
  })

  it("conclui somente o split identificado quando o snapshot contém outro recebedor", async () => {
    const update = vi.fn().mockResolvedValue({})
    const tx = {
      splitPagamentoAsaas: {
        findFirst: vi.fn().mockResolvedValue({
          id: "split-outro",
          asaasSplitId: "remoto-outro",
          status: "PENDENTE",
        }),
        findUnique: vi.fn().mockResolvedValue({
          id: "split-alvo",
          asaasSplitId: "remoto-alvo",
          status: "PENDENTE",
        }),
        update,
      },
    } as never
    expect(
      await reconciliarSplitsWebhook(tx, {
        evento: "PAYMENT_SPLIT_DONE",
        splitId: "remoto-alvo",
        splits: [{ id: "remoto-outro", walletId: "wallet-outro", status: "PENDING" }],
      }),
    ).toEqual(["split-outro", "split-alvo"])
    expect(update).toHaveBeenCalledWith({
      where: { id: "split-outro" },
      data: expect.objectContaining({ status: "PENDENTE" }),
    })
    expect(update).toHaveBeenCalledWith({
      where: { id: "split-alvo" },
      data: expect.objectContaining({ status: "CONCLUIDO", statusAsaas: "DONE" }),
    })
  })

  it("não confirma evento cujo alvo está ausente nem substitui o ID de outro split", async () => {
    const outro = { id: "split-outro", asaasSplitId: "remoto-outro", status: "PENDENTE" }
    const update = vi.fn().mockResolvedValue({})
    const tx = {
      splitPagamentoAsaas: {
        findFirst: vi.fn().mockResolvedValue(outro),
        findUnique: vi.fn().mockResolvedValue(null),
        findMany: vi.fn().mockResolvedValue([outro]),
        update,
      },
    } as never
    expect(
      await reconciliarSplitsWebhook(tx, {
        evento: "PAYMENT_SPLIT_DONE",
        splitId: "remoto-ausente",
        asaasPaymentId: "pay_1",
        splits: [{ id: "remoto-outro", walletId: "wallet-outro", status: "PENDING" }],
      }),
    ).toEqual([])
    expect(update).toHaveBeenCalledTimes(1)
    expect(update).toHaveBeenCalledWith({
      where: { id: "split-outro" },
      data: expect.objectContaining({ asaasSplitId: "remoto-outro", status: "PENDENTE" }),
    })
  })

  it.each([
    { local: "ESTORNADO", remoto: "PENDING" },
    { local: "PENDENTE", remoto: "REFUNDED" },
  ])("preserva o estorno local ou remoto em liquidação atrasada: %o", async (status) => {
    const update = vi.fn().mockResolvedValue({})
    const tx = {
      splitPagamentoAsaas: {
        findFirst: vi.fn().mockResolvedValue({
          id: "split-local",
          asaasSplitId: "split-remoto",
          status: status.local,
        }),
        update,
      },
    } as never
    await reconciliarSplitsWebhook(tx, {
      evento: "PAYMENT_SPLIT_DONE",
      splitId: "split-remoto",
      splits: [{ id: "split-remoto", walletId: "wallet", status: status.remoto }],
    })
    expect(update).toHaveBeenCalledWith({
      where: { id: "split-local" },
      data: expect.objectContaining({ status: "ESTORNADO" }),
    })
  })
})

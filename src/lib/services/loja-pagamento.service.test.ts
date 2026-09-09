import { Prisma } from "@prisma/client"
import { describe, expect, it, vi } from "vitest"
import { payloadSplitLojaAsaas, persistirSplitLojaRemoto } from "./loja-pagamento.service"

const split = {
  id: "split-loja-1",
  walletIdSnapshot: "wallet-loja",
  percentualSplitSnapshot: new Prisma.Decimal(100),
  externalReference: "loja:pedido:1:tentativa:1:split:1",
  status: "PREPARADO" as const,
}

describe("pagamento da loja", () => {
  it("envia exatamente 100% do líquido para a wallet congelada", () => {
    expect(payloadSplitLojaAsaas(split)).toEqual([
      {
        walletId: "wallet-loja",
        percentualValue: 100,
        externalReference: "loja:pedido:1:tentativa:1:split:1",
        description: "Repasse integral líquido da ECVO Loja",
      },
    ])
    expect(payloadSplitLojaAsaas(split)[0]).not.toHaveProperty("fixedValue")
  })

  it("só libera a composição confirmada pela resposta do Asaas", async () => {
    const update = vi.fn().mockResolvedValue({})
    const resultado = await persistirSplitLojaRemoto(
      { splitLojaAsaas: { update } } as never,
      split,
      {
        split: [
          {
            id: "split-remoto-1",
            walletId: "wallet-loja",
            percentualValue: 100,
            status: "PENDING",
            externalReference: split.externalReference,
          },
        ],
      },
    )

    expect(resultado).toEqual({ ok: true })
    expect(update).toHaveBeenCalledWith({
      where: { id: split.id },
      data: {
        asaasSplitId: "split-remoto-1",
        status: "PENDENTE",
        statusAsaas: "PENDING",
        motivo: null,
      },
    })
  })

  it("falha fechada quando wallet ou percentual divergem", async () => {
    const update = vi.fn().mockResolvedValue({})
    const resultado = await persistirSplitLojaRemoto(
      { splitLojaAsaas: { update } } as never,
      split,
      {
        split: [{ walletId: "outra-wallet", percentualValue: 99, status: "PENDING" }],
      },
    )

    expect(resultado).toEqual({
      ok: false,
      motivo: "A cobrança não confirmou o repasse integral à wallet da loja.",
    })
    expect(update).toHaveBeenCalledWith({
      where: { id: split.id },
      data: {
        status: "ERRO",
        motivo: "Split percentual ausente ou divergente na resposta do Asaas.",
      },
    })
  })
})

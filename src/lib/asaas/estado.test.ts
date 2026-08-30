import { describe, expect, it } from "vitest"
import {
  eventoPagamentoParaStatusAsaas,
  proximoStatusCobrancaAsaas,
  proximoStatusContratoPixAutomatico,
} from "@/lib/asaas/estado"

describe("precedência dos estados Asaas", () => {
  it("não regride cobrança recebida por evento vencido atrasado", () => {
    expect(proximoStatusCobrancaAsaas("RECEBIDA", "VENCIDA")).toBe("RECEBIDA")
  })

  it("aceita estorno posterior ao recebimento", () => {
    expect(proximoStatusCobrancaAsaas("RECEBIDA", "ESTORNADA")).toBe("ESTORNADA")
  })

  it("não regride autorização ativa para pendente", () => {
    expect(proximoStatusContratoPixAutomatico("ATIVO", "PENDENTE_AUTORIZACAO")).toBe("ATIVO")
  })

  it("preserva ciclos terminais", () => {
    expect(proximoStatusContratoPixAutomatico("CONCLUIDO", "CANCELADO")).toBe("CONCLUIDO")
  })

  it("mapeia apenas estados financeiros conciliáveis", () => {
    expect(eventoPagamentoParaStatusAsaas("RECEIVED")).toBe("PAYMENT_RECEIVED")
    expect(eventoPagamentoParaStatusAsaas("PENDING")).toBeNull()
  })
})

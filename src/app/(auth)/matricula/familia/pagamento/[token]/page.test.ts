import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({ obter: vi.fn() }))
vi.mock("@/lib/services/matricula-familia.service", () => ({
  obterMatriculaFamiliaPublica: mocks.obter,
}))
vi.mock("@/app/actions/matriculas", () => ({
  acaoGerarPagamentoMatriculaFamilia: vi.fn(),
  acaoReemitirPagamentoMatriculaFamilia: vi.fn(),
}))
vi.mock("../../../pagamento/[token]/atualizador-pagamento", () => ({
  AtualizadorPagamento: () => null,
  CopiarPix: () => null,
}))

import Page from "./page"

function texto(valor: unknown): string {
  if (typeof valor === "string") return valor
  if (Array.isArray(valor)) return valor.map(texto).join(" ")
  if (valor && typeof valor === "object" && "props" in valor)
    return texto((valor as { props: { children?: unknown } }).props.children)
  return ""
}

beforeEach(() => vi.clearAllMocks())

describe("pagamento público da família", () => {
  it.each([
    ["RECEIVED", "RECEBIDA", "Matrícula família confirmada"],
    ["PARTIALLY_REFUNDED", "RECEBIDA", "Pagamento em conciliação"],
    ["REFUNDED", "ESTORNADA", "Pagamento estornado"],
  ])("mostra o estado remoto %s sem dar falsa liberação", async (statusAsaas, status, titulo) => {
    mocks.obter.mockResolvedValue({
      id: "familia",
      titularSolicitacaoId: "pessoa-1",
      pessoas: [1, 2].map((indice) => ({
        id: `pessoa-${indice}`,
        nome: `Pessoa ${indice}`,
        status: "APROVADA",
        plano: { nome: "Valor unitario plano familia", valor: 90 },
        cobrancasAsaas:
          indice === 1
            ? [{ statusAsaas, status, valor: 180, pixCopiaECola: null, qrCodeExpiraEm: null }]
            : [],
      })),
    })
    const resultado = texto(await Page({ params: Promise.resolve({ token: "token-familia" }) }))
    expect(resultado).toContain(titulo)
    expect(resultado).toContain("180,00")
    if (statusAsaas !== "RECEIVED") {
      expect(resultado).not.toContain(
        "Todas as pessoas foram matriculadas e já podem acessar suas contas.",
      )
      expect(resultado).not.toContain("Atualizar cobrança PIX")
    }
  })
})

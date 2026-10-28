import { renderToStaticMarkup } from "react-dom/server"
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
        plano: { nome: "Valor unitario plano familia", valor: 90, valorBase: 100 },
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

  it.each([
    { pessoas: 2, total: "180,00", base: "200,00" },
    { pessoas: 3, total: "270,00", base: "300,00" },
    { pessoas: 4, total: "360,00", base: "400,00" },
  ])("informa o bônus sobre o total de $pessoas pessoas", async (caso) => {
    mocks.obter.mockResolvedValue({
      id: "familia",
      titularSolicitacaoId: "pessoa-1",
      pessoas: Array.from({ length: caso.pessoas }, (_, indice) => ({
        id: `pessoa-${indice + 1}`,
        nome: `Pessoa ${indice + 1}`,
        status: "APROVADA",
        plano: { nome: "Plano família", valor: 90, valorBase: 100 },
        cobrancasAsaas:
          indice === 0
            ? [
                {
                  statusAsaas: "RECEIVED",
                  status: "RECEBIDA",
                  valor: 90 * caso.pessoas,
                  pixCopiaECola: null,
                  qrCodeExpiraEm: null,
                },
              ]
            : [],
      })),
    })

    const html = renderToStaticMarkup(
      await Page({ params: Promise.resolve({ token: "token-familia" }) }),
    )

    expect(html).toContain(caso.total)
    expect(html).toContain(
      "Total mensal com bônus de adimplência até o vencimento. A partir do dia seguinte ao vencimento:",
    )
    expect(html).toContain(`${caso.base}/mês`)
  })
})

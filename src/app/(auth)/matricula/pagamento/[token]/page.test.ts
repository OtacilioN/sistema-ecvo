import { renderToStaticMarkup } from "react-dom/server"
import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({ obter: vi.fn() }))
vi.mock("@/lib/services/pagamento-matricula.service", () => ({
  obterPagamentoMatriculaPublico: mocks.obter,
  pixCobrancaMatriculaDisponivel: () => false,
}))
vi.mock("@/app/actions/matriculas", () => ({
  acaoGerarPagamentoMatricula: vi.fn(),
  acaoReemitirPagamentoMatricula: vi.fn(),
}))
vi.mock("./atualizador-pagamento", () => ({
  AtualizadorPagamento: () => null,
  CopiarPix: () => null,
}))

import Page from "./page"

function pagamento(tipoPagamento = "MENSALISTA", valor = 270, valorBase = 290) {
  return {
    tipoPagamento,
    plano: { nome: "3 modalidades", valor, valorBase },
    cobrancasAsaas: [{ status: "RECEBIDA", valor, pixCopiaECola: null, qrCodeExpiraEm: null }],
  }
}

beforeEach(() => vi.clearAllMocks())

describe("aviso de bônus no pagamento individual da matrícula", () => {
  it("informa o bônus e o valor base junto ao preço das três modalidades", async () => {
    mocks.obter.mockResolvedValue(pagamento())

    const html = renderToStaticMarkup(await Page({ params: Promise.resolve({ token: "token" }) }))

    expect(html).toMatch(/3 modalidades[^<]*270,00/)
    expect(html).toContain(
      "Mensalidade com bônus de adimplência até o vencimento. A partir do dia seguinte ao vencimento:",
    )
    expect(html).toContain("290,00/mês")
    expect(html).toContain("text-xs leading-relaxed text-muted-foreground")
  })

  it("não apresenta bônus de mensalidade no pagamento de R$ 20 da aula avulsa", async () => {
    mocks.obter.mockResolvedValue(pagamento("AULA_AVULSA", 20, 120))

    const html = renderToStaticMarkup(await Page({ params: Promise.resolve({ token: "token" }) }))

    expect(html).toContain("20,00")
    expect(html).not.toContain("bônus de adimplência")
    expect(html).not.toContain("120,00/mês")
  })

  it("omite o aviso quando o plano não possui bônus", async () => {
    mocks.obter.mockResolvedValue(pagamento("MENSALISTA", 175, 175))

    const html = renderToStaticMarkup(await Page({ params: Promise.resolve({ token: "token" }) }))

    expect(html).not.toContain("bônus de adimplência")
  })

  it("informa análise manual após o PIX pago com desconto para aluno antigo", async () => {
    mocks.obter.mockResolvedValue({
      ...pagamento("MENSALISTA", 90, 120),
      descontoAlunoAntigo: true,
      status: "PENDENTE",
    })

    const html = renderToStaticMarkup(await Page({ params: Promise.resolve({ token: "token" }) }))
    expect(html).toContain("90,00")
    expect(html).toContain("120,00/mês")
    expect(html).toContain("aguarda análise da equipe")
    expect(html).not.toContain("matrícula foi aprovada")
  })

  it("só informa matrícula aprovada quando o estado confirma a aprovação", async () => {
    mocks.obter.mockResolvedValue({
      ...pagamento("MENSALISTA", 90, 120),
      descontoAlunoAntigo: true,
      status: "APROVADA",
    })

    const html = renderToStaticMarkup(await Page({ params: Promise.resolve({ token: "token" }) }))
    expect(html).toContain("sua matrícula foi aprovada")
    expect(html).not.toContain("aguarda análise da equipe")
  })

  it("informa estorno sem oferecer uma nova cobrança", async () => {
    mocks.obter.mockResolvedValue({
      ...pagamento("MENSALISTA", 90, 120),
      descontoAlunoAntigo: true,
      status: "PENDENTE",
      cobrancasAsaas: [{ status: "ESTORNADA", valor: 90 }],
    })

    const html = renderToStaticMarkup(await Page({ params: Promise.resolve({ token: "token" }) }))
    expect(html).toContain("Pagamento estornado")
    expect(html).toContain("Entre em contato com a equipe")
    expect(html).not.toContain("Atualizar cobrança PIX")
  })
})

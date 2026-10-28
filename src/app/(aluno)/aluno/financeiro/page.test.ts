import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  aluno: vi.fn(),
  qrCode: vi.fn(),
}))

vi.mock("@/lib/auth/dal", () => ({ exigirAluno: async () => ({ alunoId: "aluno-1" }) }))
vi.mock("@/lib/db", () => ({ db: { aluno: { findUnique: mocks.aluno } } }))
vi.mock("qrcode", () => ({ default: { toDataURL: mocks.qrCode } }))
vi.mock("@/lib/services/pagamento-matricula.service", () => ({
  obterConversaoAulaAvulsa: async () => null,
  pixCobrancaMatriculaDisponivel: () => false,
}))
vi.mock("./fechar-mensalidade-aula-avulsa", () => ({ FecharMensalidadeAulaAvulsa: () => null }))
vi.mock("./pagamento-pix", () => ({
  CancelarPixAutomatico: () => null,
  ProgramarPixRecorrente: (props: { totalCiclosInicial?: number; rotuloAcao?: string }) =>
    createElement(
      "div",
      { "data-testid": "programar-pix", "data-ciclos": props.totalCiclosInicial ?? 3 },
      props.rotuloAcao ?? "Programar PIX recorrente",
    ),
  PagamentoPix: (props: { pixCopiaECola?: string | null; qrCodeDataUrl?: string | null }) =>
    createElement("div", {
      "data-testid": "pagamento-pix",
      "data-pix": props.pixCopiaECola ?? "",
      "data-qr": props.qrCodeDataUrl ?? "",
    }),
}))

import Page from "./page"

function alunoFinanceiro(params?: {
  valorCobrado?: number
  paga?: boolean
  valor?: number
  semCobranca?: boolean
  valorPlano?: number
  valorBasePlano?: number
  statusAluno?: string
  contrato?: {
    status: string
    totalCiclos?: 3 | 6
    atualizadoEm?: Date
    pixCopiaECola?: string | null
    qrCodeExpiraEm?: Date | null
  }
}) {
  return {
    id: "aluno-1",
    cpf: "12345678901",
    responsavel: null,
    tipo: "MENSALISTA",
    status: params?.statusAluno ?? "ATIVO",
    planoId: "plano-1",
    plano: {
      id: "plano-1",
      nome: "Plano mensal",
      valor: params?.valorPlano ?? 100,
      valorBase: params?.valorBasePlano ?? 120,
      periodicidade: "MENSAL",
      ativo: true,
    },
    diaVencimento: 10,
    modalidadesPlano: [{ modalidade: { nome: "Jiu-Jitsu" } }],
    contratosPixAutomatico: params?.contrato
      ? [{ id: "contrato-1", atualizadoEm: new Date("2026-11-01T12:00:00Z"), ...params.contrato }]
      : [],
    pagamentos: [],
    mensalidades: [
      {
        id: "mensalidade-1",
        competencia: "2026-11",
        vencimento: new Date("2026-11-10T12:00:00Z"),
        valor: params?.valor ?? 100,
        valorComDesconto: 100,
        valorBase: 120,
        status: params?.paga ? "PAGA" : "VENCIDA",
        numeroCicloPix: params?.contrato ? 2 : null,
        contratoPixAutomaticoId: params?.contrato ? "contrato-1" : null,
        cobrancasAsaas: params?.semCobranca
          ? []
          : [
              {
                id: "cobranca-1",
                tipo: "PIX_MENSAL",
                status: params?.paga ? "RECEBIDA" : "PENDENTE",
                ativa: true,
                valorCobrado: params?.valorCobrado ?? 100,
                pixCopiaECola: `PIX-${params?.valorCobrado ?? 100}`,
                qrCodeExpiraEm: new Date("2026-12-01T03:00:00Z"),
              },
            ],
      },
    ],
  }
}

async function renderizar() {
  const pagina = await Page()
  const html = renderToStaticMarkup(pagina)
  return {
    html,
    aviso:
      html.match(
        /<section[^>]*aria-labelledby="aviso-desconto-adimplencia"[\s\S]*?<\/section>/,
      )?.[0] ?? "",
    valorMensalidade: html.match(/data-label="Valor"[^>]*>([\s\S]*?)<\/td>/)?.[1] ?? "",
  }
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date("2026-11-11T12:00:00Z"))
  mocks.aluno.mockReset().mockResolvedValue(alunoFinanceiro())
  mocks.qrCode.mockReset().mockResolvedValue("data:image/png;base64,QR")
})

describe("programação de PIX recorrente no financeiro do aluno", () => {
  it("oferece programação mesmo quando a mensalidade atual já está paga", async () => {
    mocks.aluno.mockResolvedValue(alunoFinanceiro({ paga: true }))

    const { html } = await renderizar()

    expect(html).toContain("Seu desconto, em dia.")
    expect(html).toContain("por 3 ou 6 meses")
    expect(html).toContain("Autorize no app do banco e mantenha saldo")
    expect(html).toContain("A mensalidade atual está quitada.")
    expect(html).toContain("próxima competência")
    expect(html.match(/data-testid="programar-pix"/g)).toHaveLength(1)
    expect(html).toContain('data-ciclos="3"')
  })

  it("oferece a programação antes da emissão de um PIX mensal", async () => {
    mocks.aluno.mockResolvedValue(alunoFinanceiro({ semCobranca: true }))

    const { html } = await renderizar()

    expect(html.match(/data-testid="programar-pix"/g)).toHaveLength(1)
    expect(html).toContain("O bônus de adimplência depende do pagamento dentro do prazo.")
  })

  it("mantém o PIX mensal em andamento e explica quando a programação ficará disponível", async () => {
    const { html } = await renderizar()

    expect(html).toContain("Há um PIX mensal em andamento.")
    expect(html).toContain("Após a confirmação desse pagamento")
    expect(html).not.toContain('data-testid="programar-pix"')
  })

  it.each([
    3, 6,
  ] as const)("mostra a duração e parcela reais do contrato ativo de %i meses", async (totalCiclos) => {
    mocks.aluno.mockResolvedValue(alunoFinanceiro({ contrato: { status: "ATIVO", totalCiclos } }))

    const { html } = await renderizar()

    expect(html).toContain(`PIX Automático — ${totalCiclos} meses`)
    expect(html).toContain(`Sua programação de ${totalCiclos} meses está ativa.`)
    expect(html).toContain(`Mensalidade 2 de ${totalCiclos}.`)
    expect(html).not.toContain('data-testid="programar-pix"')
    expect(html).not.toContain("próximas cinco")
  })

  it("não oferece outro contrato enquanto uma autorização válida aguarda confirmação", async () => {
    mocks.aluno.mockResolvedValue(
      alunoFinanceiro({
        contrato: {
          status: "PENDENTE_AUTORIZACAO",
          totalCiclos: 3,
          pixCopiaECola: "PIX-AUTORIZACAO",
          qrCodeExpiraEm: new Date("2026-11-12T12:00:00Z"),
        },
      }),
    )

    const { html } = await renderizar()

    expect(html).toContain("aguardando sua autorização no app do banco")
    expect(html).toContain("autoriza 2 débitos mensais seguintes")
    expect(html).not.toContain('data-testid="programar-pix"')
  })

  it("oferece retomada segura de QR de autorização expirado com a duração original", async () => {
    mocks.aluno.mockResolvedValue(
      alunoFinanceiro({
        contrato: {
          status: "PENDENTE_AUTORIZACAO",
          totalCiclos: 6,
          pixCopiaECola: "PIX-ANTIGO",
          qrCodeExpiraEm: new Date("2026-11-10T12:00:00Z"),
        },
      }),
    )

    const { html } = await renderizar()

    expect(html).toContain("Retomar programação PIX")
    expect(html).toContain('data-ciclos="6"')
    expect(html).not.toContain('data-pix="PIX-ANTIGO"')
  })

  it("usa uma chamada de praticidade para planos sem diferença entre os preços", async () => {
    mocks.aluno.mockResolvedValue(alunoFinanceiro({ paga: true, valorBasePlano: 100 }))

    const { html } = await renderizar()

    expect(html).toContain("Suas mensalidades, em dia.")
    expect(html).not.toContain("Seu desconto, em dia.")
    expect(html).not.toContain("O bônus de adimplência depende")
  })

  it.each([
    { valorPlano: 0, valorBasePlano: 0 },
    { statusAluno: "TRANCADO" },
    { statusAluno: "CANCELADO" },
  ])("não oferece programação para plano/aluno inelegível: %o", async (condicao) => {
    mocks.aluno.mockResolvedValue(alunoFinanceiro({ paga: true, ...condicao }))

    const { html } = await renderizar()

    expect(html).not.toContain('id="programar-pix-recorrente"')
    expect(html).not.toContain('data-testid="programar-pix"')
  })
})

afterEach(() => vi.useRealTimers())

describe("aviso de desconto no financeiro do aluno", () => {
  it("informa o desconto até o vencimento e o valor a partir do dia seguinte", async () => {
    vi.setSystemTime(new Date("2026-11-10T12:00:00Z"))

    const { aviso, valorMensalidade } = await renderizar()

    expect(aviso).toContain("Mantenha seu desconto de adimplência")
    expect(aviso).toContain("O desconto vale até o vencimento.")
    expect(aviso).toContain("A partir do dia seguinte ao vencimento")
    expect(aviso).not.toContain("0º dia")
    expect(aviso).not.toContain("0 dias")
    expect(aviso).toContain("100,00")
    expect(aviso).toContain("120,00")
    expect(valorMensalidade).toContain("100,00")
  })

  it("mantém desconto e QR de R$ 100 até o último instante do vencimento", async () => {
    vi.setSystemTime(new Date("2026-11-11T02:59:59.999Z"))

    const { html, aviso, valorMensalidade } = await renderizar()

    expect(aviso).toContain("Mantenha seu desconto de adimplência")
    expect(valorMensalidade).toContain("100,00")
    expect(html).toContain('data-pix="PIX-100"')
    expect(mocks.qrCode).toHaveBeenCalledWith("PIX-100", { margin: 1 })
  })

  it("no dia seguinte ao vencimento exibe R$ 120 e oculta o QR emitido pelo preço antigo", async () => {
    vi.setSystemTime(new Date("2026-11-11T03:00:00.000Z"))

    const { html, aviso, valorMensalidade } = await renderizar()

    expect(aviso).toContain("Desconto de adimplência perdido")
    expect(aviso).toContain("o prazo terminou em 10/11/2026")
    expect(aviso).toContain("120,00")
    expect(valorMensalidade).toContain("120,00")
    expect(valorMensalidade).toContain("Sem desconto de adimplência")
    expect(html).toContain('data-pix=""')
    expect(html).not.toContain("PIX-100")
    expect(mocks.qrCode).not.toHaveBeenCalled()
  })

  it("exibe o QR substituído pelo valor base no dia seguinte ao vencimento", async () => {
    vi.setSystemTime(new Date("2026-11-11T03:00:00.000Z"))
    mocks.aluno.mockResolvedValue(alunoFinanceiro({ valorCobrado: 120, valor: 120 }))

    const { html } = await renderizar()

    expect(html).toContain('data-pix="PIX-120"')
    expect(mocks.qrCode).toHaveBeenCalledWith("PIX-120", { margin: 1 })
  })

  it("preserva os R$ 100 pagos e evita aviso de perda para uma mensalidade quitada", async () => {
    vi.setSystemTime(new Date("2026-11-30T12:00:00Z"))
    mocks.aluno.mockResolvedValue(alunoFinanceiro({ paga: true }))

    const { aviso, valorMensalidade } = await renderizar()

    expect(aviso).toContain("Mantenha seu desconto de adimplência")
    expect(aviso).not.toContain("Desconto de adimplência perdido")
    expect(aviso).not.toContain("está em risco")
    expect(valorMensalidade).toContain("100,00")
    expect(valorMensalidade).not.toContain("120,00")
    expect(mocks.qrCode).not.toHaveBeenCalled()
  })
})

import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"

vi.mock("@/app/actions/financeiro", () => ({
  acaoAtivarPixAutomaticoAluno: vi.fn(),
  acaoCancelarPixAutomaticoAluno: vi.fn(),
  acaoGerarCobrancaPixAluno: vi.fn(),
  acaoAtualizarPlano: vi.fn(),
  acaoAtualizarStatusMensalidade: vi.fn(),
  acaoBaixarMensalidade: vi.fn(),
  acaoConfigurarTipoCobrancaPix: vi.fn(),
  acaoCriarPlano: vi.fn(),
  acaoDarBaixaMensalidadeAluno: vi.fn(),
  acaoExcluirPlano: vi.fn(),
  acaoPagamentoAvulso: vi.fn(),
  acaoVincularPlano: vi.fn(),
}))

import { FormTipoCobrancaPix } from "@/app/(gestor)/gestao/financeiro/forms-financeiro"
import { PagamentoPix, ProgramarPixRecorrente } from "./pagamento-pix"

describe("escolha da duração do PIX recorrente", () => {
  it("envia totalCiclos e seleciona três meses como padrão, oferecendo também seis", () => {
    const html = renderToStaticMarkup(createElement(ProgramarPixRecorrente))

    expect(html).toMatch(/<select[^>]*name="totalCiclos"/)
    expect(html).toMatch(/<option value="3" selected="">3 meses<\/option>/)
    expect(html).toContain('<option value="6">6 meses</option>')
    expect(html).toContain("Programar PIX recorrente")
    expect(html).not.toContain("recomendado")
  })

  it("preserva seis meses ao retomar uma programação existente", () => {
    const html = renderToStaticMarkup(
      createElement(ProgramarPixRecorrente, {
        totalCiclosInicial: 6,
        rotuloAcao: "Retomar programação PIX",
      }),
    )

    expect(html).toMatch(/<option value="6" selected="">6 meses<\/option>/)
    expect(html).toContain("Retomar programação PIX")
  })

  it("mantém a opção de duração na chamada de recorrência junto à geração mensal", () => {
    const html = renderToStaticMarkup(
      createElement(PagamentoPix, {
        mensalidadeId: "mensalidade-1",
        permitirPixRecorrente: true,
      }),
    )

    expect(html).toContain('name="mensalidadeId" value="mensalidade-1"')
    expect(html).toContain('name="totalCiclos"')
    expect(html).toContain("Gerar QR Code PIX")
    expect(html).toContain("Programar PIX recorrente")
  })

  it("preserva o QR mensal e o botão de copiar sem gerar outra programação", () => {
    const html = renderToStaticMarkup(
      createElement(PagamentoPix, {
        mensalidadeId: "mensalidade-1",
        pixCopiaECola: "PIX-MENSAL",
        qrCodeDataUrl: "data:image/png;base64,AAAA",
      }),
    )

    expect(html).toContain("PIX-MENSAL")
    expect(html).toContain("Copiar código PIX")
    expect(html).not.toContain('name="totalCiclos"')
  })

  it("oferece os modos trimestral e semestral na configuração da gestão", () => {
    const html = renderToStaticMarkup(createElement(FormTipoCobrancaPix, { alunos: [] }))

    expect(html).toContain('value="AUTOMATICO_TRIMESTRAL"')
    expect(html).toContain('value="AUTOMATICO_SEMESTRAL"')
    expect(html).toContain("programação de 3 ou 6 mensalidades")
    expect(html).not.toContain("cinco débitos")
  })
})

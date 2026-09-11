import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"
import { AvisoCpfPendente } from "./aviso-cpf-pendente"

describe("AvisoCpfPendente", () => {
  it("orienta o aluno sem CPF e oferece acesso direto à edição", () => {
    const html = renderToStaticMarkup(AvisoCpfPendente({ cpf: null, responsavel: null }))

    expect(html).toContain("CPF necessário para liberar pagamentos")
    expect(html).toContain("Complete seu cadastro com um CPF válido")
    expect(html).toContain('href="/aluno/perfil?editar=dados"')
  })

  it("não aparece quando o CPF do aluno é válido", () => {
    const html = renderToStaticMarkup(
      AvisoCpfPendente({ cpf: "529.982.247-25", responsavel: null }),
    )

    expect(html).toBe("")
  })

  it("considera o CPF do responsável financeiro", () => {
    const html = renderToStaticMarkup(
      AvisoCpfPendente({
        cpf: null,
        responsavel: { cpf: "52998224725", responsavelFinanceiro: true },
      }),
    )

    expect(html).toBe("")
  })

  it("orienta o preenchimento do responsável financeiro quando necessário", () => {
    const html = renderToStaticMarkup(
      AvisoCpfPendente({
        cpf: "52998224725",
        responsavel: { cpf: null, responsavelFinanceiro: true },
      }),
    )

    expect(html).toContain("Informe um CPF válido para o responsável financeiro")
  })
})

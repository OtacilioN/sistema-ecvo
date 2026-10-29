import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  exigirPapel: vi.fn(),
  baixarMensalidadeManual: vi.fn(),
  darBaixaMensalidadeAlunoManual: vi.fn(),
  revalidar: vi.fn(),
}))
vi.mock("@/lib/auth/dal", () => ({ exigirPapel: mocks.exigirPapel }))
vi.mock("@/lib/db", () => ({ db: {} }))
vi.mock("@/lib/services/baixa-manual.service", () => ({
  baixarMensalidadeManual: mocks.baixarMensalidadeManual,
  darBaixaMensalidadeAlunoManual: mocks.darBaixaMensalidadeAlunoManual,
}))
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidar }))

import { acaoBaixarMensalidade, acaoDarBaixaMensalidadeAluno } from "./financeiro"

beforeEach(() => {
  vi.clearAllMocks()
  mocks.exigirPapel.mockResolvedValue({ id: "gestor-1" })
  mocks.baixarMensalidadeManual.mockResolvedValue({ ok: true })
  mocks.darBaixaMensalidadeAlunoManual.mockResolvedValue({ ok: true })
})

describe.each([
  {
    nome: "financeiro",
    acao: acaoBaixarMensalidade,
    servico: mocks.baixarMensalidadeManual,
    campos: { mensalidadeId: "mensalidade-1" },
  },
  {
    nome: "lista de alunos",
    acao: acaoDarBaixaMensalidadeAluno,
    servico: mocks.darBaixaMensalidadeAlunoManual,
    campos: { alunoId: "aluno-1", competencia: "2026-11" },
  },
])("baixa manual pela $nome", ({ acao, servico, campos }) => {
  function formulario(confirmacao?: string) {
    const dados = new FormData()
    for (const [nome, valor] of Object.entries(campos)) dados.set(nome, valor)
    dados.set("formaPagamento", "Pix")
    dados.set("autorId", "usuario-nao-autorizado")
    if (confirmacao !== undefined) dados.set("confirmarCancelamentoPixAutomatico", confirmacao)
    return dados
  }

  it.each([
    [undefined, false],
    ["false", false],
    ["on", true],
  ])("encaminha a confirmação %s com a identidade da sessão", async (confirmacao, esperada) => {
    expect(await acao(undefined, formulario(confirmacao))).toEqual({ ok: true })
    expect(mocks.exigirPapel).toHaveBeenCalledWith("GESTOR")
    expect(servico).toHaveBeenCalledWith({
      ...campos,
      formaPagamento: "Pix",
      observacao: null,
      confirmarCancelamentoPixAutomatico: esperada,
      autorId: "gestor-1",
    })
  })

  it("pede confirmação na tela se o servidor encontrar um contrato em andamento", async () => {
    servico.mockResolvedValueOnce({
      ok: false,
      motivo: "Confirme o encerramento de todo o Pix recorrente.",
      confirmacaoPixAutomaticoNecessaria: true,
    })

    expect(await acao(undefined, formulario())).toEqual({
      erro: "Confirme o encerramento de todo o Pix recorrente.",
      confirmacaoPixAutomaticoNecessaria: true,
    })
  })

  it("preserva erros normais sem indicar necessidade de confirmação", async () => {
    servico.mockResolvedValueOnce({ ok: false, motivo: "A mensalidade já está paga." })
    expect(await acao(undefined, formulario())).toEqual({ erro: "A mensalidade já está paga." })
  })

  it("bloqueia a operação sem autorização de gestor", async () => {
    mocks.exigirPapel.mockRejectedValueOnce(new Error("Acesso negado"))
    await expect(acao(undefined, formulario("on"))).rejects.toThrow("Acesso negado")
    expect(servico).not.toHaveBeenCalled()
  })
})

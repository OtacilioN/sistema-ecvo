import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  exigirPapel: vi.fn(),
  destrancar: vi.fn(),
  revalidar: vi.fn(),
}))

vi.mock("@/lib/auth/dal", () => ({ exigirPapel: mocks.exigirPapel }))
vi.mock("@/lib/services/destrancamento-manual.service", () => ({
  destrancarAlunoComPagamentoManual: mocks.destrancar,
}))
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidar }))

import { acaoDestrancarAlunoComPagamento } from "./destrancamento"

function formulario(alteracoes: Partial<Record<string, string>> = {}) {
  const dados = new FormData()
  const campos = {
    alunoId: "aluno-1",
    competencia: "2026-11",
    valor: "90.50",
    pagoEm: "2026-11-16",
    formaPagamento: "PIX",
    observacao: "  Pagamento conferido no extrato.  ",
    autorId: "gestor-forjado",
    ...alteracoes,
  }
  for (const [campo, valor] of Object.entries(campos)) {
    if (valor !== undefined) dados.set(campo, valor)
  }
  return dados
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers()
  vi.setSystemTime(new Date("2026-11-16T15:00:00.000Z"))
  mocks.exigirPapel.mockResolvedValue({ id: "gestor-da-sessao" })
  mocks.destrancar.mockResolvedValue({ ok: true, mensalidadeId: "mensalidade-1" })
})

afterEach(() => vi.useRealTimers())

describe("destrancamento manual pela lista de alunos", () => {
  it("encaminha o pagamento com data civil e a identidade da sessão", async () => {
    expect(await acaoDestrancarAlunoComPagamento(undefined, formulario())).toEqual({ ok: true })
    expect(mocks.exigirPapel).toHaveBeenCalledWith("GESTOR")
    expect(mocks.destrancar).toHaveBeenCalledWith({
      alunoId: "aluno-1",
      competencia: "2026-11",
      valor: 90.5,
      pagoEm: new Date("2026-11-16T15:00:00.000Z"),
      formaPagamento: "PIX",
      observacao: "Pagamento conferido no extrato.",
      autorId: "gestor-da-sessao",
    })
    expect(mocks.revalidar.mock.calls).toEqual([
      ["/gestao/alunos"],
      ["/gestao/financeiro"],
      ["/gestao/auditoria"],
      ["/aluno", "layout"],
      ["/reativar-matricula"],
    ])
  })

  it.each([
    "0",
    "-10",
    "NaN",
    "Infinity",
    "90.123",
    "",
  ])("rejeita valor inválido %s antes de chamar o serviço", async (valor) => {
    expect(await acaoDestrancarAlunoComPagamento(undefined, formulario({ valor }))).toEqual({
      erro: expect.any(String),
    })
    expect(mocks.destrancar).not.toHaveBeenCalled()
    expect(mocks.revalidar).not.toHaveBeenCalled()
  })

  it.each([
    { pagoEm: "2026-11-31" },
    { pagoEm: "2026-11-00" },
    { pagoEm: "data-invalida" },
    { pagoEm: "2026-11-17" },
    { pagoEm: "2026-10-31" },
    { competencia: "2026-10" },
    { competencia: "2026-13" },
  ])("rejeita data ou competência inválida: %j", async (alteracoes) => {
    expect(await acaoDestrancarAlunoComPagamento(undefined, formulario(alteracoes))).toEqual({
      erro: expect.any(String),
    })
    expect(mocks.destrancar).not.toHaveBeenCalled()
    expect(mocks.revalidar).not.toHaveBeenCalled()
  })

  it("usa o dia da academia para impedir uma data que já virou amanhã em UTC", async () => {
    vi.setSystemTime(new Date("2026-11-17T01:00:00.000Z"))
    const resultado = await acaoDestrancarAlunoComPagamento(
      undefined,
      formulario({ pagoEm: "2026-11-17" }),
    )
    expect(resultado).toEqual({ erro: "A data do pagamento não pode ser futura." })
    expect(mocks.destrancar).not.toHaveBeenCalled()
  })

  it("exige observação e rejeita um método desconhecido", async () => {
    for (const alteracoes of [{ observacao: "   " }, { formaPagamento: "método-inventado" }]) {
      expect(await acaoDestrancarAlunoComPagamento(undefined, formulario(alteracoes))).toEqual({
        erro: expect.any(String),
      })
    }
    expect(mocks.destrancar).not.toHaveBeenCalled()
  })

  it.each([
    "PIX",
    "DINHEIRO",
    "CARTAO",
    "TRANSFERENCIA",
    "OUTRO",
    "MANUAL",
  ])("aceita o método %s", async (formaPagamento) => {
    expect(
      await acaoDestrancarAlunoComPagamento(undefined, formulario({ formaPagamento })),
    ).toEqual({ ok: true })
    expect(mocks.destrancar).toHaveBeenCalledWith(expect.objectContaining({ formaPagamento }))
  })

  it("usa MANUAL quando a forma de pagamento não foi informada", async () => {
    const dados = formulario()
    dados.delete("formaPagamento")
    expect(await acaoDestrancarAlunoComPagamento(undefined, dados)).toEqual({ ok: true })
    expect(mocks.destrancar).toHaveBeenCalledWith(
      expect.objectContaining({ formaPagamento: "MANUAL" }),
    )
  })

  it("preserva o bloqueio do serviço sem indicar sucesso", async () => {
    mocks.destrancar.mockResolvedValueOnce({
      ok: false,
      motivo: "Regularize as mensalidades anteriores antes de destrancar.",
    })
    expect(await acaoDestrancarAlunoComPagamento(undefined, formulario())).toEqual({
      erro: "Regularize as mensalidades anteriores antes de destrancar.",
    })
    expect(mocks.revalidar).not.toHaveBeenCalled()
  })

  it("impede o pagamento se a DAL negar a autorização", async () => {
    mocks.exigirPapel.mockRejectedValueOnce(new Error("Acesso negado"))
    await expect(acaoDestrancarAlunoComPagamento(undefined, formulario())).rejects.toThrow(
      "Acesso negado",
    )
    expect(mocks.destrancar).not.toHaveBeenCalled()
    expect(mocks.revalidar).not.toHaveBeenCalled()
  })
})

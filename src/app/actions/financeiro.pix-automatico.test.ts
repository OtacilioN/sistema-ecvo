import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({ exigirAluno: vi.fn(), configurar: vi.fn(), revalidar: vi.fn() }))
vi.mock("@/lib/auth/dal", () => ({ exigirAluno: mocks.exigirAluno, exigirPapel: vi.fn() }))
vi.mock("@/lib/services/asaas.service", () => ({ configurarTipoCobrancaPix: mocks.configurar }))
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidar }))

import { acaoAtivarPixAutomaticoAluno } from "./financeiro"

beforeEach(() => {
  vi.clearAllMocks()
  mocks.exigirAluno.mockResolvedValue({ alunoId: "aluno-da-sessao", usuario: { id: "usuario-1" } })
  mocks.configurar.mockResolvedValue({ ok: true })
})

describe("ativação do Pix recorrente pelo aluno", () => {
  it.each([
    ["3", "AUTOMATICO_TRIMESTRAL"],
    ["6", "AUTOMATICO_SEMESTRAL"],
  ])("encaminha o prazo de %s meses usando somente a identidade da sessão", async (prazo, tipo) => {
    const dados = new FormData()
    dados.set("totalCiclos", prazo)
    dados.set("alunoId", "outro-aluno")
    expect(await acaoAtivarPixAutomaticoAluno(undefined, dados)).toEqual({ ok: true })
    expect(mocks.configurar).toHaveBeenCalledWith({
      alunoId: "aluno-da-sessao",
      tipoCobrancaPix: tipo,
      autorId: "usuario-1",
    })
    expect(mocks.revalidar).toHaveBeenCalledWith("/aluno/financeiro")
  })

  it("rejeita prazo inválido antes de criar qualquer autorização", async () => {
    const dados = new FormData()
    dados.set("totalCiclos", "12")
    expect(await acaoAtivarPixAutomaticoAluno(undefined, dados)).toEqual({
      erro: "Escolha 3 ou 6 meses para o Pix recorrente.",
    })
    expect(mocks.configurar).not.toHaveBeenCalled()
  })

  it("mantém compatibilidade com formulários antigos sem seleção de prazo", async () => {
    await acaoAtivarPixAutomaticoAluno(undefined, new FormData())
    expect(mocks.configurar).toHaveBeenCalledWith(
      expect.objectContaining({ tipoCobrancaPix: "AUTOMATICO_SEMESTRAL" }),
    )
  })

  it("exige a sessão do aluno antes de processar o pedido", async () => {
    mocks.exigirAluno.mockRejectedValueOnce(new Error("Sessão inválida"))
    await expect(acaoAtivarPixAutomaticoAluno(undefined, new FormData())).rejects.toThrow(
      "Sessão inválida",
    )
    expect(mocks.configurar).not.toHaveBeenCalled()
  })
})

import { beforeEach, describe, expect, it, vi } from "vitest"
import { CUSTOS_FIXOS_PADRAO } from "@/lib/financeiro/custos-fixos"

const mocks = vi.hoisted(() => ({
  exigirPapel: vi.fn(),
  salvar: vi.fn(),
  revalidatePath: vi.fn(),
}))

vi.mock("@/lib/auth/dal", () => ({ exigirPapel: mocks.exigirPapel }))
vi.mock("@/lib/services/custos-fixos.service", () => ({ salvarCustosFixosMensais: mocks.salvar }))
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }))

import { acaoSalvarCustosFixos } from "./custos-fixos"

function formulario() {
  const form = new FormData()
  form.set("competencia", "2026-09")
  for (const [nome, valor] of Object.entries(CUSTOS_FIXOS_PADRAO)) form.set(nome, String(valor))
  return form
}

beforeEach(() => {
  vi.resetAllMocks()
  mocks.exigirPapel.mockResolvedValue({ id: "gestor-teste", papel: "GESTOR" })
})

describe("salvar custos fixos pela ação", () => {
  it("exige gestor antes de persistir, mesmo em chamada direta", async () => {
    mocks.exigirPapel.mockRejectedValue(new Error("acesso negado"))
    await expect(acaoSalvarCustosFixos(undefined, formulario())).rejects.toThrow("acesso negado")
    expect(mocks.exigirPapel).toHaveBeenCalledWith("GESTOR")
    expect(mocks.salvar).not.toHaveBeenCalled()
  })

  it.each([
    "",
    " ",
    "-1",
    "NaN",
    "Infinity",
    "1.001",
  ])("rejeita custo inválido %s", async (valor) => {
    const form = formulario()
    form.set("outros", valor)
    expect(await acaoSalvarCustosFixos(undefined, form)).toHaveProperty("erro")
    expect(mocks.salvar).not.toHaveBeenCalled()
  })

  it("rejeita campo ausente e competência inválida", async () => {
    const form = formulario()
    form.delete("aluguel")
    expect(await acaoSalvarCustosFixos(undefined, form)).toHaveProperty("erro")
    const outro = formulario()
    outro.set("competencia", "2026-13")
    expect(await acaoSalvarCustosFixos(undefined, outro)).toHaveProperty("erro")
    expect(mocks.salvar).not.toHaveBeenCalled()
  })

  it("preserva zero e centavos, usa autor da sessão e atualiza o relatório", async () => {
    const form = formulario()
    form.set("aluguel", "0")
    form.set("outros", "15.25")
    form.set("autorId", "outro-usuario")
    expect(await acaoSalvarCustosFixos(undefined, form)).toEqual({ ok: true })
    expect(mocks.salvar).toHaveBeenCalledWith("gestor-teste", {
      competencia: "2026-09",
      ...CUSTOS_FIXOS_PADRAO,
      aluguel: 0,
      outros: 15.25,
    })
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/gestao/financeiro/repasses")
  })

  it("exibe falha recuperável sem vazar erro do banco ou confirmar salvamento", async () => {
    mocks.salvar.mockRejectedValue(new Error("detalhe interno do banco"))
    expect(await acaoSalvarCustosFixos(undefined, formulario())).toEqual({
      erro: "Não foi possível salvar os custos deste mês. Tente novamente.",
    })
    expect(mocks.revalidatePath).not.toHaveBeenCalled()
  })
})

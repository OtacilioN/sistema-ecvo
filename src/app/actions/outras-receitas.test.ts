import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  exigirPapel: vi.fn(),
  salvar: vi.fn(),
  revalidatePath: vi.fn(),
}))

vi.mock("@/lib/auth/dal", () => ({ exigirPapel: mocks.exigirPapel }))
vi.mock("@/lib/services/outras-receitas.service", () => ({
  salvarOutrasReceitasMensais: mocks.salvar,
}))
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }))

import { acaoSalvarOutrasReceitas } from "./outras-receitas"

function formulario() {
  const form = new FormData()
  form.set("competencia", "2026-09")
  form.set("aluguelHorario", "500")
  form.set("outros", "0")
  return form
}

beforeEach(() => {
  vi.resetAllMocks()
  mocks.exigirPapel.mockResolvedValue({ id: "gestor-teste", papel: "GESTOR" })
})

describe("salvar outras receitas pela ação", () => {
  it("exige gestor antes de persistir, mesmo em chamada direta", async () => {
    mocks.exigirPapel.mockRejectedValue(new Error("acesso negado"))
    await expect(acaoSalvarOutrasReceitas(undefined, formulario())).rejects.toThrow("acesso negado")
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
  ])("rejeita receita inválida %s", async (valor) => {
    const form = formulario()
    form.set("outros", valor)
    expect(await acaoSalvarOutrasReceitas(undefined, form)).toHaveProperty("erro")
    expect(mocks.salvar).not.toHaveBeenCalled()
  })

  it("rejeita campo ausente e competência inválida", async () => {
    const form = formulario()
    form.delete("aluguelHorario")
    expect(await acaoSalvarOutrasReceitas(undefined, form)).toHaveProperty("erro")
    const outro = formulario()
    outro.set("competencia", "2026-13")
    expect(await acaoSalvarOutrasReceitas(undefined, outro)).toHaveProperty("erro")
    expect(mocks.salvar).not.toHaveBeenCalled()
  })

  it("preserva zero e centavos, usa autor da sessão e atualiza relatórios e auditoria", async () => {
    const form = formulario()
    form.set("aluguelHorario", "0")
    form.set("outros", "15.25")
    form.set("autorId", "outro-usuario")
    expect(await acaoSalvarOutrasReceitas(undefined, form)).toEqual({ ok: true })
    expect(mocks.salvar).toHaveBeenCalledWith("gestor-teste", {
      competencia: "2026-09",
      aluguelHorario: 0,
      outros: 15.25,
    })
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/gestao/financeiro/repasses")
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/gestao/financeiro")
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/gestao/auditoria")
  })

  it("exibe falha recuperável sem vazar erro do banco ou confirmar salvamento", async () => {
    mocks.salvar.mockRejectedValue(new Error("detalhe interno do banco"))
    expect(await acaoSalvarOutrasReceitas(undefined, formulario())).toEqual({
      erro: "Não foi possível salvar as receitas deste mês. Tente novamente.",
    })
    expect(mocks.revalidatePath).not.toHaveBeenCalled()
  })
})

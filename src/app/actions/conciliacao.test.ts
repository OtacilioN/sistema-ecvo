import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  exigirPapel: vi.fn(),
  importar: vi.fn(),
  resolver: vi.fn(),
  revalidatePath: vi.fn(),
}))
vi.mock("@/lib/auth/dal", () => ({ exigirPapel: mocks.exigirPapel }))
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }))
vi.mock("@/lib/services/conciliacao.service", () => ({
  ErroImportacaoConciliacao: class extends Error {},
  importarPlanilhasConciliacao: mocks.importar,
  resolverConciliacaoManual: mocks.resolver,
}))

import { ErroImportacaoConciliacao } from "@/lib/services/conciliacao.service"
import { acaoImportarConciliacao } from "./conciliacao"

function formulario() {
  const form = new FormData()
  form.set("plataforma", "WELLHUB")
  form.set("competencia", "2026-08")
  form.append("arquivo", new File(["nome;valor\nMaria;10,50"], "conta1.csv"))
  return form
}

beforeEach(() => {
  vi.resetAllMocks()
  mocks.exigirPapel.mockResolvedValue({ id: "gestor", papel: "GESTOR" })
})

describe("importação mensal pela action", () => {
  it("exige gestor antes de ler ou persistir arquivos", async () => {
    mocks.exigirPapel.mockRejectedValue(new Error("acesso negado"))
    await expect(acaoImportarConciliacao(undefined, formulario())).rejects.toThrow("acesso negado")
    expect(mocks.importar).not.toHaveBeenCalled()
  })

  it.each(["", "2026-13", "08/2026", "2026-00"])("rejeita mês inválido %s", async (competencia) => {
    const form = formulario()
    form.set("competencia", competencia)
    expect(await acaoImportarConciliacao(undefined, form)).toHaveProperty("erro")
    expect(mocks.importar).not.toHaveBeenCalled()
  })

  it("rejeita competência ausente", async () => {
    const form = formulario()
    form.delete("competencia")
    expect(await acaoImportarConciliacao(undefined, form)).toHaveProperty("erro")
    expect(mocks.importar).not.toHaveBeenCalled()
  })

  it("envia as duas contas juntas com mês e autor da sessão", async () => {
    const form = formulario()
    form.append("arquivo", new File([new Uint8Array([1, 2, 3])], "conta2.xlsx"))
    form.set("autorId", "forjado")
    expect(await acaoImportarConciliacao(undefined, form)).toEqual({ ok: true })
    expect(mocks.importar).toHaveBeenCalledWith({
      plataforma: "WELLHUB",
      competencia: "2026-08",
      autorId: "gestor",
      arquivos: [
        { arquivo: "conta1.csv", tipoArquivo: "csv", conteudo: "nome;valor\nMaria;10,50" },
        { arquivo: "conta2.xlsx", tipoArquivo: "xlsx", conteudo: Buffer.from([1, 2, 3]) },
      ],
    })
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/gestao/financeiro/repasses")
  })

  it("rejeita terceiro arquivo sem chamar o serviço", async () => {
    const form = formulario()
    form.append("arquivo", new File(["a"], "conta2.csv"))
    form.append("arquivo", new File(["b"], "conta3.csv"))
    expect(await acaoImportarConciliacao(undefined, form)).toEqual({
      erro: "Envie no máximo dois arquivos por importação, ambos do mesmo mês.",
    })
    expect(mocks.importar).not.toHaveBeenCalled()
  })

  it("rejeita lote maior que 3 MB", async () => {
    const form = formulario()
    form.append("arquivo", new File([new Uint8Array(3 * 1024 * 1024)], "grande.xlsx"))
    expect(await acaoImportarConciliacao(undefined, form)).toEqual({
      erro: "Os arquivos juntos devem ter no máximo 3 MB.",
    })
    expect(mocks.importar).not.toHaveBeenCalled()
  })

  it.each(["vazio", "extensão"])("rejeita arquivo %s", async (caso) => {
    const form = formulario()
    form.set(
      "arquivo",
      new File([caso === "vazio" ? "" : "texto"], caso === "vazio" ? "arquivo.csv" : "arquivo.pdf"),
    )
    expect(await acaoImportarConciliacao(undefined, form)).toHaveProperty("erro")
    expect(mocks.importar).not.toHaveBeenCalled()
  })

  it("exibe erro de duplicidade e não confirma importação", async () => {
    mocks.importar.mockRejectedValue(
      new ErroImportacaoConciliacao("Esta conta já foi importada neste mês."),
    )
    expect(await acaoImportarConciliacao(undefined, formulario())).toEqual({
      erro: "Esta conta já foi importada neste mês.",
    })
    expect(mocks.revalidatePath).not.toHaveBeenCalled()
  })

  it("não expõe erro interno do banco", async () => {
    mocks.importar.mockRejectedValue(new Error("detalhe interno do banco"))
    expect(await acaoImportarConciliacao(undefined, formulario())).toEqual({
      erro: "Não foi possível importar as planilhas.",
    })
    expect(mocks.revalidatePath).not.toHaveBeenCalled()
  })
})

import { beforeEach, describe, expect, it, vi } from "vitest"
import { validarNovoVinculoPlanoFamilia } from "./vinculo-plano-familia"

const cliente = { plano: { findUnique: vi.fn() }, solicitacaoMatricula: { findUnique: vi.fn() } }
beforeEach(() => {
  vi.clearAllMocks()
  cliente.plano.findUnique.mockResolvedValue({ familia: true })
  cliente.solicitacaoMatricula.findUnique.mockResolvedValue(null)
})

describe("novos vínculos administrativos ao plano família", () => {
  it("bloqueia cadastro isolado e troca de um aluno sem grupo aprovado", async () => {
    expect(await validarNovoVinculoPlanoFamilia(cliente as never, { planoId: "familia" })).toBe(
      false,
    )
    expect(
      await validarNovoVinculoPlanoFamilia(cliente as never, {
        planoId: "familia",
        planoAnteriorId: "comum",
        alunoId: "aluno",
      }),
    ).toBe(false)
  })
  it.each([
    1, 2, 3, 4, 5,
  ])("permite apenas grupos aprovados de 2..4 pessoas, recebido %s", async (quantidade) => {
    cliente.solicitacaoMatricula.findUnique.mockResolvedValue({
      status: "APROVADA",
      matriculaFamilia: {
        pessoas: Array.from({ length: quantidade }, (_, i) => ({
          status: "APROVADA",
          alunoId: `aluno${i}`,
        })),
      },
    })
    expect(
      await validarNovoVinculoPlanoFamilia(cliente as never, {
        planoId: "familia",
        alunoId: "aluno",
      }),
    ).toBe(quantidade >= 2 && quantidade <= 4)
  })
  it("preserva edição de um vínculo antigo sem exigir grupo", async () => {
    expect(
      await validarNovoVinculoPlanoFamilia(cliente as never, {
        planoId: "familia",
        planoAnteriorId: "familia",
        alunoId: "antigo",
      }),
    ).toBe(true)
    expect(await validarNovoVinculoPlanoFamilia(cliente as never, { alunoId: "antigo" })).toBe(true)
    expect(cliente.plano.findUnique).not.toHaveBeenCalled()
  })
  it("bloqueia grupo ainda parcialmente pendente e aceita plano comum", async () => {
    cliente.solicitacaoMatricula.findUnique.mockResolvedValue({
      status: "APROVADA",
      matriculaFamilia: {
        pessoas: [
          { status: "APROVADA", alunoId: "a" },
          { status: "PENDENTE", alunoId: null },
        ],
      },
    })
    expect(
      await validarNovoVinculoPlanoFamilia(cliente as never, { planoId: "familia", alunoId: "a" }),
    ).toBe(false)
    cliente.plano.findUnique.mockResolvedValue({ familia: false })
    expect(await validarNovoVinculoPlanoFamilia(cliente as never, { planoId: "comum" })).toBe(true)
  })
})

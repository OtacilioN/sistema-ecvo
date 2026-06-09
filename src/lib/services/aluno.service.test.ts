import { describe, expect, it } from "vitest"
import { migrarMensalidadesAbertasParaPlanoAluno } from "./aluno.service"

describe("migrarMensalidadesAbertasParaPlanoAluno", () => {
  it("migra mensalidades em aberto para o novo plano e atualiza o valor", async () => {
    const chamadas: unknown[] = []
    const cliente = {
      mensalidade: {
        updateMany: async (params: unknown) => {
          chamadas.push(params)
          return { count: 3 }
        },
      },
    } as never

    const resultado = await migrarMensalidadesAbertasParaPlanoAluno(cliente, {
      alunoId: "aluno-1",
      planoAnteriorId: "plano-antigo",
      planoNovoId: "plano-novo",
      planoNovoValor: 250,
    })

    expect(resultado).toBe(3)
    expect(chamadas).toEqual([
      {
        where: {
          alunoId: "aluno-1",
          status: "EM_ABERTO",
        },
        data: {
          planoId: "plano-novo",
          valor: 250,
        },
      },
    ])
  })

  it("desvincula mensalidades em aberto quando o aluno fica sem plano", async () => {
    const chamadas: unknown[] = []
    const cliente = {
      mensalidade: {
        updateMany: async (params: unknown) => {
          chamadas.push(params)
          return { count: 1 }
        },
      },
    } as never

    const resultado = await migrarMensalidadesAbertasParaPlanoAluno(cliente, {
      alunoId: "aluno-1",
      planoAnteriorId: "plano-antigo",
      planoNovoId: null,
    })

    expect(resultado).toBe(1)
    expect(chamadas).toEqual([
      {
        where: {
          alunoId: "aluno-1",
          status: "EM_ABERTO",
        },
        data: {
          planoId: null,
        },
      },
    ])
  })

  it("não altera mensalidades quando o plano permanece o mesmo", async () => {
    const chamadas: unknown[] = []
    const cliente = {
      mensalidade: {
        updateMany: async (params: unknown) => {
          chamadas.push(params)
          return { count: 1 }
        },
      },
    } as never

    const resultado = await migrarMensalidadesAbertasParaPlanoAluno(cliente, {
      alunoId: "aluno-1",
      planoAnteriorId: "plano-atual",
      planoNovoId: "plano-atual",
      planoNovoValor: 250,
    })

    expect(resultado).toBe(0)
    expect(chamadas).toEqual([])
  })
})

import type { ControleTarefaAgendada, ExecucaoTarefaAgendada } from "@prisma/client"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { db } from "@/lib/db"
import {
  contadoresSegurosTarefa,
  executarTarefaAgendada,
  expurgarExecucoesTarefasAntigas,
  TEMPO_LEASE_TAREFA_SEGUNDOS,
} from "./tarefa-agendada.service"

vi.mock("@/lib/db", () => ({
  db: { $transaction: vi.fn(), execucaoTarefaAgendada: { deleteMany: vi.fn() } },
}))

const inicio = new Date("2026-10-29T12:00:00Z")
const controles = new Map<string, ControleTarefaAgendada>()
const execucoes = new Map<string, ExecucaoTarefaAgendada>()
let emTransacao = 0

function criarControle(tarefa: string): ControleTarefaAgendada {
  return {
    tarefa,
    execucaoAtualId: null,
    leaseAte: null,
    criadoEm: inicio,
    ultimaExecucaoEm: null,
    ultimaConclusaoEm: null,
    ultimoSucessoEm: null,
    ultimaFalhaEm: null,
    atualizadoEm: inicio,
  }
}

const tx = {
  $executeRaw: vi.fn(async (_sql: TemplateStringsArray, tarefa: string) => {
    if (!controles.has(tarefa)) controles.set(tarefa, criarControle(tarefa))
    return 1
  }),
  controleTarefaAgendada: {
    findUniqueOrThrow: vi.fn(async ({ where }: { where: { tarefa: string } }) => {
      const controle = controles.get(where.tarefa)
      if (!controle) throw new Error("ausente")
      return { ...controle }
    }),
    updateMany: vi.fn(
      async ({
        where,
        data,
      }: {
        where: {
          tarefa: string
          execucaoAtualId?: string
          OR?: Array<{ leaseAte: null | { lte: Date } }>
        }
        data: Partial<ControleTarefaAgendada>
      }) => {
        const controle = controles.get(where.tarefa)
        if (!controle) return { count: 0 }
        if (where.execucaoAtualId && controle.execucaoAtualId !== where.execucaoAtualId)
          return { count: 0 }
        const limite = where.OR?.find((item) => item.leaseAte)?.leaseAte
        if (limite && controle.leaseAte && controle.leaseAte > limite.lte) return { count: 0 }
        Object.assign(controle, data)
        return { count: 1 }
      },
    ),
    update: vi.fn(
      async ({
        where,
        data,
      }: {
        where: { tarefa: string }
        data: Partial<ControleTarefaAgendada>
      }) => {
        const controle = controles.get(where.tarefa)
        if (!controle) throw new Error("ausente")
        return Object.assign(controle, data)
      },
    ),
  },
  execucaoTarefaAgendada: {
    create: vi.fn(
      async ({ data }: { data: Pick<ExecucaoTarefaAgendada, "id" | "tarefa" | "iniciadoEm"> }) => {
        const execucao: ExecucaoTarefaAgendada = {
          ...data,
          status: "EM_EXECUCAO",
          concluidoEm: null,
          duracaoMs: null,
          contadores: null,
          erroSeguro: null,
        }
        execucoes.set(data.id, execucao)
        return execucao
      },
    ),
    updateMany: vi.fn(
      async ({
        where,
        data,
      }: {
        where: { id: string; status: string }
        data: Partial<ExecucaoTarefaAgendada>
      }) => {
        const execucao = execucoes.get(where.id)
        if (!execucao || execucao.status !== where.status) return { count: 0 }
        Object.assign(execucao, data)
        return { count: 1 }
      },
    ),
  },
}

beforeEach(() => {
  vi.clearAllMocks()
  controles.clear()
  execucoes.clear()
  emTransacao = 0
  vi.mocked(db.$transaction).mockImplementation(async (callback) => {
    if (typeof callback !== "function") throw new Error("esperava transação interativa")
    emTransacao++
    try {
      return await callback(tx as unknown as Parameters<typeof callback>[0])
    } finally {
      emTransacao--
    }
  })
})

describe("executarTarefaAgendada", () => {
  it("registra início, conclusão e contagens sem manter transação no trabalho", async () => {
    let horario = inicio
    const retorno = await executarTarefaAgendada({
      tarefa: "lembretes-treino",
      agora: () => horario,
      executar: async () => {
        expect(emTransacao).toBe(0)
        expect([...execucoes.values()][0].status).toBe("EM_EXECUCAO")
        horario = new Date(inicio.getTime() + 1200)
        return {
          ok: true,
          total: 8,
          alunoId: "privado",
          mensagem: "token secreto",
          falhas: [{ motivo: "segredo" }],
        }
      },
    })
    expect(retorno.status).toBe("CONCLUIDA")
    expect([...execucoes.values()][0]).toMatchObject({
      status: "CONCLUIDA",
      duracaoMs: 1200,
      contadores: { total: 8 },
      erroSeguro: null,
    })
    expect(controles.get("lembretes-treino")).toMatchObject({
      execucaoAtualId: null,
      leaseAte: null,
      ultimoSucessoEm: horario,
      ultimaConclusaoEm: horario,
    })
  })

  it("impede execução concorrente enquanto a reserva está válida", async () => {
    const trabalho = vi.fn(async () => {
      const duplicada = await executarTarefaAgendada({
        tarefa: "lembretes-treino",
        agora: () => inicio,
        executar: async () => {
          throw new Error("não executar")
        },
      })
      expect(duplicada).toEqual({ status: "IGNORADA", motivo: "EM_EXECUCAO" })
      return { ok: true }
    })
    expect(
      (
        await executarTarefaAgendada({
          tarefa: "lembretes-treino",
          executar: trabalho,
          agora: () => inicio,
        })
      ).status,
    ).toBe("CONCLUIDA")
    expect(trabalho).toHaveBeenCalledOnce()
    expect(execucoes.size).toBe(1)
  })

  it("permite concorrência de tarefas distintas", async () => {
    const resultado = await executarTarefaAgendada({
      tarefa: "tarefa-a",
      agora: () => inicio,
      executar: async () => {
        expect(
          (
            await executarTarefaAgendada({
              tarefa: "tarefa-b",
              agora: () => inicio,
              executar: async () => ({ ok: true }),
            })
          ).status,
        ).toBe("CONCLUIDA")
        return { ok: true }
      },
    })
    expect(resultado.status).toBe("CONCLUIDA")
    expect(execucoes.size).toBe(2)
  })

  it("retoma reserva expirada e protege o fencing token da execução nova", async () => {
    let horario = inicio
    let novaId: string | null = null
    const antiga = await executarTarefaAgendada({
      tarefa: "recuperar-asaas",
      agora: () => horario,
      executar: async () => {
        horario = new Date(inicio.getTime() + (TEMPO_LEASE_TAREFA_SEGUNDOS + 1) * 1000)
        const nova = await executarTarefaAgendada({
          tarefa: "recuperar-asaas",
          agora: () => horario,
          executar: async () => {
            novaId = controles.get("recuperar-asaas")?.execucaoAtualId ?? null
            return { ok: true, total: 5 }
          },
        })
        expect(nova.status).toBe("CONCLUIDA")
        return { ok: true, total: 1 }
      },
    })
    expect(antiga.status).toBe("FALHOU")
    expect([...execucoes.values()].map((item) => item.status)).toEqual([
      "INTERROMPIDA",
      "CONCLUIDA",
    ])
    expect(execucoes.get(novaId ?? "")).toMatchObject({ contadores: { total: 5 } })
    expect(controles.get("recuperar-asaas")).toMatchObject({
      ultimoSucessoEm: horario,
      ultimaConclusaoEm: horario,
      execucaoAtualId: null,
    })
  })

  it("não libera uma reserva nova enquanto o trabalho novo ainda está ativo", async () => {
    let liberarPrimeira: (() => void) | undefined
    let liberarSegunda: (() => void) | undefined
    const executarPrimeira = executarTarefaAgendada({
      tarefa: "recuperar-asaas",
      agora: () => inicio,
      executar: () =>
        new Promise<{ ok: true }>((resolve) => {
          liberarPrimeira = () => resolve({ ok: true })
        }),
    })
    await vi.waitFor(() => expect(liberarPrimeira).toBeDefined())
    const horarioNovo = new Date(inicio.getTime() + (TEMPO_LEASE_TAREFA_SEGUNDOS + 1) * 1000)
    const executarSegunda = executarTarefaAgendada({
      tarefa: "recuperar-asaas",
      agora: () => horarioNovo,
      executar: () =>
        new Promise<{ ok: true }>((resolve) => {
          liberarSegunda = () => resolve({ ok: true })
        }),
    })
    await vi.waitFor(() => expect(liberarSegunda).toBeDefined())
    const tokenNovo = controles.get("recuperar-asaas")?.execucaoAtualId
    liberarPrimeira?.()
    expect((await executarPrimeira).status).toBe("FALHOU")
    expect(controles.get("recuperar-asaas")?.execucaoAtualId).toBe(tokenNovo)
    liberarSegunda?.()
    expect((await executarSegunda).status).toBe("CONCLUIDA")
  })

  it("classifica ok false como falha parcial e aceita avaliação das etapas", async () => {
    expect(
      (
        await executarTarefaAgendada({
          tarefa: "tarefa-a",
          agora: () => inicio,
          executar: async () => ({ ok: false, total: 2 }),
        })
      ).status,
    ).toBe("FALHOU")
    expect(
      (
        await executarTarefaAgendada({
          tarefa: "tarefa-b",
          agora: () => inicio,
          executar: async () => ({ financeiro: { ok: false } }),
          avaliarResultado: (resultado) => resultado.financeiro.ok,
        })
      ).status,
    ).toBe("FALHOU")
    expect([...execucoes.values()].every((item) => item.status === "FALHOU")).toBe(true)
  })

  it("remove detalhes do erro, preserva a falha e libera reserva", async () => {
    const retorno = await executarTarefaAgendada({
      tarefa: "recuperar-asaas",
      agora: () => inicio,
      executar: async () => {
        throw new Error("Bearer segredo / aluno privado / postgres://senha")
      },
    })
    expect(retorno).toMatchObject({ status: "FALHOU" })
    expect(JSON.stringify(retorno)).not.toContain("segredo")
    expect(JSON.stringify([...execucoes.values()])).not.toContain("senha")
    expect(controles.get("recuperar-asaas")).toMatchObject({
      execucaoAtualId: null,
      ultimaFalhaEm: inicio,
    })
  })

  it("recusa trabalho quando não consegue persistir reserva", async () => {
    vi.mocked(db.$transaction).mockRejectedValueOnce(new Error("postgres://senha"))
    const executar = vi.fn(async () => ({ ok: true }))
    const retorno = await executarTarefaAgendada({ tarefa: "recuperar-asaas", executar })
    expect(retorno).toMatchObject({ status: "FALHOU" })
    expect(executar).not.toHaveBeenCalled()
    expect(JSON.stringify(retorno)).not.toContain("senha")
  })

  it("sinaliza falha no histórico após executar, sem reexecutar automaticamente", async () => {
    const executar = vi.fn(async () => {
      vi.mocked(db.$transaction).mockRejectedValueOnce(new Error("postgres://senha"))
      return { ok: true }
    })
    const retorno = await executarTarefaAgendada({
      tarefa: "recuperar-asaas",
      executar,
      agora: () => inicio,
    })
    expect(retorno.status).toBe("FALHOU")
    expect(executar).toHaveBeenCalledOnce()
    expect(controles.get("recuperar-asaas")?.execucaoAtualId).toBeTruthy()
  })

  it("não permite nomes arbitrários de tarefas", async () => {
    const executar = vi.fn(async () => ({ ok: true }))
    expect((await executarTarefaAgendada({ tarefa: "Bearer segredo", executar })).status).toBe(
      "FALHOU",
    )
    expect(executar).not.toHaveBeenCalled()
    expect(db.$transaction).not.toHaveBeenCalled()
  })
})

describe("contadoresSegurosTarefa", () => {
  it("aceita só números finitos e chaves conhecidas, inclusive em etapas", () => {
    expect(
      contadoresSegurosTarefa({
        total: 2,
        analisadas: Number.POSITIVE_INFINITY,
        criadas: -1,
        financeiro: { total: 5, alunoId: 123, erro: "senha", valor: 200 },
        "aluno-123": { total: 1 },
        mensagens: ["dados"],
        segredo: 8,
      }),
    ).toEqual({ total: 2, financeiro: { total: 5 } })
  })
})

it("expurga apenas execuções finalizadas há mais de 30 dias", async () => {
  vi.mocked(db.execucaoTarefaAgendada.deleteMany).mockResolvedValueOnce({ count: 3 })
  expect(await expurgarExecucoesTarefasAntigas(inicio)).toEqual({ ok: true, excluidas: 3 })
  expect(db.execucaoTarefaAgendada.deleteMany).toHaveBeenCalledWith({
    where: {
      status: { not: "EM_EXECUCAO" },
      concluidoEm: { lt: new Date("2026-09-29T12:00:00Z") },
    },
  })
})

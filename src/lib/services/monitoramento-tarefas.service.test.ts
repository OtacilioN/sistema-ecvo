import type { ControleTarefaAgendada } from "@prisma/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  controles: vi.fn(),
  registrar: vi.fn(),
  gestores: vi.fn(),
  notificar: vi.fn(),
  push: vi.fn(),
}))
vi.mock("@/lib/db", () => ({
  db: {
    controleTarefaAgendada: { findMany: mocks.controles, createMany: mocks.registrar },
    usuario: { findMany: mocks.gestores },
    notificacao: { createMany: mocks.notificar },
  },
}))
vi.mock("@/lib/services/notificacao.service", () => ({ enviarPushParaNotificacoes: mocks.push }))

import { avaliarSaudeTarefa, monitorarTarefasAgendadas } from "./monitoramento-tarefas.service"

const agora = new Date("2026-10-29T12:00:00Z")
const controle = (patch: Partial<ControleTarefaAgendada> = {}): ControleTarefaAgendada => ({
  tarefa: "lembretes-treino",
  execucaoAtualId: null,
  leaseAte: null,
  criadoEm: new Date("2026-10-29T09:00:00Z"),
  atualizadoEm: agora,
  ultimaExecucaoEm: null,
  ultimaConclusaoEm: null,
  ultimaFalhaEm: null,
  ultimoSucessoEm: new Date("2026-10-29T11:45:00Z"),
  ...patch,
})
beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers()
  vi.setSystemTime(agora)
  mocks.registrar.mockResolvedValue({ count: 0 })
  mocks.push.mockResolvedValue(undefined)
  mocks.gestores.mockResolvedValue([{ id: "gestor-1" }])
  mocks.notificar.mockResolvedValue({ count: 1 })
})
afterEach(() => vi.useRealTimers())

describe("saúde das tarefas e alertas", () => {
  it("aguarda a primeira execução durante a tolerância inicial", () => {
    expect(avaliarSaudeTarefa(undefined, 45, agora)).toBe("AGUARDANDO")
    expect(
      avaliarSaudeTarefa(controle({ ultimoSucessoEm: null, criadoEm: agora }), 45, agora),
    ).toBe("AGUARDANDO")
  })
  it("detecta falta da primeira execução e lease travada sem ocultar atraso", () => {
    expect(avaliarSaudeTarefa(controle({ ultimoSucessoEm: null }), 45, agora)).toBe("ATRASADA")
    expect(
      avaliarSaudeTarefa(
        controle({
          ultimoSucessoEm: new Date("2026-10-29T10:00Z"),
          leaseAte: new Date("2026-10-29T12:05Z"),
        }),
        45,
        agora,
      ),
    ).toBe("ATRASADA")
  })
  it("distingue execução em andamento de falha recente e sucesso posterior", () => {
    expect(
      avaliarSaudeTarefa(
        controle({ ultimoSucessoEm: null, criadoEm: agora, ultimaFalhaEm: agora }),
        45,
        agora,
      ),
    ).toBe("FALHA_RECENTE")
    expect(
      avaliarSaudeTarefa(controle({ leaseAte: new Date("2026-10-29T12:05Z") }), 45, agora),
    ).toBe("EM_EXECUCAO")
    expect(
      avaliarSaudeTarefa(controle({ ultimaFalhaEm: new Date("2026-10-29T11:50Z") }), 45, agora),
    ).toBe("FALHA_RECENTE")
    expect(
      avaliarSaudeTarefa(controle({ ultimaFalhaEm: new Date("2026-10-29T11:40Z") }), 45, agora),
    ).toBe("EM_DIA")
  })
  it("avisa apenas gestores e deduplica o incidente entre verificações", async () => {
    const atrasada = controle({ ultimoSucessoEm: new Date("2026-10-29T10:00Z") })
    mocks.controles.mockResolvedValue([atrasada])
    mocks.notificar.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 })
    expect((await monitorarTarefasAgendadas()).total).toBe(1)
    expect((await monitorarTarefasAgendadas()).total).toBe(0)
    expect(mocks.gestores).toHaveBeenCalledWith({
      where: { papel: "GESTOR", ativo: true },
      select: { id: true },
    })
    expect(mocks.notificar.mock.calls[0][0]).toEqual(mocks.notificar.mock.calls[1][0])
    expect(mocks.push).toHaveBeenCalledTimes(1)
    expect(mocks.notificar.mock.calls[0][0].data[0]).toMatchObject({
      usuarioId: "gestor-1",
      tipo: "TAREFA_AGENDADA",
    })
  })
  it("uma falha recente dentro do prazo não gera alerta de atraso", async () => {
    mocks.controles.mockResolvedValue([controle({ ultimaFalhaEm: agora })])
    expect((await monitorarTarefasAgendadas()).atrasadas).toBe(0)
    expect(mocks.notificar).not.toHaveBeenCalled()
  })
})

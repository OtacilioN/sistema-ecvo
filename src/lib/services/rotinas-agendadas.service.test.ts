import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  processarCobrancasPixAutomaticoPendentes: vi.fn(),
  reconciliarPendenciasAsaas: vi.fn(),
  sincronizarCobrancasDescontoAdimplencia: vi.fn(),
  gerarMensalidadesRecorrentes: vi.fn(),
  gerarLembretesFinanceiros: vi.fn(),
  sincronizarValoresAdimplencia: vi.fn(),
  vencerMensalidadesAtrasadas: vi.fn(),
  expurgarNotificacoesAntigas: vi.fn(),
  gerarLembretesAluguelGestores: vi.fn(),
  gerarLembretesAniversario: vi.fn(),
  executarTarefaAgendada: vi.fn(),
  expurgarExecucoesTarefasAntigas: vi.fn(),
}))

vi.mock("@/lib/services/asaas.service", () => ({
  processarCobrancasPixAutomaticoPendentes: mocks.processarCobrancasPixAutomaticoPendentes,
  reconciliarPendenciasAsaas: mocks.reconciliarPendenciasAsaas,
  sincronizarCobrancasDescontoAdimplencia: mocks.sincronizarCobrancasDescontoAdimplencia,
}))
vi.mock("@/lib/services/financeiro.service", () => ({
  gerarMensalidadesRecorrentes: mocks.gerarMensalidadesRecorrentes,
  gerarLembretesFinanceiros: mocks.gerarLembretesFinanceiros,
  sincronizarValoresAdimplencia: mocks.sincronizarValoresAdimplencia,
  vencerMensalidadesAtrasadas: mocks.vencerMensalidadesAtrasadas,
}))
vi.mock("@/lib/services/notificacao.service", () => ({
  expurgarNotificacoesAntigas: mocks.expurgarNotificacoesAntigas,
  gerarLembretesAluguelGestores: mocks.gerarLembretesAluguelGestores,
  gerarLembretesAniversario: mocks.gerarLembretesAniversario,
}))
vi.mock("@/lib/services/tarefa-agendada.service", () => ({
  executarTarefaAgendada: mocks.executarTarefaAgendada,
  expurgarExecucoesTarefasAntigas: mocks.expurgarExecucoesTarefasAntigas,
}))

import {
  executarEtapasIndependentes,
  gerarAvisosFinanceiros,
  gerarLembretesDiarios,
  realizarCicloDiarioAsaas,
  realizarLimpezaDiaria,
  realizarManutencaoFinanceira,
} from "./rotinas-agendadas.service"

beforeEach(() => {
  vi.resetAllMocks()
  for (const [nome, mock] of Object.entries(mocks)) {
    if (nome !== "executarTarefaAgendada") mock.mockResolvedValue({ ok: true, total: 0 })
  }
  mocks.executarTarefaAgendada.mockImplementation(async ({ executar }) => {
    try {
      const resultado = await executar()
      return { status: resultado?.ok === false ? "FALHOU" : "CONCLUIDA", resultado }
    } catch {
      return { status: "FALHOU", erro: "Falha segura da tarefa." }
    }
  })
})

describe("etapas independentes das rotinas", () => {
  it("continua após exceção e resultado parcial sem expor a mensagem original", async () => {
    const segunda = vi.fn().mockResolvedValue({ ok: false, total: 2 })
    const ultima = vi.fn().mockResolvedValue({ ok: true, total: 3 })

    const resultado = await executarEtapasIndependentes({
      primeira: async () => {
        throw new Error("segredo-de-provedor")
      },
      segunda,
      ultima,
    })

    expect(segunda).toHaveBeenCalledOnce()
    expect(ultima).toHaveBeenCalledOnce()
    expect(resultado).toMatchObject({
      ok: false,
      segunda: { ok: false, total: 2 },
      ultima: { ok: true, total: 3 },
      erros: [
        { etapa: "primeira", motivo: "Não foi possível concluir esta etapa." },
        { etapa: "segunda", motivo: "Existem itens pendentes nesta etapa." },
      ],
    })
    expect(JSON.stringify(resultado)).not.toContain("segredo-de-provedor")
  })

  it("marca vencimentos na manutenção sem disparar notificações aos alunos", async () => {
    mocks.sincronizarValoresAdimplencia.mockRejectedValueOnce(new Error("indisponível"))

    const resultado = await realizarManutencaoFinanceira()

    expect(resultado.ok).toBe(false)
    expect(mocks.sincronizarValoresAdimplencia).toHaveBeenCalledOnce()
    expect(mocks.vencerMensalidadesAtrasadas).toHaveBeenCalledWith(undefined, {
      notificarAlunos: false,
    })
    expect(mocks.gerarLembretesAniversario).not.toHaveBeenCalled()
    expect(mocks.gerarLembretesAluguelGestores).not.toHaveBeenCalled()
    expect(mocks.gerarMensalidadesRecorrentes).not.toHaveBeenCalled()
    expect(mocks.gerarLembretesFinanceiros).not.toHaveBeenCalled()
  })

  it("gera as novas mensalidades antes dos avisos financeiros no processamento das 08h", async () => {
    const resultado = await gerarAvisosFinanceiros()

    expect(resultado.ok).toBe(true)
    expect(mocks.gerarMensalidadesRecorrentes).toHaveBeenCalledOnce()
    expect(mocks.gerarLembretesFinanceiros).toHaveBeenCalledOnce()
    expect(mocks.gerarMensalidadesRecorrentes.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.gerarLembretesFinanceiros.mock.invocationCallOrder[0],
    )
    expect(mocks.sincronizarValoresAdimplencia).not.toHaveBeenCalled()
    expect(mocks.vencerMensalidadesAtrasadas).not.toHaveBeenCalled()
  })

  it("continua avisando sobre mensalidades existentes quando a geração de novas falha", async () => {
    mocks.gerarMensalidadesRecorrentes.mockRejectedValueOnce(new Error("indisponível"))

    const resultado = await gerarAvisosFinanceiros()

    expect(resultado.ok).toBe(false)
    expect(mocks.gerarLembretesFinanceiros).toHaveBeenCalledOnce()
    expect(resultado.erros).toEqual([
      { etapa: "mensalidades", motivo: "Não foi possível concluir esta etapa." },
    ])
  })

  it("mantém aniversário e aluguel independentes da manutenção e de falha entre avisos", async () => {
    mocks.gerarLembretesAniversario.mockRejectedValueOnce(new Error("indisponível"))

    const resultado = await gerarLembretesDiarios()

    expect(resultado.ok).toBe(false)
    expect(mocks.gerarLembretesAluguelGestores).toHaveBeenCalledOnce()
    expect(mocks.gerarMensalidadesRecorrentes).not.toHaveBeenCalled()
    expect(mocks.sincronizarValoresAdimplencia).not.toHaveBeenCalled()
    expect(mocks.vencerMensalidadesAtrasadas).not.toHaveBeenCalled()
    expect(mocks.expurgarNotificacoesAntigas).not.toHaveBeenCalled()
  })

  it("a limpeza do histórico continua quando a limpeza de notificações falha", async () => {
    mocks.expurgarNotificacoesAntigas.mockRejectedValueOnce(new Error("indisponível"))

    const resultado = await realizarLimpezaDiaria()

    expect(resultado.ok).toBe(false)
    expect(mocks.expurgarExecucoesTarefasAntigas).toHaveBeenCalledOnce()
    expect(mocks.gerarMensalidadesRecorrentes).not.toHaveBeenCalled()
  })
})

describe("ciclo diário Asaas", () => {
  it("protege a revisão ampla com a mesma reserva da recuperação horária", async () => {
    const resultado = await realizarCicloDiarioAsaas()

    expect(resultado.ok).toBe(true)
    expect(mocks.executarTarefaAgendada).toHaveBeenCalledWith({
      tarefa: "reconciliar-asaas",
      executar: expect.any(Function),
    })
    expect(mocks.reconciliarPendenciasAsaas).toHaveBeenCalledWith()
    expect(mocks.processarCobrancasPixAutomaticoPendentes).toHaveBeenCalledWith()
    expect(mocks.sincronizarCobrancasDescontoAdimplencia.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.processarCobrancasPixAutomaticoPendentes.mock.invocationCallOrder[0],
    )
  })

  it("continua a atualização de preços e criação quando a reconciliação falha", async () => {
    mocks.reconciliarPendenciasAsaas.mockRejectedValueOnce(new Error("indisponível"))

    const resultado = await realizarCicloDiarioAsaas()

    expect(resultado.ok).toBe(false)
    expect(resultado.erros).toEqual([
      { etapa: "reconciliacao", motivo: "Existem itens pendentes nesta etapa." },
    ])
    expect(mocks.sincronizarValoresAdimplencia).toHaveBeenCalledOnce()
    expect(mocks.sincronizarCobrancasDescontoAdimplencia).toHaveBeenCalledOnce()
    expect(mocks.processarCobrancasPixAutomaticoPendentes).toHaveBeenCalledOnce()
  })

  it("não consulta o provedor se a recuperação horária já possui a reserva", async () => {
    mocks.executarTarefaAgendada.mockResolvedValueOnce({
      status: "IGNORADA",
      motivo: "EM_EXECUCAO",
    })

    const resultado = await realizarCicloDiarioAsaas()

    expect(resultado.ok).toBe(false)
    expect(mocks.reconciliarPendenciasAsaas).not.toHaveBeenCalled()
    expect(mocks.processarCobrancasPixAutomaticoPendentes).toHaveBeenCalledOnce()
  })

  it("não converte falha do registro da tarefa em sucesso por causa do resultado do provedor", async () => {
    mocks.executarTarefaAgendada.mockResolvedValueOnce({
      status: "FALHOU",
      resultado: { ok: true, pagamentosAnalisados: 1 },
      erro: "Não foi possível concluir o registro da tarefa.",
    })

    const resultado = await realizarCicloDiarioAsaas()

    expect(resultado.ok).toBe(false)
    expect(resultado.erros).toContainEqual({
      etapa: "reconciliacao",
      motivo: "Existem itens pendentes nesta etapa.",
    })
    expect(mocks.processarCobrancasPixAutomaticoPendentes).toHaveBeenCalledOnce()
  })
})

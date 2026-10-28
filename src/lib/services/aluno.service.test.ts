import { describe, expect, it, vi } from "vitest"
import { migrarMensalidadesAbertasParaPlanoAluno } from "./aluno.service"

function mensalidade(id = "mensalidade-1", vencimento = "2026-11-10T12:00:00Z") {
  return {
    id,
    planoId: "plano-antigo",
    competencia: "2026-11",
    valor: 100,
    valorBase: 120 as number | null,
    valorComDesconto: 100 as number | null,
    vencimento: new Date(vencimento),
    atualizadoEm: new Date("2026-11-01T12:00:00Z"),
  }
}

function clienteMensalidades(mensalidades = [mensalidade()]) {
  return {
    mensalidade: {
      findMany: vi.fn(async () => mensalidades),
      updateMany: vi.fn(async (_params: unknown) => ({ count: 1 })),
    },
    logAuditoria: { create: vi.fn(async () => ({})) },
  }
}

const trocaPlano = {
  alunoId: "aluno-1",
  planoAnteriorId: "plano-antigo",
  planoNovoId: "plano-novo",
  planoNovoValor: 175,
  planoNovoValorBase: 200,
  agora: new Date("2026-11-01T12:00:00Z"),
}

describe("migrarMensalidadesAbertasParaPlanoAluno", () => {
  it("migra plano e dois preços sem incluir fechadas nem cobranças Asaas em andamento", async () => {
    const cliente = clienteMensalidades([
      mensalidade("mensalidade-1"),
      mensalidade("mensalidade-2"),
      mensalidade("mensalidade-3"),
    ])

    const resultado = await migrarMensalidadesAbertasParaPlanoAluno(cliente as never, trocaPlano)

    expect(resultado).toBe(3)
    expect(cliente.mensalidade.findMany).toHaveBeenCalledWith({
      where: {
        alunoId: "aluno-1",
        status: "EM_ABERTO",
        contratoPixAutomaticoId: null,
        cobrancasAsaas: { none: { ativa: true } },
      },
      select: expect.any(Object),
    })
    expect(cliente.mensalidade.updateMany).toHaveBeenCalledTimes(3)
    for (const chamada of cliente.mensalidade.updateMany.mock.calls) {
      expect(chamada).toEqual([
        {
          where: expect.objectContaining({ status: "EM_ABERTO" }),
          data: {
            planoId: "plano-novo",
            valor: 175,
            valorComDesconto: 175,
            valorBase: 200,
          },
        },
      ])
    }
  })

  it("limpa os snapshots ao desvincular o plano, preservando o valor já emitido", async () => {
    const cliente = clienteMensalidades()

    const resultado = await migrarMensalidadesAbertasParaPlanoAluno(cliente as never, {
      ...trocaPlano,
      planoNovoId: null,
    })

    expect(resultado).toBe(1)
    expect(cliente.mensalidade.updateMany).toHaveBeenCalledWith({
      where: expect.objectContaining({ id: "mensalidade-1", status: "EM_ABERTO" }),
      data: { planoId: null, valorBase: null, valorComDesconto: null },
    })
  })

  it("não altera snapshots nem mensalidades legadas quando o plano permanece o mesmo", async () => {
    const cliente = clienteMensalidades([
      { ...mensalidade(), valorBase: null, valorComDesconto: null },
    ])

    const resultado = await migrarMensalidadesAbertasParaPlanoAluno(cliente as never, {
      ...trocaPlano,
      planoNovoId: "plano-antigo",
    })

    expect(resultado).toBe(0)
    expect(cliente.mensalidade.findMany).not.toHaveBeenCalled()
    expect(cliente.mensalidade.updateMany).not.toHaveBeenCalled()
  })

  it("determina o valor de cada mensalidade conforme seu próprio vencimento", async () => {
    const cliente = clienteMensalidades([
      mensalidade("mensalidade-vencida", "2026-11-10T12:00:00Z"),
      mensalidade("mensalidade-futura", "2026-11-27T12:00:00Z"),
    ])

    await migrarMensalidadesAbertasParaPlanoAluno(cliente as never, {
      ...trocaPlano,
      agora: new Date("2026-11-20T12:00:00Z"),
    })

    expect(cliente.mensalidade.updateMany).toHaveBeenNthCalledWith(1, {
      where: expect.objectContaining({ id: "mensalidade-vencida" }),
      data: expect.objectContaining({ valor: 200, valorBase: 200, valorComDesconto: 175 }),
    })
    expect(cliente.mensalidade.updateMany).toHaveBeenNthCalledWith(2, {
      where: expect.objectContaining({ id: "mensalidade-futura" }),
      data: expect.objectContaining({ valor: 175, valorBase: 200, valorComDesconto: 175 }),
    })
  })

  it("usa o novo dia de vencimento quando plano e prazo mudam juntos", async () => {
    const cliente = clienteMensalidades()

    await migrarMensalidadesAbertasParaPlanoAluno(cliente as never, {
      ...trocaPlano,
      agora: new Date("2026-11-20T12:00:00Z"),
      diaVencimentoNovo: 25,
    })

    expect(cliente.mensalidade.updateMany).toHaveBeenCalledWith({
      where: expect.any(Object),
      data: expect.objectContaining({ valor: 175, valorBase: 200, valorComDesconto: 175 }),
    })
  })

  it("registra o contrato anterior e os novos preços na mesma transação", async () => {
    const cliente = clienteMensalidades()

    await migrarMensalidadesAbertasParaPlanoAluno(cliente as never, {
      ...trocaPlano,
      autorId: "gestor-1",
    })

    expect(cliente.logAuditoria.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        autorId: "gestor-1",
        entidade: "Mensalidade",
        entidadeId: "mensalidade-1",
        valorAntigo: {
          planoId: "plano-antigo",
          valor: 100,
          valorBase: 120,
          valorComDesconto: 100,
        },
        valorNovo: {
          planoId: "plano-novo",
          valor: 175,
          valorBase: 200,
          valorComDesconto: 175,
        },
      }),
    })
  })

  it("não audita nem conta uma alteração concorrente que impediu a migração", async () => {
    const cliente = clienteMensalidades()
    cliente.mensalidade.updateMany.mockResolvedValue({ count: 0 })

    const resultado = await migrarMensalidadesAbertasParaPlanoAluno(cliente as never, {
      ...trocaPlano,
      autorId: "gestor-1",
    })

    expect(resultado).toBe(0)
    expect(cliente.mensalidade.updateMany).toHaveBeenCalledWith({
      where: expect.objectContaining({ atualizadoEm: mensalidade().atualizadoEm }),
      data: expect.any(Object),
    })
    expect(cliente.logAuditoria.create).not.toHaveBeenCalled()
  })
})

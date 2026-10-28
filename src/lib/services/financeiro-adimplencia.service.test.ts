import type { StatusMensalidade } from "@prisma/client"
import { afterEach, describe, expect, it, vi } from "vitest"
import {
  obterOuCriarMensalidadeNaTransacao,
  registrarMensalidadeInicialPaga,
  registrarMensalidadeInicialPagaAsaas,
  sincronizarValorMensalidadeAdimplencia,
} from "./financeiro.service"

function mensalidadeBase(overrides: Record<string, unknown> = {}) {
  return {
    id: "mensalidade-1",
    alunoId: "aluno-1",
    planoId: "plano-1",
    competencia: "2026-11",
    valor: 100,
    valorBase: 120 as number | null,
    valorComDesconto: 100 as number | null,
    vencimento: new Date("2026-11-10T12:00:00Z"),
    status: "EM_ABERTO" as StatusMensalidade,
    pagoEm: null as Date | null,
    formaPagamento: null as string | null,
    observacao: null as string | null,
    atualizadoEm: new Date("2026-11-01T12:00:00Z"),
    aluno: { usuarioId: "usuario-1", usuario: { nome: "Aluno" } },
    cobrancasAsaas: [],
    ...overrides,
  }
}

function clienteFinanceiro(params?: {
  mensalidade?: ReturnType<typeof mensalidadeBase> | null
  valorPlano?: number
  valorBasePlano?: number
}) {
  let mensalidade = params?.mensalidade ?? null
  const eventos: string[] = []
  const tx = {
    $queryRaw: vi.fn(async () => {
      eventos.push("trava")
      return [{ id: "mensalidade-1" }]
    }),
    aluno: {
      findUnique: vi.fn(async () => ({
        id: "aluno-1",
        usuarioId: "usuario-1",
        diaVencimento: 10,
        plano: {
          id: "plano-1",
          valor: params?.valorPlano ?? 100,
          valorBase: params?.valorBasePlano ?? 120,
        },
        modalidadesPlano: [
          {
            plataformaExterna: null,
            modalidade: {
              id: "modalidade-1",
              nome: "Jiu-Jitsu",
              valorRepasseProfessor: 50,
              turmas: [],
            },
          },
        ],
      })),
      updateMany: vi.fn(async () => ({ count: 0 })),
    },
    mensalidade: {
      findUnique: vi.fn(async () => {
        eventos.push("leitura")
        return mensalidade
      }),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        mensalidade = mensalidadeBase(data)
        return mensalidade
      }),
      update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        eventos.push("preco")
        mensalidade = mensalidadeBase({ ...mensalidade, ...data })
        return mensalidade
      }),
      updateMany: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        mensalidade = mensalidadeBase({ ...mensalidade, ...data })
        return { count: 1 }
      }),
      findUniqueOrThrow: vi.fn(async () => mensalidade),
      findFirst: vi.fn(async () => null),
    },
    cobrancaAsaas: {
      findMany: vi.fn(async () => []),
      updateMany: vi.fn(async () => ({ count: 0 })),
    },
    configuracaoAcademia: {
      findUnique: vi.fn(async () => ({ notificarFinanceiro: false })),
    },
    logAuditoria: {
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        eventos.push("auditoria")
        return data
      }),
    },
  }
  return { tx, eventos }
}

afterEach(() => vi.useRealTimers())

describe("sincronização transacional do desconto de adimplência", () => {
  it("trava, relê e aplica o preço base com auditoria no mesmo cliente", async () => {
    const { tx, eventos } = clienteFinanceiro({ mensalidade: mensalidadeBase() })

    const resultado = await sincronizarValorMensalidadeAdimplencia(
      tx as never,
      "mensalidade-1",
      new Date("2026-11-15T03:00:00Z"),
      "gestor-1",
    )

    expect(eventos).toEqual(["trava", "leitura", "preco", "auditoria"])
    expect(resultado?.valor).toBe(120)
    expect(tx.logAuditoria.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        autorId: "gestor-1",
        entidadeId: "mensalidade-1",
        valorAntigo: { valor: 100 },
        valorNovo: expect.objectContaining({ valor: 120, descontoAtivo: false }),
      }),
    })
  })

  it("não grava novamente quando o preço vigente já foi aplicado", async () => {
    const { tx } = clienteFinanceiro({ mensalidade: mensalidadeBase({ valor: 120 }) })

    await sincronizarValorMensalidadeAdimplencia(
      tx as never,
      "mensalidade-1",
      new Date("2026-11-15T03:00:00Z"),
    )

    expect(tx.mensalidade.update).not.toHaveBeenCalled()
    expect(tx.logAuditoria.create).not.toHaveBeenCalled()
  })

  it.each([
    "PAGA",
    "ISENTA",
    "CANCELADA",
  ])("preserva o valor financeiro de uma mensalidade %s após a carência", async (status) => {
    const { tx } = clienteFinanceiro({ mensalidade: mensalidadeBase({ status }) })

    const resultado = await sincronizarValorMensalidadeAdimplencia(
      tx as never,
      "mensalidade-1",
      new Date("2026-11-30T12:00:00Z"),
    )

    expect(resultado?.valor).toBe(100)
    expect(tx.mensalidade.update).not.toHaveBeenCalled()
    expect(tx.logAuditoria.create).not.toHaveBeenCalled()
  })

  it("preserva uma cobrança legada sem snapshots de desconto", async () => {
    const { tx } = clienteFinanceiro({
      mensalidade: mensalidadeBase({ valorBase: null, valorComDesconto: null }),
    })

    await sincronizarValorMensalidadeAdimplencia(
      tx as never,
      "mensalidade-1",
      new Date("2026-11-30T12:00:00Z"),
    )

    expect(tx.mensalidade.update).not.toHaveBeenCalled()
  })

  it("restaura o desconto se um novo vencimento ainda estiver na carência", async () => {
    const { tx } = clienteFinanceiro({
      mensalidade: mensalidadeBase({
        valor: 120,
        vencimento: new Date("2026-11-20T12:00:00Z"),
      }),
    })

    const resultado = await sincronizarValorMensalidadeAdimplencia(
      tx as never,
      "mensalidade-1",
      new Date("2026-11-22T12:00:00Z"),
    )

    expect(resultado?.valor).toBe(100)
    expect(tx.logAuditoria.create).toHaveBeenCalledOnce()
  })
})

describe("snapshots e recebimentos de novas mensalidades", () => {
  it.each([
    { valorPlano: 100, valorBasePlano: 120 },
    { valorPlano: 90, valorBasePlano: 120 },
    { valorPlano: 90, valorBasePlano: 100 },
    { valorPlano: 180, valorBasePlano: 200 },
    { valorPlano: 270, valorBasePlano: 290 },
  ])("captura os dois preços na emissão: $valorPlano / $valorBasePlano", async (precos) => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-11-01T12:00:00Z"))
    const { tx } = clienteFinanceiro(precos)

    const resultado = await obterOuCriarMensalidadeNaTransacao(tx as never, {
      alunoId: "aluno-1",
      competencia: "2026-11",
      autorId: "gestor-1",
    })

    expect(resultado).toMatchObject({
      ok: true,
      criada: true,
      mensalidade: {
        valor: precos.valorPlano,
        valorComDesconto: precos.valorPlano,
        valorBase: precos.valorBasePlano,
      },
    })
  })

  it("a alteração posterior do plano não reescreve snapshots já emitidos", async () => {
    const { tx } = clienteFinanceiro({
      mensalidade: mensalidadeBase(),
      valorPlano: 150,
      valorBasePlano: 170,
    })

    const resultado = await obterOuCriarMensalidadeNaTransacao(tx as never, {
      alunoId: "aluno-1",
      competencia: "2026-11",
    })

    expect(resultado).toMatchObject({
      criada: false,
      mensalidade: { valor: 100, valorComDesconto: 100, valorBase: 120 },
    })
    expect(tx.mensalidade.update).not.toHaveBeenCalled()
    expect(tx.mensalidade.create).not.toHaveBeenCalled()
  })

  it.each([
    { pagoEm: "2026-11-14T23:00:00Z", valorPago: 100 },
    { pagoEm: "2026-11-15T03:00:00Z", valorPago: 120 },
    { pagoEm: "2026-11-15T23:00:00Z", valorPago: 120 },
  ])("baixa manual considera a data real do pagamento: $pagoEm", async (caso) => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-11-20T12:00:00Z"))
    const { tx } = clienteFinanceiro({ mensalidade: mensalidadeBase({ valor: 120 }) })

    const resultado = await registrarMensalidadeInicialPaga(tx as never, {
      alunoId: "aluno-1",
      competenciaEsperada: "2026-11",
      pagoEm: new Date(caso.pagoEm),
      formaPagamento: "Pix",
      autorId: "gestor-1",
    })

    expect(resultado).toMatchObject({
      ok: true,
      mensalidade: { status: "PAGA", valor: caso.valorPago },
    })
  })

  it("preserva o valor já recebido na matrícula Asaas mesmo com aprovação posterior", async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-11-20T12:00:00Z"))
    const { tx } = clienteFinanceiro()

    const resultado = await registrarMensalidadeInicialPagaAsaas(tx as never, {
      alunoId: "aluno-1",
      competencia: "2026-11",
      valor: 100,
      pagoEm: new Date("2026-11-18T12:00:00Z"),
      autorId: null,
    })

    expect(resultado).toMatchObject({
      ok: true,
      mensalidade: {
        status: "PAGA",
        valor: 100,
        valorBase: 120,
        valorComDesconto: 100,
        formaPagamento: "PIX_ASAAS",
      },
    })
  })
})

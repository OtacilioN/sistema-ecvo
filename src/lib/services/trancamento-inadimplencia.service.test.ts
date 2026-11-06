import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => {
  const tx = {
    $queryRaw: vi.fn(),
    aluno: { findUnique: vi.fn(), updateMany: vi.fn() },
    mensalidade: { findFirst: vi.fn() },
  }
  return {
    tx,
    candidatos: vi.fn(),
    transaction: vi.fn(async (executar: (cliente: typeof tx) => unknown) => executar(tx)),
    agendar: vi.fn(),
    processar: vi.fn(),
    registrarLog: vi.fn(),
  }
})
vi.mock("@/lib/db", () => ({
  db: { aluno: { findMany: mocks.candidatos }, $transaction: mocks.transaction },
}))
vi.mock("@/lib/services/auditoria.service", () => ({ registrarLog: mocks.registrarLog }))
vi.mock("@/lib/services/isencao-trancamento.service", () => ({
  agendarIsencaoTrancamento: mocks.agendar,
  processarIsencoesTrancamento: mocks.processar,
}))

import { trancarAlunosInadimplentes } from "./trancamento-inadimplencia.service"

type MensalidadeTeste = { id: string; status: string; vencimento: Date }
type FiltroMensalidade = { status: { in: string[] }; vencimento: { lt: Date } }
const agora = new Date("2026-11-18T03:00:00Z")
let statusAluno: string
let mensalidades: MensalidadeTeste[]

function elegivel(mensalidade: MensalidadeTeste, filtro: FiltroMensalidade) {
  return (
    filtro.status.in.includes(mensalidade.status) && mensalidade.vencimento < filtro.vencimento.lt
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  statusAluno = "INADIMPLENTE"
  mensalidades = [
    { id: "mensalidade-1", status: "VENCIDA", vencimento: new Date("2026-11-10T12:00:00Z") },
  ]
  mocks.tx.$queryRaw.mockResolvedValue([])
  mocks.candidatos.mockImplementation(async ({ where }) =>
    where.status.in.includes(statusAluno) &&
    (!where.id || where.id === "aluno-1") &&
    mensalidades.some((item) => elegivel(item, where.mensalidades.some))
      ? [{ id: "aluno-1" }]
      : [],
  )
  mocks.tx.aluno.findUnique.mockImplementation(async () => ({ status: statusAluno }))
  mocks.tx.mensalidade.findFirst.mockImplementation(
    async ({ where }) =>
      mensalidades
        .filter((item) => elegivel(item, where))
        .sort((a, b) => a.vencimento.getTime() - b.vencimento.getTime())[0] ?? null,
  )
  mocks.tx.aluno.updateMany.mockImplementation(async ({ where, data }) => {
    if (
      !where.status.in.includes(statusAluno) ||
      !mensalidades.some((item) => elegivel(item, where.mensalidades.some))
    )
      return { count: 0 }
    statusAluno = data.status
    return { count: 1 }
  })
  mocks.agendar.mockResolvedValue({ id: "operacao-1" })
  mocks.registrarLog.mockResolvedValue({ id: "log-1" })
  mocks.processar.mockResolvedValue({ ok: true })
})

describe("trancamento automático por inadimplência superior a sete dias", () => {
  it.each([
    ["2026-11-10T15:00:00Z", false],
    ["2026-11-11T03:00:00Z", false],
    ["2026-11-17T03:00:00Z", false],
    ["2026-11-18T02:59:59.999Z", false],
    ["2026-11-18T03:00:00Z", true],
    ["2026-11-19T12:00:00Z", true],
  ])("com vencimento dia 10 e execução %s, tranca=%s", async (instante, tranca) => {
    const resultado = await trancarAlunosInadimplentes({ agora: new Date(instante) })

    expect(resultado).toEqual({ ok: true, trancados: tranca ? 1 : 0, isencoesPendentes: 0 })
    expect(statusAluno).toBe(tranca ? "TRANCADO" : "INADIMPLENTE")
    expect(mocks.agendar).toHaveBeenCalledTimes(tranca ? 1 : 0)
  })

  it.each([
    ["2026-10-31T12:00:00Z", "2026-11-08T03:00:00Z"],
    ["2026-12-31T12:00:00Z", "2027-01-08T03:00:00Z"],
    ["2028-02-29T12:00:00Z", "2028-03-08T03:00:00Z"],
  ])("conta oito dias civis de %s até %s", async (vencimento, instante) => {
    mensalidades[0].vencimento = new Date(vencimento)
    const oitavoDia = new Date(instante)
    expect(
      await trancarAlunosInadimplentes({ agora: new Date(oitavoDia.getTime() - 1) }),
    ).toMatchObject({ trancados: 0 })
    expect(await trancarAlunosInadimplentes({ agora: oitavoDia })).toMatchObject({ trancados: 1 })
  })

  it.each([
    "ATIVO",
    "INADIMPLENTE",
  ])("tranca aluno %s sem depender do job de vencimentos", async (status) => {
    statusAluno = status
    mensalidades[0].status = "EM_ABERTO"

    expect(await trancarAlunosInadimplentes({ agora })).toMatchObject({ trancados: 1 })
    expect(mocks.registrarLog).toHaveBeenCalledWith(
      expect.objectContaining({ valorAntigo: { status } }),
      mocks.tx,
    )
  })

  it.each(["PAGA", "ISENTA", "CANCELADA"])("ignora mensalidade %s mesmo antiga", async (status) => {
    mensalidades[0].status = status
    expect(await trancarAlunosInadimplentes({ agora })).toMatchObject({ trancados: 0 })
    expect(mocks.transaction).not.toHaveBeenCalled()
  })

  it("ignora VENCIDA com data futura ou com apenas sete dias de atraso", async () => {
    mensalidades[0].vencimento = new Date("2026-11-11T12:00:00Z")
    expect(await trancarAlunosInadimplentes({ agora })).toMatchObject({ trancados: 0 })
    mensalidades[0].vencimento = new Date("2026-11-30T12:00:00Z")
    expect(await trancarAlunosInadimplentes({ agora })).toMatchObject({ trancados: 0 })
  })

  it.each(["TRANCADO", "CANCELADO", "SUSPENSO", "INATIVO"])("preserva aluno %s", async (status) => {
    statusAluno = status
    expect(await trancarAlunosInadimplentes({ agora })).toMatchObject({ trancados: 0 })
    expect(mocks.transaction).not.toHaveBeenCalled()
  })

  it("não tranca aluno sem mensalidade interna pendente", async () => {
    mensalidades = []
    expect(await trancarAlunosInadimplentes({ agora })).toMatchObject({ trancados: 0 })
  })

  it("no acesso individual consulta e altera somente o aluno solicitado", async () => {
    expect(await trancarAlunosInadimplentes({ alunoId: "outro-aluno", agora })).toMatchObject({
      trancados: 0,
    })
    expect(await trancarAlunosInadimplentes({ alunoId: "aluno-1", agora })).toMatchObject({
      trancados: 1,
    })
    expect(mocks.tx.aluno.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ id: "aluno-1" }) }),
    )
  })

  it("tranca e audita uma única vez mesmo com múltiplas dívidas e execuções repetidas", async () => {
    mensalidades.push({
      id: "mensalidade-anterior",
      status: "EM_ABERTO",
      vencimento: new Date("2026-10-10T12:00:00Z"),
    })
    expect(await trancarAlunosInadimplentes({ agora })).toMatchObject({ trancados: 1 })
    expect(await trancarAlunosInadimplentes({ agora })).toMatchObject({ trancados: 0 })
    expect(mocks.agendar).toHaveBeenCalledExactlyOnceWith(mocks.tx, "aluno-1", null)
    expect(mocks.registrarLog).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        autorId: null,
        acao: "STATUS_ALUNO",
        entidade: "Aluno",
        entidadeId: "aluno-1",
        valorAntigo: { status: "INADIMPLENTE" },
        valorNovo: {
          status: "TRANCADO",
          motivo: "INADIMPLENCIA_SUPERIOR_A_SETE_DIAS",
          mensalidadeId: "mensalidade-anterior",
          vencimento: "2026-10-10T12:00:00.000Z",
          operacaoIsencaoId: "operacao-1",
        },
      }),
      mocks.tx,
    )
    expect(mocks.processar).toHaveBeenCalledExactlyOnceWith({ operacaoId: "operacao-1" })
    expect(mocks.tx.$queryRaw.mock.calls.map(([sql]) => sql.join("?"))).toEqual([
      'SELECT "id" FROM "Mensalidade" WHERE "alunoId" = ? ORDER BY "id" FOR UPDATE',
      'SELECT "id" FROM "Aluno" WHERE "id" = ? FOR UPDATE',
    ])
    expect(mocks.processar.mock.invocationCallOrder[0]).toBeGreaterThan(
      mocks.registrarLog.mock.invocationCallOrder[0],
    )
  })

  it.each([
    "pagamento",
    "adiamento",
    "cancelamento",
    "outro trancamento",
  ])("revalida após adquirir locks quando houve %s concorrente", async (evento) => {
    mocks.tx.$queryRaw.mockImplementationOnce(async () => {
      if (evento === "pagamento") mensalidades[0].status = "PAGA"
      if (evento === "adiamento") mensalidades[0].vencimento = new Date("2026-11-30T12:00:00Z")
      if (evento === "cancelamento") statusAluno = "CANCELADO"
      if (evento === "outro trancamento") statusAluno = "TRANCADO"
    })

    expect(await trancarAlunosInadimplentes({ agora })).toMatchObject({ trancados: 0 })
    expect(mocks.agendar).not.toHaveBeenCalled()
    expect(mocks.registrarLog).not.toHaveBeenCalled()
    expect(mocks.processar).not.toHaveBeenCalled()
  })

  it("não agenda isenção quando a atualização condicional não altera o aluno", async () => {
    mocks.tx.aluno.updateMany.mockResolvedValueOnce({ count: 0 })
    expect(await trancarAlunosInadimplentes({ agora })).toMatchObject({ trancados: 0 })
    expect(mocks.agendar).not.toHaveBeenCalled()
  })

  it.each([
    "retorno pendente",
    "erro do provedor",
  ])("mantém trancado com operação recuperável em caso de %s", async (falha) => {
    if (falha === "retorno pendente") mocks.processar.mockResolvedValueOnce({ ok: false })
    else mocks.processar.mockRejectedValueOnce(new Error("indisponível"))

    expect(await trancarAlunosInadimplentes({ agora })).toEqual({
      ok: false,
      trancados: 1,
      isencoesPendentes: 1,
    })
    expect(statusAluno).toBe("TRANCADO")
    expect(mocks.agendar).toHaveBeenCalledOnce()
    expect(mocks.registrarLog).toHaveBeenCalledOnce()
  })

  it("falha de auditoria rejeita a transação sem iniciar processamento externo", async () => {
    mocks.registrarLog.mockRejectedValueOnce(new Error("falha de auditoria"))
    await expect(trancarAlunosInadimplentes({ agora })).rejects.toThrow("falha de auditoria")
    expect(mocks.processar).not.toHaveBeenCalled()
  })
})

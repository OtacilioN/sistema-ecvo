import { Prisma } from "@prisma/client"
import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => {
  const tx = {
    $queryRaw: vi.fn(),
    usuario: { findUnique: vi.fn() },
    aluno: { findUnique: vi.fn(), update: vi.fn() },
    mensalidade: { findUnique: vi.fn(), findFirst: vi.fn(), update: vi.fn(), create: vi.fn() },
    operacaoIsencaoTrancamento: { findFirst: vi.fn() },
    contratoPixAutomatico: { findFirst: vi.fn() },
    cobrancaReativacaoAsaas: { findFirst: vi.fn() },
  }
  return {
    tx,
    transaction: vi.fn(async (callback: (cliente: typeof tx) => unknown) => callback(tx)),
    registrarLog: vi.fn(),
  }
})
vi.mock("@/lib/db", () => ({ db: { $transaction: mocks.transaction } }))
vi.mock("@/lib/services/auditoria.service", () => ({ registrarLog: mocks.registrarLog }))

import { destrancarAlunoComPagamentoManual } from "./destrancamento-manual.service"

const agora = new Date("2026-11-16T21:30:00Z")
const params = {
  alunoId: "renato",
  autorId: "gestor",
  competencia: "2026-11",
  valor: 100,
  pagoEm: new Date("2026-11-16T15:00:00Z"),
  formaPagamento: "MANUAL",
  observacao: "Pagamento recebido manualmente para destrancamento.",
  agora,
}
const plano = {
  id: "plano",
  ativo: true,
  periodicidade: "MENSAL",
  familia: false,
  valor: new Prisma.Decimal(100),
  valorBase: new Prisma.Decimal(120),
}
const aluno = {
  id: params.alunoId,
  tipo: "MENSALISTA",
  status: "TRANCADO",
  usuario: { ativo: true },
  plano,
  planoId: plano.id,
  diaVencimento: 16,
  vencimentoMesSeguinte: false,
  modalidadesPlano: [
    {
      plataformaExterna: null,
      modalidade: {
        id: "boxe",
        nome: "Boxe",
        valorRepasseProfessor: new Prisma.Decimal(60),
        turmas: [],
      },
    },
  ],
}
const mensalidade = {
  id: "novembro",
  alunoId: aluno.id,
  competencia: "2026-11",
  planoId: plano.id,
  status: "ISENTA",
  valor: new Prisma.Decimal(100),
  valorBase: new Prisma.Decimal(120),
  valorComDesconto: new Prisma.Decimal(100),
  cobrancasAsaas: [],
  cobrancaMatriculaAsaas: null,
  contratoPixAutomaticoId: null,
  cobrancaQuitacaoAsaasId: null,
  repasseSnapshot: [{ modalidadeId: "boxe", professorId: "professor-original", valorBase: 100 }],
}

beforeEach(() => {
  vi.resetAllMocks()
  mocks.transaction.mockImplementation(async (callback) => callback(mocks.tx))
  mocks.tx.usuario.findUnique.mockResolvedValue({ papel: "GESTOR", ativo: true })
  mocks.tx.aluno.findUnique.mockResolvedValue(aluno)
  mocks.tx.operacaoIsencaoTrancamento.findFirst.mockResolvedValue(null)
  mocks.tx.contratoPixAutomatico.findFirst.mockResolvedValue(null)
  mocks.tx.cobrancaReativacaoAsaas.findFirst.mockResolvedValue(null)
  mocks.tx.mensalidade.findUnique.mockResolvedValue(mensalidade)
  mocks.tx.mensalidade.findFirst.mockResolvedValue(null)
  mocks.tx.mensalidade.update.mockResolvedValue(mensalidade)
  mocks.tx.mensalidade.create.mockResolvedValue({ id: "nova" })
})

function semMutacoes() {
  expect(mocks.tx.mensalidade.update).not.toHaveBeenCalled()
  expect(mocks.tx.mensalidade.create).not.toHaveBeenCalled()
  expect(mocks.tx.aluno.update).not.toHaveBeenCalled()
  expect(mocks.registrarLog).not.toHaveBeenCalled()
}

describe("destrancamento manual pela gestão", () => {
  it("registra os R$100 reais sobre a isenção atual e libera Renato, sem alterar junho", async () => {
    expect(await destrancarAlunoComPagamentoManual(params)).toEqual({
      ok: true,
      mensalidadeId: "novembro",
    })
    expect(mocks.tx.mensalidade.update).toHaveBeenCalledExactlyOnceWith({
      where: { id: "novembro" },
      data: expect.objectContaining({
        valor: 100,
        status: "PAGA",
        pagoEm: params.pagoEm,
        formaPagamento: "MANUAL",
        reativacaoMatricula: true,
        reativadaEm: agora,
        repasseSnapshot: mensalidade.repasseSnapshot,
      }),
    })
    expect(mocks.tx.mensalidade.create).not.toHaveBeenCalled()
    expect(mocks.tx.aluno.update).toHaveBeenCalledWith({
      where: { id: "renato" },
      data: { status: "ATIVO" },
    })
    expect(mocks.registrarLog).toHaveBeenCalledWith(
      expect.objectContaining({
        acao: "PAGAMENTO",
        autorId: "gestor",
        entidadeId: "novembro",
        valorAntigo: expect.objectContaining({ status: "ISENTA" }),
        valorNovo: expect.objectContaining({ status: "PAGA", valor: 100 }),
      }),
      mocks.tx,
    )
    expect(mocks.registrarLog).toHaveBeenCalledWith(
      expect.objectContaining({
        acao: "STATUS_ALUNO",
        valorNovo: expect.objectContaining({ status: "ATIVO", mensalidadeId: "novembro" }),
      }),
      mocks.tx,
    )
  })

  it("mantém o valor efetivamente informado mesmo que diferente do preço do plano", async () => {
    await destrancarAlunoComPagamentoManual({ ...params, valor: 90.5 })
    expect(mocks.tx.mensalidade.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ valor: 90.5, valorBase: plano.valorBase }),
      }),
    )
  })

  it("cria a competência ausente com repasse e vencimento do mês seguinte preservado", async () => {
    mocks.tx.mensalidade.findUnique.mockResolvedValue(null)
    mocks.tx.aluno.findUnique.mockResolvedValue({
      ...aluno,
      diaVencimento: 1,
      vencimentoMesSeguinte: true,
    })
    await destrancarAlunoComPagamentoManual(params)
    expect(mocks.tx.mensalidade.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        alunoId: aluno.id,
        competencia: "2026-11",
        status: "PAGA",
        valor: 100,
        vencimento: new Date("2026-12-01T12:00:00Z"),
        repasseSnapshot: [expect.objectContaining({ modalidadeId: "boxe" })],
      }),
    })
  })

  it("bloqueia uma segunda tentativa após o primeiro destrancamento sem duplicar receita", async () => {
    await destrancarAlunoComPagamentoManual(params)
    mocks.tx.aluno.findUnique.mockResolvedValue({ ...aluno, status: "ATIVO" })
    expect((await destrancarAlunoComPagamentoManual(params)).ok).toBe(false)
    expect(mocks.tx.mensalidade.update).toHaveBeenCalledTimes(1)
    expect(mocks.registrarLog).toHaveBeenCalledTimes(2)
  })

  it.each(["PAGA"])("recusa mensalidade %s para não duplicar pagamento", async (status) => {
    mocks.tx.mensalidade.findUnique.mockResolvedValue({ ...mensalidade, status })
    expect((await destrancarAlunoComPagamentoManual(params)).ok).toBe(false)
    semMutacoes()
  })

  it("recusa dívida histórica pendente antes de liberar e provocar novo trancamento", async () => {
    mocks.tx.mensalidade.findFirst.mockResolvedValue({ id: "junho" })
    expect(await destrancarAlunoComPagamentoManual(params)).toMatchObject({
      ok: false,
      motivo: expect.stringContaining("novo bloqueio"),
    })
    semMutacoes()
  })

  it.each([
    ["isencao", "operacaoIsencaoTrancamento"],
    ["Pix automático", "contratoPixAutomatico"],
    ["reativação online", "cobrancaReativacaoAsaas"],
  ] as const)("não concorre com %s em andamento", async (_, model) => {
    mocks.tx[model].findFirst.mockResolvedValue({ id: "pendente" })
    expect((await destrancarAlunoComPagamentoManual(params)).ok).toBe(false)
    semMutacoes()
  })

  it.each([
    { cobrancasAsaas: [{ id: "recebida-ou-ativa" }] },
    { cobrancaMatriculaAsaas: { id: "compartilhada" } },
    { cobrancaQuitacaoAsaasId: "quitacao" },
    { contratoPixAutomaticoId: "contrato" },
  ])("protege vínculos financeiros existentes: %j", async (vinculo) => {
    mocks.tx.mensalidade.findUnique.mockResolvedValue({ ...mensalidade, ...vinculo })
    expect((await destrancarAlunoComPagamentoManual(params)).ok).toBe(false)
    semMutacoes()
  })

  it.each([
    { plano: null },
    { plano: { ...plano, ativo: false } },
    { plano: { ...plano, familia: true } },
    { tipo: "AVULSO" },
    { status: "CANCELADO" },
    { usuario: { ativo: false } },
    { modalidadesPlano: [] },
  ])("não altera matrícula inelegível: %j", async (alteracao) => {
    mocks.tx.aluno.findUnique.mockResolvedValue({ ...aluno, ...alteracao })
    expect((await destrancarAlunoComPagamentoManual(params)).ok).toBe(false)
    semMutacoes()
  })

  it.each([
    { papel: "PROFESSOR", ativo: true },
    { papel: "GESTOR", ativo: false },
    null,
  ])("exige autor gestor ativo no serviço: %j", async (autor) => {
    mocks.tx.usuario.findUnique.mockResolvedValue(autor)
    expect((await destrancarAlunoComPagamentoManual(params)).ok).toBe(false)
    semMutacoes()
  })

  it.each([
    { valor: 0 },
    { valor: -100 },
    { valor: 100.001 },
    { valor: Number.NaN },
    { competencia: "2026-10" },
    { pagoEm: new Date("2026-11-17T03:00:00Z") },
    { pagoEm: new Date("2026-10-16T15:00:00Z") },
    { pagoEm: new Date("invalid") },
    { formaPagamento: "PIX_ASAAS" },
    { observacao: " " },
  ])("recusa dados inválidos antes de tocar o banco: %j", async (alteracao) => {
    expect((await destrancarAlunoComPagamentoManual({ ...params, ...alteracao })).ok).toBe(false)
    expect(mocks.transaction).not.toHaveBeenCalled()
  })

  it("propaga falha de auditoria para o Prisma reverter pagamento e liberação", async () => {
    mocks.registrarLog.mockRejectedValueOnce(new Error("falha audit"))
    await expect(destrancarAlunoComPagamentoManual(params)).rejects.toThrow("falha audit")
    expect(mocks.transaction).toHaveBeenCalledTimes(1)
  })
})

import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => {
  const tx = {
    $executeRaw: vi.fn(),
    usuario: { findFirst: vi.fn() },
    aluno: { findUnique: vi.fn() },
    modalidade: { findUnique: vi.fn() },
    registroImportado: { findFirst: vi.fn() },
    exclusaoRepasseExternoMensal: { findUnique: vi.fn(), create: vi.fn() },
  }
  return { tx, db: { $transaction: vi.fn() }, registrarLog: vi.fn() }
})

vi.mock("@/lib/db", () => ({ db: mocks.db }))
vi.mock("@/lib/services/auditoria.service", () => ({ registrarLog: mocks.registrarLog }))

import {
  cadastrarExclusoesRepasseExternoMensal,
  type ExclusaoRepasseExternoMensalInput,
} from "./exclusoes-repasse.service"

const dados: ExclusaoRepasseExternoMensalInput = {
  competencia: "2026-08",
  plataforma: "WELLHUB",
  alunoId: "aluno-1",
  modalidadeId: "muay-thai",
  professorId: "oyama",
  justificativa: "Modalidade sem elegibilidade em agosto; preservar receita e mensalidade interna.",
}

describe("exclusões de repasse externo mensal", () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mocks.db.$transaction.mockImplementation(async (operacao) => operacao(mocks.tx))
    mocks.tx.usuario.findFirst.mockResolvedValue({ id: "gestor-1" })
    mocks.tx.exclusaoRepasseExternoMensal.findUnique.mockResolvedValue(null)
    mocks.tx.exclusaoRepasseExternoMensal.create.mockImplementation(async ({ data }) => ({
      id: `exclusao-${data.alunoId}`,
      ...data,
      criadoEm: new Date("2026-09-13T12:00:00Z"),
    }))
    mocks.tx.aluno.findUnique.mockResolvedValue({
      tipo: "WELLHUB",
      modalidades: [{ id: "muay-thai" }],
      modalidadesPlano: [{ modalidadeId: "muay-thai", plataformaExterna: "WELLHUB" }],
    })
    mocks.tx.modalidade.findUnique.mockResolvedValue({
      turmas: [{ professorId: "oyama" }, { professorId: "oyama" }],
    })
    mocks.tx.registroImportado.findFirst.mockResolvedValue({ id: "receita-1" })
  })

  it.each([
    "2026-00",
    "2026-13",
    "0000-08",
    "2026-8",
    "2026-08-01",
  ])("rejeita competência inválida %s antes de acessar o banco", async (competencia) => {
    await expect(
      cadastrarExclusoesRepasseExternoMensal("gestor-1", [{ ...dados, competencia }]),
    ).rejects.toThrow()
    expect(mocks.db.$transaction).not.toHaveBeenCalled()
  })

  it("exige plataforma externa, justificativa e lote sem duplicatas", async () => {
    for (const entrada of [
      { ...dados, plataforma: "PIX" },
      { ...dados, justificativa: "  " },
      { ...dados, alunoId: "" },
    ]) {
      await expect(
        cadastrarExclusoesRepasseExternoMensal("gestor-1", [
          entrada as ExclusaoRepasseExternoMensalInput,
        ]),
      ).rejects.toThrow()
    }
    await expect(cadastrarExclusoesRepasseExternoMensal("gestor-1", [])).rejects.toThrow()
    await expect(
      cadastrarExclusoesRepasseExternoMensal("gestor-1", [dados, dados]),
    ).rejects.toThrow("Não repita")
    expect(mocks.db.$transaction).not.toHaveBeenCalled()
  })

  it("recusa autor que não seja gestor ativo, inclusive em repetição idempotente", async () => {
    mocks.tx.usuario.findFirst.mockResolvedValue(null)
    await expect(cadastrarExclusoesRepasseExternoMensal("gestor-1", [dados])).rejects.toThrow(
      "gestor ativo",
    )
    expect(mocks.tx.usuario.findFirst).toHaveBeenCalledWith({
      where: { id: "gestor-1", papel: "GESTOR", ativo: true },
      select: { id: true },
    })
    expect(mocks.tx.exclusaoRepasseExternoMensal.findUnique).not.toHaveBeenCalled()
    expect(mocks.tx.exclusaoRepasseExternoMensal.create).not.toHaveBeenCalled()
  })

  it("cadastra duas exclusões numa transação e audita apenas o escopo de agosto", async () => {
    const lote = [dados, { ...dados, alunoId: "aluno-2" }]
    const registros = await cadastrarExclusoesRepasseExternoMensal("gestor-1", lote)
    expect(registros).toHaveLength(2)
    expect(mocks.db.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: "ReadCommitted",
    })
    expect(mocks.tx.$executeRaw).toHaveBeenCalledTimes(2)
    expect(mocks.tx.$executeRaw.mock.invocationCallOrder[1]).toBeLessThan(
      mocks.tx.exclusaoRepasseExternoMensal.findUnique.mock.invocationCallOrder[0],
    )
    for (const exclusao of lote) {
      expect(mocks.tx.registroImportado.findFirst).toHaveBeenCalledWith({
        where: {
          alunoId: exclusao.alunoId,
          statusConciliacao: "CONCILIADO",
          valorRepasse: { not: null },
          importacao: { resumoMensal: true, competencia: "2026-08", plataforma: "WELLHUB" },
        },
        select: { id: true },
      })
      expect(mocks.registrarLog).toHaveBeenCalledWith(
        {
          autorId: "gestor-1",
          acao: "CONFIGURACAO",
          entidade: "ExclusaoRepasseExternoMensal",
          entidadeId: `exclusao-${exclusao.alunoId}`,
          valorNovo: { ...exclusao, criadoPorId: "gestor-1" },
          justificativa: exclusao.justificativa,
        },
        mocks.tx,
      )
    }
  })

  it("repetição retorna o registro existente sem outra escrita ou auditoria", async () => {
    const existente = { id: "anterior", ...dados, criadoPorId: "gestor-1" }
    mocks.tx.exclusaoRepasseExternoMensal.findUnique.mockResolvedValue(existente)
    expect(await cadastrarExclusoesRepasseExternoMensal("gestor-1", [dados])).toEqual([existente])
    expect(mocks.tx.exclusaoRepasseExternoMensal.create).not.toHaveBeenCalled()
    expect(mocks.registrarLog).not.toHaveBeenCalled()
    expect(mocks.tx.aluno.findUnique).not.toHaveBeenCalled()
  })

  it("não sobrescreve silenciosamente uma exclusão existente com outra justificativa", async () => {
    mocks.tx.exclusaoRepasseExternoMensal.findUnique.mockResolvedValue({
      ...dados,
      justificativa: "Outra decisão",
    })
    await expect(cadastrarExclusoesRepasseExternoMensal("gestor-1", [dados])).rejects.toThrow(
      "outra justificativa",
    )
    expect(mocks.tx.exclusaoRepasseExternoMensal.create).not.toHaveBeenCalled()
  })

  it("recusa modalidade coberta por mensalidade interna mesmo com tipo legado Wellhub", async () => {
    mocks.tx.aluno.findUnique.mockResolvedValue({
      tipo: "WELLHUB",
      modalidades: [{ id: "muay-thai" }],
      modalidadesPlano: [{ modalidadeId: "muay-thai", plataformaExterna: null }],
    })
    await expect(cadastrarExclusoesRepasseExternoMensal("gestor-1", [dados])).rejects.toThrow(
      "sem vínculo",
    )
    expect(mocks.tx.exclusaoRepasseExternoMensal.create).not.toHaveBeenCalled()
  })

  it("aceita cobertura TotalPass legada quando não existe cobertura explícita", async () => {
    mocks.tx.aluno.findUnique.mockResolvedValue({
      tipo: "TOTALPASS",
      modalidades: [{ id: "muay-thai" }],
      modalidadesPlano: [],
    })
    await cadastrarExclusoesRepasseExternoMensal("gestor-1", [
      { ...dados, plataforma: "TOTALPASS" },
    ])
    expect(mocks.tx.exclusaoRepasseExternoMensal.create).toHaveBeenCalledWith({
      data: { ...dados, plataforma: "TOTALPASS", criadoPorId: "gestor-1" },
    })
  })

  it.each([
    null,
    { turmas: [] },
    { turmas: [{ professorId: "outro" }] },
    { turmas: [{ professorId: "oyama" }, { professorId: "outro" }] },
  ])("recusa modalidade inexistente, sem professor, incompatível ou ambígua (%j)", async (modalidade) => {
    mocks.tx.modalidade.findUnique.mockResolvedValue(modalidade)
    await expect(cadastrarExclusoesRepasseExternoMensal("gestor-1", [dados])).rejects.toThrow(
      "destinatário único",
    )
    expect(mocks.tx.exclusaoRepasseExternoMensal.create).not.toHaveBeenCalled()
  })

  it("valida o lote inteiro antes de escrever se a segunda receita não existe", async () => {
    mocks.tx.registroImportado.findFirst
      .mockResolvedValueOnce({ id: "receita-1" })
      .mockResolvedValueOnce(null)
    await expect(
      cadastrarExclusoesRepasseExternoMensal("gestor-1", [dados, { ...dados, alunoId: "aluno-2" }]),
    ).rejects.toThrow("Não há receita")
    expect(mocks.tx.exclusaoRepasseExternoMensal.create).not.toHaveBeenCalled()
    expect(mocks.registrarLog).not.toHaveBeenCalled()
  })

  it("propaga falha da auditoria para impedir a confirmação da transação", async () => {
    mocks.registrarLog.mockRejectedValue(new Error("Falha de auditoria"))
    await expect(cadastrarExclusoesRepasseExternoMensal("gestor-1", [dados])).rejects.toThrow(
      "Falha de auditoria",
    )
    expect(mocks.registrarLog.mock.calls[0][1]).toBe(mocks.tx)
    expect(mocks.db.$transaction).toHaveBeenCalledOnce()
  })
})

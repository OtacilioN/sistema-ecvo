import { describe, expect, it, vi } from "vitest"
import { isencaoAtualDoTrancamento } from "./elegibilidade-reativacao.service"

const mensalidade = { id: "m1", alunoId: "a1", atualizadoEm: new Date("2026-11-04T12:00:00.000Z") }
function cliente(op: unknown, valorNovo: unknown) {
  return {
    operacaoIsencaoTrancamento: { findFirst: vi.fn().mockResolvedValue(op) },
    logAuditoria: { findFirst: vi.fn().mockResolvedValue(valorNovo ? { valorNovo } : null) },
  }
}
const operacao = { id: "o1", status: "CONCLUIDA", mensalidadeIds: ["m1"] }
const log = { status: "ISENTA", operacaoId: "o1", atualizadoEm: "2026-11-04T12:00:00.000Z" }
describe("elegibilidade da isenção para reativação", () => {
  it("aceita isenção auditada da última operação sem alteração posterior", async () => {
    expect(await isencaoAtualDoTrancamento(cliente(operacao, log) as never, mensalidade)).toBe(true)
  })
  it.each([
    [null, log],
    [{ ...operacao, status: "PENDENTE" }, log],
    [{ ...operacao, mensalidadeIds: [] }, log],
    [operacao, null],
    [operacao, { ...log, operacaoId: "antiga" }],
    [operacao, { ...log, status: "PAGA" }],
    [operacao, { ...log, atualizadoEm: "2026-11-04T11:59:59.000Z" }],
  ])("rejeita sem prova da isenção vigente da operação", async (op, registro) => {
    expect(await isencaoAtualDoTrancamento(cliente(op, registro) as never, mensalidade)).toBe(false)
  })
})

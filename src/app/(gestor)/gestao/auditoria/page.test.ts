import { beforeEach, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({ exigirGestao: vi.fn(), findMany: vi.fn() }))
vi.mock("@/lib/auth/dal", () => ({ exigirGestao: mocks.exigirGestao }))
vi.mock("@/lib/db", () => ({ db: { logAuditoria: { findMany: mocks.findMany } } }))

import Page from "./page"

beforeEach(() => {
  vi.clearAllMocks()
  mocks.findMany.mockResolvedValue([])
})

it("exclui os registros privados de estorno antes de enviar logs ao navegador da secretaria", async () => {
  mocks.exigirGestao.mockResolvedValue({ papel: "SECRETARIA" })
  await Page()
  expect(mocks.findMany).toHaveBeenCalledWith(
    expect.objectContaining({
      where: { entidade: { notIn: ["EstornoPontualFredAsaas", "EvidenciasEstornoFredAsaas"] } },
    }),
  )
})

it("permite ao gestor consultar a auditoria com comprovantes e dados bancários", async () => {
  mocks.exigirGestao.mockResolvedValue({ papel: "GESTOR" })
  await Page()
  expect(mocks.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: undefined }))
})

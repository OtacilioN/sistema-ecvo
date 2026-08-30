import { beforeEach, describe, expect, it, vi } from "vitest"
import { listarModalidades } from "@/lib/services/modalidade.service"

const mocks = vi.hoisted(() => ({
  findMany: vi.fn(),
}))

vi.mock("@/lib/db", () => ({
  db: {
    modalidade: {
      findMany: mocks.findMany,
    },
  },
}))

vi.mock("@/lib/services/auditoria.service", () => ({
  registrarLog: vi.fn(),
}))

beforeEach(() => {
  mocks.findMany.mockReset()
})

describe("listarModalidades", () => {
  it("lista somente modalidades ativas por padrão", () => {
    listarModalidades()

    expect(mocks.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { ativa: true } }))
  })

  it("inclui inativas somente quando solicitado explicitamente", () => {
    listarModalidades({ incluirInativas: true })

    expect(mocks.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: undefined }))
  })
})

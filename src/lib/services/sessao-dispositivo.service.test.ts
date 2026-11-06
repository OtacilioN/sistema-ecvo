import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  createMany: vi.fn(),
  findFirst: vi.fn(),
  updateMany: vi.fn(),
}))
vi.mock("server-only", () => ({}))
vi.mock("@/lib/db", () => ({ db: { sessaoDispositivo: mocks } }))

import {
  criarSessaoDispositivo,
  registrarSessaoLegada,
  renovarSessaoDispositivo,
  revogarSessaoDispositivo,
  revogarSessaoLegada,
  validarSessaoDispositivo,
} from "./sessao-dispositivo.service"

const DIA = 86_400_000

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers()
  vi.setSystemTime(new Date("2026-11-05T12:00:00Z"))
  mocks.create.mockResolvedValue({})
  mocks.createMany.mockResolvedValue({ count: 1 })
  mocks.updateMany.mockResolvedValue({ count: 0 })
  mocks.findFirst.mockResolvedValue(null)
})

afterEach(() => vi.useRealTimers())

describe("sessão por dispositivo", () => {
  it("cria identificadores diferentes para cada login", async () => {
    const prazo = new Date(Date.now() + 30 * DIA)
    const a = await criarSessaoDispositivo("aluno", prazo)
    const b = await criarSessaoDispositivo("aluno", prazo)
    expect(a).toMatch(/^sessao:/)
    expect(a).not.toBe(b)
    expect(mocks.create).toHaveBeenCalledWith({
      data: { id: a, usuarioId: "aluno", expiraEm: prazo },
    })
  })

  it("valida titular, revogação e expiração", async () => {
    mocks.findFirst.mockResolvedValue({ id: "sessao:1" })
    expect(await validarSessaoDispositivo("sessao:1", "aluno")).toBe(true)
    expect(mocks.findFirst).toHaveBeenCalledWith({
      where: { id: "sessao:1", usuarioId: "aluno", revogadaEm: null, expiraEm: { gt: new Date() } },
      select: { id: true },
    })
  })

  it("renova apenas sessão ainda ativa e sem reduzir seu prazo", async () => {
    const prazo = new Date(Date.now() + 30 * DIA)
    mocks.updateMany.mockResolvedValue({ count: 1 })
    expect(await renovarSessaoDispositivo("sessao:1", "aluno", prazo)).toBe(true)
    expect(mocks.updateMany).toHaveBeenCalledWith({
      where: {
        id: "sessao:1",
        usuarioId: "aluno",
        revogadaEm: null,
        expiraEm: { gt: new Date(), lte: new Date(Date.now() + 29 * DIA), lt: prazo },
      },
      data: { expiraEm: prazo },
    })
    mocks.updateMany.mockResolvedValue({ count: 0 })
    mocks.findFirst.mockResolvedValue(null)
    expect(await renovarSessaoDispositivo("sessao:1", "aluno", prazo)).toBe(false)
  })

  it("revoga somente a sessão e o usuário informados", async () => {
    await revogarSessaoDispositivo("sessao:1", "aluno")
    expect(mocks.updateMany).toHaveBeenCalledWith({
      where: { id: "sessao:1", usuarioId: "aluno", revogadaEm: null },
      data: { revogadaEm: new Date() },
    })
  })

  it("registra sessão legada sem sobrescrever revogação e respeita validade", async () => {
    const prazo = new Date(Date.now() + DIA)
    expect(await registrarSessaoLegada("legado:hash", "aluno", prazo)).toBe(false)
    expect(mocks.createMany).toHaveBeenCalledWith({
      data: [{ id: "legado:hash", usuarioId: "aluno", expiraEm: prazo }],
      skipDuplicates: true,
    })
    mocks.createMany.mockClear()
    expect(await registrarSessaoLegada("legado:hash", "aluno", new Date())).toBe(false)
    expect(mocks.createMany).not.toHaveBeenCalled()
  })

  it("cria tombstone no logout legado mesmo antes do primeiro registro", async () => {
    const prazo = new Date(Date.now() + DIA)
    await revogarSessaoLegada("legado:hash", "aluno", prazo)
    expect(mocks.createMany).toHaveBeenCalledWith({
      data: [{ id: "legado:hash", usuarioId: "aluno", expiraEm: prazo, revogadaEm: new Date() }],
      skipDuplicates: true,
    })
    expect(mocks.updateMany).toHaveBeenCalledWith({
      where: { id: "legado:hash", usuarioId: "aluno", revogadaEm: null },
      data: { revogadaEm: new Date() },
    })
  })

  it.each([
    "logout primeiro",
    "registro primeiro",
  ])("não restaura uma sessão legada após logout: %s", async (ordem) => {
    type Registro = { id: string; usuarioId: string; expiraEm: Date; revogadaEm?: Date }
    let registro: Registro | undefined
    mocks.createMany.mockImplementation(async ({ data }: { data: Registro[] }) => {
      if (!registro) registro = { ...data[0] }
      return { count: 1 }
    })
    mocks.updateMany.mockImplementation(async ({ where, data }) => {
      if (registro && registro.id === where.id && !registro.revogadaEm) {
        registro.revogadaEm = data.revogadaEm
        return { count: 1 }
      }
      return { count: 0 }
    })
    mocks.findFirst.mockImplementation(async ({ where }) =>
      registro &&
      registro.id === where.id &&
      registro.usuarioId === where.usuarioId &&
      !registro.revogadaEm &&
      registro.expiraEm > where.expiraEm.gt
        ? { id: registro.id }
        : null,
    )
    const prazo = new Date(Date.now() + DIA)
    if (ordem === "registro primeiro") {
      expect(await registrarSessaoLegada("legado:hash", "aluno", prazo)).toBe(true)
    }
    await revogarSessaoLegada("legado:hash", "aluno", prazo)
    expect(await registrarSessaoLegada("legado:hash", "aluno", prazo)).toBe(false)
  })
})

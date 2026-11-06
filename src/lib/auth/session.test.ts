import { decodeJwt } from "jose"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  set: vi.fn(),
  delete: vi.fn(),
  criar: vi.fn(),
  revogar: vi.fn(),
  revogarLegada: vi.fn(),
}))
vi.mock("next/headers", () => ({ cookies: async () => mocks }))
vi.mock("@/lib/services/sessao-dispositivo.service", () => ({
  criarSessaoDispositivo: mocks.criar,
  revogarSessaoDispositivo: mocks.revogar,
  revogarSessaoLegada: mocks.revogarLegada,
}))

import {
  COOKIE_SESSAO,
  criarSessao,
  descriptografar,
  destruirSessao,
  encriptar,
  lerSessao,
} from "./session"

const DIA_MS = 86_400_000
const aluno = { sub: "aluno-1", nome: "Aluno", papel: "ALUNO" as const, versao: 3 }

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers()
  vi.setSystemTime(new Date("2026-11-05T12:00:00Z"))
  vi.stubEnv("SESSION_SECRET", "segredo-apenas-para-teste-de-sessao-persistente")
  mocks.criar.mockResolvedValue("sessao:dispositivo")
  mocks.revogar.mockResolvedValue(undefined)
  mocks.revogarLegada.mockResolvedValue(undefined)
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllEnvs()
})

describe("sessão persistente", () => {
  it.each([
    ["ALUNO", 365],
    ["GESTOR", 7],
    ["SECRETARIA", 7],
    ["PROFESSOR", 7],
  ] as const)("mantém JWT e cookie de %s válidos por %i dias", async (papel, dias) => {
    vi.stubEnv("NODE_ENV", "production")
    await criarSessao({ ...aluno, papel })
    const [nome, token, opcoes] = mocks.set.mock.calls[0]
    const payload = decodeJwt(token)
    expect(payload.sessaoId).toBe("sessao:dispositivo")
    expect(mocks.criar).toHaveBeenCalledWith(
      aluno.sub,
      new Date(Date.now() + Math.min(dias, 30) * DIA_MS),
    )
    expect(nome).toBe(COOKIE_SESSAO)
    expect(payload.exp).toBe(Date.now() / 1000 + (dias * DIA_MS) / 1000)
    expect(opcoes).toEqual({
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      expires: new Date(payload.exp! * 1000),
    })
    vi.advanceTimersByTime(dias * DIA_MS - 1000)
    expect(await descriptografar(token)).toMatchObject({ ...aluno, papel })
    vi.advanceTimersByTime(1000)
    expect(await descriptografar(token)).toBeNull()
  })

  it("rejeita cookie ausente, assinatura adulterada e segredo diferente", async () => {
    const token = await encriptar(aluno)
    const [cabecalho, payload, assinatura] = token.split(".")
    const alterado = `${cabecalho}.${payload}.${assinatura[0] === "a" ? "b" : "a"}${assinatura.slice(1)}`
    expect(await descriptografar(undefined)).toBeNull()
    expect(await descriptografar(alterado)).toBeNull()
    vi.stubEnv("SESSION_SECRET", "outro-segredo-de-teste-de-sessao-persistente")
    expect(await descriptografar(token)).toBeNull()
  })

  it("lê o cookie persistido e remove-o ao sair", async () => {
    mocks.get.mockReturnValue({
      value: await encriptar({ ...aluno, sessaoId: "sessao:dispositivo" }),
    })
    expect(await lerSessao()).toMatchObject(aluno)
    expect(mocks.get).toHaveBeenCalledWith(COOKIE_SESSAO)
    await destruirSessao()
    expect(mocks.revogar).toHaveBeenCalledWith("sessao:dispositivo", aluno.sub)
    expect(mocks.delete).toHaveBeenCalledWith(COOKIE_SESSAO)
  })

  it("identifica e revoga um token legado sem guardar o token", async () => {
    const token = await encriptar(aluno)
    mocks.get.mockReturnValue({ value: token })
    const sessao = await lerSessao()
    expect(sessao?.sessaoId).toMatch(/^legado:[a-f0-9]{64}$/)
    await destruirSessao()
    expect(mocks.revogarLegada).toHaveBeenCalledWith(
      sessao?.sessaoId,
      aluno.sub,
      new Date(sessao!.exp! * 1000),
    )
  })
})

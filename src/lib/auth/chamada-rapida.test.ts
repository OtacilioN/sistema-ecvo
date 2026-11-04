import { SignJWT } from "jose"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { LOCALIZACAO_ACADEMIA } from "@/lib/geolocalizacao"

const { jar, set } = vi.hoisted(() => {
  const jar = new Map<string, string>()
  return { jar, set: vi.fn((nome: string, valor: string) => jar.set(nome, valor)) }
})
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: (nome: string) => ({ value: jar.get(nome) }), set }),
}))

import {
  COOKIE_CHAMADA,
  COOKIE_LOCALIZACAO_CHAMADA,
  chaveChamadaValida,
  DURACAO_CHAMADA_SEGUNDOS,
  emitirPermissaoChamada,
  limparLocalizacaoChamada,
  localizacaoChamadaValida,
  temPermissaoChamada,
} from "./chamada-rapida"

beforeEach(() => {
  jar.clear()
  vi.clearAllMocks()
  vi.stubEnv("CHECKIN_CHAMADA_CHAVE", "chave-de-teste-exclusiva-com-32-caracteres")
  vi.stubEnv("SESSION_SECRET", "sessao-de-teste-com-32-caracteres-exclusivos")
})
afterEach(() => {
  vi.unstubAllEnvs()
  vi.useRealTimers()
})

describe("chave do QR da chamada", () => {
  it("exige configuração forte e uma única chave exata", () => {
    expect(chaveChamadaValida(process.env.CHECKIN_CHAMADA_CHAVE)).toBe(true)
    for (const chave of [undefined, "", "incorreta", [process.env.CHECKIN_CHAMADA_CHAVE]]) {
      expect(chaveChamadaValida(chave)).toBe(false)
    }
    vi.stubEnv("CHECKIN_CHAMADA_CHAVE", "curta")
    expect(chaveChamadaValida("curta")).toBe(false)
    vi.stubEnv("CHECKIN_CHAMADA_CHAVE", "")
    expect(chaveChamadaValida("")).toBe(false)
  })
})

describe("localização da chamada", () => {
  const dados = () => ({ ...LOCALIZACAO_ACADEMIA, precisao: 10, capturadaEm: Date.now() })
  it("permite a academia e o ponto dentro de 200m, rejeitando o raio maior dos alunos", () => {
    expect(localizacaoChamadaValida(dados())).toBe(true)
    expect(
      localizacaoChamadaValida({
        ...dados(),
        latitude: LOCALIZACAO_ACADEMIA.latitude + 199 / 111_195,
      }),
    ).toBe(true)
    expect(
      localizacaoChamadaValida({
        ...dados(),
        latitude: LOCALIZACAO_ACADEMIA.latitude + 201 / 111_195,
      }),
    ).toBe(false)
    expect(
      localizacaoChamadaValida({
        ...dados(),
        latitude: LOCALIZACAO_ACADEMIA.latitude + 250 / 111_195,
      }),
    ).toBe(false)
  })
  it("rejeita coordenadas inválidas, imprecisas ou antigas", () => {
    for (const alteracao of [
      { latitude: Number.NaN },
      { longitude: 181 },
      { latitude: 91 },
      { precisao: 201 },
      { precisao: -1 },
      { precisao: Number.POSITIVE_INFINITY },
      { capturadaEm: Date.now() - 61_000 },
      { capturadaEm: Date.now() + 61_000 },
    ])
      expect(localizacaoChamadaValida({ ...dados(), ...alteracao })).toBe(false)
  })
})

describe("permissão isolada de chamada", () => {
  it("não confunde as etapas e usa cookie restrito à página", async () => {
    expect(await temPermissaoChamada("consulta")).toBe(false)
    await emitirPermissaoChamada("localizacao")
    expect(await temPermissaoChamada("localizacao")).toBe(true)
    expect(await temPermissaoChamada("consulta")).toBe(false)
    jar.set(COOKIE_CHAMADA, jar.get(COOKIE_LOCALIZACAO_CHAMADA) ?? "")
    expect(await temPermissaoChamada("consulta")).toBe(false)
    await emitirPermissaoChamada("consulta")
    expect(await temPermissaoChamada("consulta")).toBe(true)
    expect(set).toHaveBeenLastCalledWith(
      COOKIE_CHAMADA,
      expect.any(String),
      expect.objectContaining({
        httpOnly: true,
        sameSite: "strict",
        path: "/gestao/checkin",
        maxAge: DURACAO_CHAMADA_SEGUNDOS,
      }),
    )
    await limparLocalizacaoChamada()
    expect(await temPermissaoChamada("localizacao")).toBe(false)
  })
  it("expira consulta e não permite estender os 30 minutos", async () => {
    vi.useFakeTimers()
    await emitirPermissaoChamada("consulta")
    vi.advanceTimersByTime((DURACAO_CHAMADA_SEGUNDOS + 1) * 1000)
    expect(await temPermissaoChamada("consulta")).toBe(false)
  })
  it("expira o comprovante de localização em 2 minutos", async () => {
    vi.useFakeTimers()
    await emitirPermissaoChamada("localizacao")
    vi.advanceTimersByTime(121_000)
    expect(await temPermissaoChamada("localizacao")).toBe(false)
  })
  it("rotacionar o segredo do QR revoga permissões já emitidas", async () => {
    await emitirPermissaoChamada("consulta")
    vi.stubEnv("CHECKIN_CHAMADA_CHAVE", "outra-chave-de-teste-com-32-caracteres")
    expect(await temPermissaoChamada("consulta")).toBe(false)
  })
  it("não aceita o JWT da sessão de usuário nem permissões adulteradas", async () => {
    const normal = await new SignJWT({ sub: "professor", papel: "PROFESSOR", etapa: "consulta" })
      .setProtectedHeader({ alg: "HS256" })
      .setExpirationTime("1h")
      .sign(new TextEncoder().encode(process.env.SESSION_SECRET))
    jar.set(COOKIE_CHAMADA, normal)
    expect(await temPermissaoChamada("consulta")).toBe(false)
    await emitirPermissaoChamada("consulta")
    jar.set(COOKIE_CHAMADA, `${jar.get(COOKIE_CHAMADA)}alterado`)
    expect(await temPermissaoChamada("consulta")).toBe(false)
  })
})

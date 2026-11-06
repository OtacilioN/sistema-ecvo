import { NextRequest } from "next/server"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { COOKIE_SESSAO, descriptografar, encriptar } from "@/lib/auth/session"
import { proxy } from "./proxy"

const DIA_MS = 86_400_000
const aluno = {
  sub: "aluno-1",
  nome: "Aluno",
  papel: "ALUNO" as const,
  versao: 3,
  sessaoId: "sessao-1",
}

function requisicao(
  token?: string,
  caminho = "/aluno",
  opcoes: { method?: string; headers?: HeadersInit } = {},
) {
  const headers = new Headers(opcoes.headers)
  if (token) headers.set("cookie", `${COOKIE_SESSAO}=${token}`)
  return new NextRequest(new URL(caminho, "https://ecvo.example.com"), {
    ...opcoes,
    headers,
  })
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date("2026-11-05T12:00:00Z"))
  vi.stubEnv("SESSION_SECRET", "segredo-apenas-para-teste-de-sessao-persistente")
  vi.stubEnv("NODE_ENV", "production")
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllEnvs()
})

describe("cookie estável no proxy", () => {
  it.each<{ method?: string; headers?: Record<string, string> }>([
    {},
    { method: "POST", headers: { "next-action": "sair" } },
    { method: "HEAD" },
    { headers: { "next-router-prefetch": "1" } },
    { headers: { purpose: "prefetch" } },
  ])("não envia Set-Cookie em requisições autenticadas: %j", async (opcoes) => {
    const token = await encriptar(aluno)
    vi.advanceTimersByTime(2 * DIA_MS)
    const resposta = await proxy(requisicao(token, "/aluno", opcoes))
    expect(resposta.headers.get("set-cookie")).toBeNull()
    expect(resposta.headers.get("x-middleware-next")).toBe("1")
    expect(await descriptografar(token)).toMatchObject(aluno)
  })

  it("não sobrescreve logout ou outro login com uma resposta de navegação anterior", async () => {
    const tokenAntigo = await encriptar(aluno)
    vi.advanceTimersByTime(DIA_MS)
    const respostaAnterior = await proxy(requisicao(tokenAntigo))
    // Sem Set-Cookie, a resposta atrasada não altera o cookie removido ou recém-criado.
    expect(respostaAnterior.headers.get("set-cookie")).toBeNull()
  })

  it.each(["/", "/login", "/gestao"])("redireciona %s sem reemitir o cookie", async (caminho) => {
    const token = await encriptar(aluno)
    vi.advanceTimersByTime(2 * DIA_MS)
    const resposta = await proxy(requisicao(token, caminho))
    expect(resposta.headers.get("location")).toBe("https://ecvo.example.com/aluno")
    expect(resposta.headers.get("set-cookie")).toBeNull()
  })

  it("respeita o limite absoluto do JWT de aluno sem prolongá-lo no proxy", async () => {
    const token = await encriptar(aluno)
    vi.advanceTimersByTime(365 * DIA_MS - 1000)
    const antes = await proxy(requisicao(token))
    expect(antes.headers.get("x-middleware-next")).toBe("1")
    expect(antes.headers.get("set-cookie")).toBeNull()
    vi.advanceTimersByTime(1000)
    const depois = await proxy(requisicao(token))
    expect(depois.headers.get("location")).toBe("https://ecvo.example.com/login")
    expect(depois.headers.get("set-cookie")).toBeNull()
  })

  it.each([undefined, "token-invalido"])("não cria sessão a partir de %s", async (token) => {
    const resposta = await proxy(requisicao(token))
    expect(resposta.headers.get("location")).toBe("https://ecvo.example.com/login")
    expect(resposta.headers.get("set-cookie")).toBeNull()
  })

  it.each([
    "GESTOR",
    "SECRETARIA",
    "PROFESSOR",
  ] as const)("mantém os 7 dias fixos de %s", async (papel) => {
    const token = await encriptar({ ...aluno, papel })
    vi.advanceTimersByTime(6 * DIA_MS)
    expect((await proxy(requisicao(token, "/"))).headers.get("set-cookie")).toBeNull()
    vi.advanceTimersByTime(DIA_MS)
    const resposta = await proxy(requisicao(token, "/gestao"))
    expect(resposta.headers.get("location")).toBe("https://ecvo.example.com/login")
    expect(resposta.headers.get("set-cookie")).toBeNull()
  })
})

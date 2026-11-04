import { readFileSync } from "node:fs"
import { createContext, runInContext } from "node:vm"
import { describe, expect, it, vi } from "vitest"

const codigoWorker = readFileSync(new URL("../../public/sw.js", import.meta.url), "utf8")

function ambiente() {
  const put = vi.fn()
  const matchPagina = vi.fn()
  const fallback = { offline: true }
  const fetch = vi.fn()
  const contexto = createContext({
    self: { location: { origin: "https://ecvo.test" }, addEventListener: vi.fn() },
    caches: {
      open: async () => ({ put, match: matchPagina }),
      match: async () => fallback,
    },
    URL,
    Response,
    fetch,
  })
  runInContext(codigoWorker, contexto)
  const carregar = (path: string) =>
    contexto.networkFirstPagina({ url: `https://ecvo.test${path}` })
  return { put, matchPagina, fallback, fetch, carregar }
}

describe("cache offline da chamada", () => {
  it.each([
    "/gestao/checkin?acesso=teste",
    "/gestao/checkin/?acesso=teste",
  ])("não guarda nem recupera dados da chamada em %s", async (path) => {
    const worker = ambiente()
    const resposta = {
      ok: true,
      type: "basic",
      url: "https://ecvo.test/gestao/checkin?acesso=teste",
    }
    worker.fetch.mockResolvedValueOnce(resposta)
    expect(await worker.carregar(path)).toBe(resposta)
    expect(worker.put).not.toHaveBeenCalled()
    worker.fetch.mockRejectedValueOnce(new Error("offline"))
    worker.matchPagina.mockResolvedValue(resposta)
    expect(await worker.carregar(path)).toBe(worker.fallback)
    expect(worker.matchPagina).not.toHaveBeenCalled()
  })
  it("não guarda redirecionamento para chamada nem recupera resposta desse destino", async () => {
    const worker = ambiente()
    const resposta = { ok: true, type: "basic", url: "https://ecvo.test/gestao/checkin/" }
    worker.fetch.mockResolvedValueOnce(resposta)
    expect(await worker.carregar("/atalho")).toBe(resposta)
    expect(worker.put).not.toHaveBeenCalled()
    worker.fetch.mockRejectedValueOnce(new Error("offline"))
    worker.matchPagina.mockResolvedValue(resposta)
    expect(await worker.carregar("/atalho")).toBe(worker.fallback)
  })
  it("preserva o cache habitual das outras páginas", async () => {
    const worker = ambiente()
    const resposta = { ok: true, type: "basic", url: "https://ecvo.test/aluno", clone: vi.fn() }
    worker.fetch.mockResolvedValue(resposta)
    await worker.carregar("/aluno")
    expect(worker.put).toHaveBeenCalledOnce()
    worker.fetch.mockRejectedValueOnce(new Error("offline"))
    worker.matchPagina.mockResolvedValue(resposta)
    expect(await worker.carregar("/aluno")).toBe(resposta)
  })
})

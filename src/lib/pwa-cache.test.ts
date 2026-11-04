import { readFileSync } from "node:fs"
import { runInNewContext } from "node:vm"
import { describe, expect, it, vi } from "vitest"

const codigo = readFileSync(new URL("../../public/sw.js", import.meta.url), "utf8")

function ambiente() {
  const cache = { match: vi.fn(), put: vi.fn() }
  const fetch = vi.fn()
  const contexto = {
    self: { location: { origin: "https://app.example.com" }, addEventListener: vi.fn() },
    caches: { open: vi.fn().mockResolvedValue(cache), match: vi.fn() },
    fetch,
    URL,
    Response,
    networkFirstPagina: undefined as unknown as (request: { url: string }) => Promise<Response>,
  }
  runInNewContext(codigo, contexto)
  return { contexto, cache, fetch }
}

describe("cache offline de recuperação de senha", () => {
  it("não armazena o formulário com token nem respostas redirecionadas para ele", async () => {
    const { contexto, cache, fetch } = ambiente()
    const resposta = {
      ok: true,
      type: "basic",
      url: "https://app.example.com/redefinir-senha?token=segredo",
      clone: vi.fn(),
    }
    fetch.mockResolvedValue(resposta)
    await contexto.networkFirstPagina({ url: resposta.url })
    await contexto.networkFirstPagina({ url: "https://app.example.com/outra-pagina" })
    expect(cache.put).not.toHaveBeenCalled()
    expect(resposta.clone).not.toHaveBeenCalled()
  })

  it("não restaura um formulário com token quando a rede falha", async () => {
    const { contexto, cache, fetch } = ambiente()
    fetch.mockRejectedValue(new Error("offline"))
    const resposta = await contexto.networkFirstPagina({
      url: "https://app.example.com/redefinir-senha/?token=segredo",
    })
    expect(cache.match).not.toHaveBeenCalled()
    expect(resposta.status).toBe(503)
  })
})

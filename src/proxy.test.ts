import { NextRequest } from "next/server"
import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({ descriptografar: vi.fn() }))
vi.mock("@/lib/auth/session", () => ({
  COOKIE_SESSAO: "ecvo_sessao",
  descriptografar: mocks.descriptografar,
}))

import { proxy } from "./proxy"

function requisicao(caminho: string, cookie?: string) {
  return new NextRequest(new URL(caminho, "https://ecvo.example.com"), {
    headers: cookie ? { cookie } : undefined,
  })
}

describe("exceção exata da chamada no proxy", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.descriptografar.mockResolvedValue(null)
  })

  it("deixa a página exata decidir o acesso mesmo sem autenticação", async () => {
    const resposta = await proxy(requisicao("/gestao/checkin?acesso=chave"))
    expect(resposta.headers.get("x-middleware-next")).toBe("1")
    expect(resposta.headers.get("location")).toBeNull()
  })

  it.each([
    "/gestao/checkin/qrcode",
    "/gestao/checkin/outra",
    "/gestao/checkin-extra",
    "/gestao/alunos",
  ])("mantém autenticação de %s mesmo com cookie de chamada e chave", async (caminho) => {
    const resposta = await proxy(
      requisicao(`${caminho}?acesso=chave`, "ecvo_chamada=permissao-rapida"),
    )
    expect(resposta.headers.get("location")).toBe("https://ecvo.example.com/login")
    expect(mocks.descriptografar).toHaveBeenCalledWith(undefined)
  })

  it("professor pode chegar à chamada, mas não às outras rotas de gestão", async () => {
    mocks.descriptografar.mockResolvedValue({ sub: "professor", papel: "PROFESSOR" })
    const chamada = await proxy(requisicao("/gestao/checkin", "ecvo_sessao=token-professor"))
    expect(chamada.headers.get("x-middleware-next")).toBe("1")
    const alunos = await proxy(requisicao("/gestao/alunos", "ecvo_sessao=token-professor"))
    expect(alunos.headers.get("location")).toBe("https://ecvo.example.com/professor")
    const qrcode = await proxy(requisicao("/gestao/checkin/qrcode", "ecvo_sessao=token-professor"))
    expect(qrcode.headers.get("location")).toBe("https://ecvo.example.com/professor")
  })
})

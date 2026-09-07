import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  findFirst: vi.fn(),
  get: vi.fn(),
}))

vi.mock("@/lib/db", () => ({
  db: { aluno: { findFirst: mocks.findFirst } },
}))
vi.mock("@vercel/blob", () => ({ get: mocks.get }))

import { GET } from "./route"

const contexto = { params: Promise.resolve({ alunoId: "aluno-1" }) }

describe("foto pública de aluno graduado", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("serve a foto privada somente quando o aluno pode constar na lista pública", async () => {
    mocks.findFirst.mockResolvedValue({
      fotoUrl: "/api/fotos/alunos/aluno-1/perfil.jpg",
      usuario: { fotoUrl: null },
    })
    mocks.get.mockResolvedValue({
      statusCode: 200,
      stream: new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode("foto"))
          controller.close()
        },
      }),
      blob: { size: 4, contentType: "image/jpeg", etag: "etag-foto" },
    })

    const resposta = await GET(
      new Request("https://app.ecvo.com.br/api/publico/alunos-graduados/aluno-1/foto"),
      contexto,
    )

    expect(resposta.status).toBe(200)
    expect(resposta.headers.get("content-type")).toBe("image/jpeg")
    expect(resposta.headers.get("cross-origin-resource-policy")).toBe("cross-origin")
    expect(await resposta.text()).toBe("foto")
    expect(mocks.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: "aluno-1",
          status: { in: ["ATIVO", "INADIMPLENTE"] },
          usuario: { ativo: true },
          graduacoes: { some: {} },
        },
      }),
    )
    expect(mocks.get).toHaveBeenCalledWith("alunos/aluno-1/perfil.jpg", {
      access: "private",
      ifNoneMatch: undefined,
    })
  })

  it("não publica foto de aluno fora dos critérios públicos", async () => {
    mocks.findFirst.mockResolvedValue(null)

    const resposta = await GET(
      new Request("https://app.ecvo.com.br/api/publico/alunos-graduados/aluno-1/foto"),
      contexto,
    )

    expect(resposta.status).toBe(404)
    expect(mocks.get).not.toHaveBeenCalled()
  })
})

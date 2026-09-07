import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  findMany: vi.fn(),
}))

vi.mock("@/lib/db", () => ({
  db: { aluno: { findMany: mocks.findMany } },
}))

import { GET, OPTIONS } from "./route"

describe("API pública de alunos graduados", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("publica somente o contrato necessário para a landing", async () => {
    mocks.findMany.mockResolvedValue([
      {
        id: "aluno-1",
        fotoUrl: "/api/fotos/alunos/aluno-1/perfil.jpg",
        usuario: { nome: "Ana Silva", fotoUrl: null },
        graduacoes: [
          {
            concedidaEm: new Date("2026-08-30T18:00:00.000Z"),
            graduacao: { nome: "Faixa azul", modalidade: { nome: "Jiu-Jitsu" } },
          },
        ],
      },
      {
        id: "aluno-2",
        fotoUrl: null,
        usuario: { nome: "Bruno Lima", fotoUrl: "https://cdn.example/bruno.webp" },
        graduacoes: [
          {
            concedidaEm: new Date("2026-09-01T12:00:00.000Z"),
            graduacao: { nome: "Amarela", modalidade: { nome: "Kickboxing" } },
          },
        ],
      },
    ])

    const resposta = await GET(new Request("https://app.ecvo.com.br/api/publico/alunos-graduados"))

    expect(resposta.status).toBe(200)
    expect(resposta.headers.get("access-control-allow-origin")).toBe("*")
    expect(await resposta.json()).toEqual({
      total: 2,
      alunos: [
        {
          nome: "Ana Silva",
          fotoUrl: "https://app.ecvo.com.br/api/publico/alunos-graduados/aluno-1/foto",
          graduacoes: [
            {
              modalidade: "Jiu-Jitsu",
              faixa: "Faixa azul",
              dataGraduacao: "2026-08-30T18:00:00.000Z",
            },
          ],
        },
        {
          nome: "Bruno Lima",
          fotoUrl: "https://cdn.example/bruno.webp",
          graduacoes: [
            {
              modalidade: "Kickboxing",
              faixa: "Amarela",
              dataGraduacao: "2026-09-01T12:00:00.000Z",
            },
          ],
        },
      ],
    })
    expect(mocks.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          status: { in: ["ATIVO", "INADIMPLENTE"] },
          usuario: { ativo: true },
          graduacoes: { some: {} },
        },
      }),
    )
  })

  it("responde ao preflight CORS", () => {
    const resposta = OPTIONS()

    expect(resposta.status).toBe(204)
    expect(resposta.headers.get("access-control-allow-methods")).toBe("GET, OPTIONS")
  })

  it("não expõe detalhes internos quando a consulta falha", async () => {
    const erroConsole = vi.spyOn(console, "error").mockImplementation(() => undefined)
    mocks.findMany.mockRejectedValue(new Error("detalhe privado"))

    const resposta = await GET(new Request("https://app.ecvo.com.br/api/publico/alunos-graduados"))

    expect(resposta.status).toBe(500)
    expect(resposta.headers.get("access-control-allow-origin")).toBe("*")
    expect(await resposta.json()).toEqual({
      erro: "Não foi possível carregar os alunos graduados.",
    })
    erroConsole.mockRestore()
  })
})

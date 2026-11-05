import * as React from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({ aula: vi.fn(), outroCheckin: vi.fn() }))
vi.mock("@/lib/auth/dal", () => ({ exigirAluno: async () => ({ alunoId: "aluno" }) }))
vi.mock("@/lib/db", () => ({
  db: {
    aluno: { findUnique: async () => ({ status: "ATIVO", tipo: "MENSALISTA" }) },
    aula: { findUnique: mocks.aula },
    checkin: { findFirst: mocks.outroCheckin },
  },
}))
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("notFound")
  },
}))
vi.mock("./form-checkin-qr", () => ({
  FormCheckinQr: ({ aulaId }: { aulaId: string }) =>
    React.createElement("form", { "data-aula": aulaId }, "Confirmar check-in"),
}))

import CheckinQrPage from "./page"

async function renderizar() {
  return renderToStaticMarkup(
    await CheckinQrPage({
      params: Promise.resolve({ aulaId: "kickboxing-20h" }),
      searchParams: Promise.resolve({ token: "qr" }),
    }),
  )
}

describe("limite diário no QR Code da aula", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal("React", React)
    mocks.aula.mockResolvedValue({
      id: "kickboxing-20h",
      inicio: new Date("2026-11-04T20:00:00-03:00"),
      fim: new Date("2026-11-04T21:00:00-03:00"),
      cancelada: false,
      turma: {
        nome: "Kickboxing 20:00",
        modalidadeId: "boxe-kickboxing",
        modalidade: { nome: "Boxe e Kickboxing" },
      },
      checkins: [],
    })
    mocks.outroCheckin.mockResolvedValue(null)
  })
  afterEach(() => vi.unstubAllGlobals())

  it("não exibe formulário quando outra aula da mesma modalidade já ocupa o dia", async () => {
    mocks.outroCheckin.mockResolvedValue({ id: "checkin-8h" })
    const html = await renderizar()
    expect(html).toContain("É permitida apenas uma aula por modalidade por dia.")
    expect(html).not.toContain("<form")
    expect(mocks.outroCheckin).toHaveBeenCalledWith({
      where: {
        alunoId: "aluno",
        status: { in: ["VALIDO", "PENDENTE_REVISAO"] },
        aulaId: { not: "kickboxing-20h" },
        aula: {
          inicio: {
            gte: new Date("2026-11-04T00:00:00-03:00"),
            lt: new Date("2026-11-05T00:00:00-03:00"),
          },
          turma: { modalidadeId: "boxe-kickboxing" },
        },
      },
      select: { id: true },
    })
  })

  it("mantém a confirmação da aula sem outro check-in nessa modalidade e dia", async () => {
    expect(await renderizar()).toContain('data-aula="kickboxing-20h"')
  })
})

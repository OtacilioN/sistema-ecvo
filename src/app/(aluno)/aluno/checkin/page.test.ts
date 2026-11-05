import * as React from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  aluno: vi.fn(),
  aulas: vi.fn(),
  token: vi.fn(),
  registrosDiarios: vi.fn(),
}))

vi.mock("@/lib/auth/dal", () => ({
  exigirAluno: async () => ({ alunoId: "aluno" }),
}))
vi.mock("@/lib/db", () => ({
  db: {
    aluno: { findUnique: mocks.aluno },
    aula: { findMany: mocks.aulas },
    checkin: { findMany: mocks.registrosDiarios },
  },
}))
vi.mock("@/lib/services/checkin-token.service", () => ({ tokenCheckinValido: mocks.token }))
vi.mock("@/lib/services/checkin.service", () => ({ montarCandidataCheckinLivre: vi.fn() }))
vi.mock("../minhas-horas-aluno", () => ({ MinhasHorasAluno: () => null }))
vi.mock("./leitor-qrcode-aluno", () => ({ LeitorQRCodeAluno: () => null }))
vi.mock("./form-checkin-global", () => ({
  FormCheckinGlobal: ({ aulaId }: { aulaId: string }) =>
    React.createElement("form", { "data-qr-aula": aulaId }, "Confirmar check-in"),
}))
vi.mock("./form-checkin-geolocalizacao", () => ({
  FormCheckinGeolocalizacao: ({ aulaId }: { aulaId: string }) =>
    React.createElement("form", { "data-geo-aula": aulaId }, "Usar localização"),
}))

import CheckinGlobalPage from "./page"

function aula(id: string, nome: string, hora: number) {
  return {
    id,
    inicio: new Date(`2026-11-04T${hora}:00:00-03:00`),
    fim: new Date(`2026-11-04T${hora + 1}:00:00-03:00`),
    cancelada: false,
    turma: {
      nome,
      capacidade: 0,
      local: null,
      ehEvento: false,
      modalidade: {
        id: "boxe-kickboxing",
        nome: "Boxe e Kickboxing",
        checkinSemRestricaoHorario: false,
      },
    },
    comparecimentos: [],
    checkins: [] as Array<{ id: string; alunoId: string; status: string }>,
  }
}

async function renderizar(token?: string) {
  return renderToStaticMarkup(await CheckinGlobalPage({ searchParams: Promise.resolve({ token }) }))
}

describe("escolha de turma no check-in do aluno", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal("React", React)
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-11-04T19:50:00-03:00"))
    mocks.token.mockResolvedValue(true)
    mocks.registrosDiarios.mockResolvedValue([])
    mocks.aluno.mockResolvedValue({
      status: "ATIVO",
      tipo: "MENSALISTA",
      planoId: "plano",
      solicitacaoMatricula: null,
      modalidades: [{ id: "boxe-kickboxing", checkinSemRestricaoHorario: false }],
      modalidadesPlano: [{ modalidadeId: "boxe-kickboxing", plataformaExterna: false }],
      acessosAulaAvulsa: [],
    })
    mocks.aulas.mockResolvedValue([
      aula("boxe", "Boxe 19:00", 19),
      aula("kickboxing", "Kickboxing 20:00", 20),
    ])
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it.each([
    undefined,
    "qr-valido",
  ])("às 19:50 pede a turma sem pré-seleção nem formulário para token %s", async (token) => {
    const html = await renderizar(token)
    expect(html).toContain("Em qual turma você vai treinar?")
    expect(html).toContain("Boxe 19:00")
    expect(html).toContain("Kickboxing 20:00")
    expect(html).toContain("19:00–20:00")
    expect(html).toContain("20:00–21:00")
    expect(html.match(/type="radio"/g)).toHaveLength(2)
    expect(html).not.toContain("checked=")
    expect(html).not.toContain("<form")
  })

  it("abre a escolha exatamente 30 minutos antes do kickboxing", async () => {
    vi.setSystemTime(new Date("2026-11-04T19:30:00-03:00"))
    expect(await renderizar()).toContain("Em qual turma você vai treinar?")
  })

  it.each([
    undefined,
    "qr-valido",
  ])("antes da abertura do kickboxing confirma apenas boxe (token %s)", async (token) => {
    vi.setSystemTime(new Date("2026-11-04T19:29:59-03:00"))
    const html = await renderizar(token)
    expect(html).toContain("Boxe 19:00")
    expect(html).toContain(`${token ? "data-qr-aula" : "data-geo-aula"}="boxe"`)
    expect(html).not.toContain("Kickboxing 20:00")
    expect(html).not.toContain('type="radio"')
  })

  it("mantém ambas no limite final do boxe e só kickboxing depois dele", async () => {
    vi.setSystemTime(new Date("2026-11-04T20:30:00-03:00"))
    expect(await renderizar()).toContain("Em qual turma você vai treinar?")
    vi.setSystemTime(new Date("2026-11-04T20:30:01-03:00"))
    const html = await renderizar()
    expect(html).not.toContain("Boxe 19:00")
    expect(html).toContain('data-geo-aula="kickboxing"')
  })

  it.each([
    "VALIDO",
    "PENDENTE_REVISAO",
  ])("mantém o registro %s de boxe visível e bloqueia kickboxing no mesmo dia", async (status) => {
    const boxe = aula("boxe", "Boxe 19:00", 19)
    boxe.checkins = [{ id: "checkin-boxe", alunoId: "aluno", status }]
    mocks.aulas.mockResolvedValue([boxe, aula("kickboxing", "Kickboxing 20:00", 20)])
    mocks.registrosDiarios.mockResolvedValue([
      {
        aulaId: "boxe",
        aula: { inicio: boxe.inicio, turma: { modalidadeId: "boxe-kickboxing" } },
      },
    ])
    const html = await renderizar()
    expect(html).toContain("Boxe 19:00")
    expect(html).toContain("É permitida apenas uma aula por modalidade por dia.")
    expect(html).not.toContain('data-geo-aula="kickboxing"')
    expect(html).not.toContain('data-geo-aula="boxe"')
    expect(html).not.toContain('type="radio"')
    expect(html).toContain(status === "VALIDO" ? "Ver passe" : "Pendente de revisão")
  })

  it.each([
    undefined,
    "qr-valido",
  ])("um check-in às 8h bloqueia boxe e kickboxing à noite, mesmo sem a aula da manhã na tela (%s)", async (token) => {
    mocks.registrosDiarios.mockResolvedValue([
      {
        aulaId: "kickboxing-8h",
        aula: {
          inicio: new Date("2026-11-04T08:00:00-03:00"),
          turma: { modalidadeId: "boxe-kickboxing" },
        },
      },
    ])
    const html = await renderizar(token)
    expect(html).toContain("Você já tem um check-in em Boxe e Kickboxing neste dia.")
    expect(html).not.toContain("<form")
    expect(html).not.toContain('type="radio"')
    expect(mocks.registrosDiarios).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          alunoId: "aluno",
          status: { in: ["VALIDO", "PENDENTE_REVISAO"] },
          aula: {
            inicio: {
              gte: new Date("2026-11-04T00:00:00-03:00"),
              lt: new Date("2026-11-05T00:00:00-03:00"),
            },
          },
        },
      }),
    )
  })

  it.each([
    ["2026-11-02T08:00:00-03:00", "boxe-kickboxing"],
    ["2026-11-04T08:00:00-03:00", "jiu-jitsu"],
  ])("mantém a escolha com registro em outro dia ou modalidade (%s, %s)", async (inicio, modalidadeId) => {
    mocks.registrosDiarios.mockResolvedValue([
      { aulaId: "outra-aula", aula: { inicio: new Date(inicio), turma: { modalidadeId } } },
    ])
    const html = await renderizar()
    expect(html).toContain("Em qual turma você vai treinar?")
    expect(html).not.toContain("É permitida apenas uma aula por modalidade por dia.")
  })

  it("permite check-in em outra modalidade quando o limite de boxe e kickboxing já foi usado", async () => {
    const jiujitsu = aula("jiu-jitsu", "Jiu-jitsu 20:00", 20)
    jiujitsu.turma.modalidade = {
      ...jiujitsu.turma.modalidade,
      id: "jiu-jitsu",
      nome: "Jiu-jitsu",
    }
    mocks.aulas.mockResolvedValue([aula("boxe", "Boxe 19:00", 19), jiujitsu])
    mocks.registrosDiarios.mockResolvedValue([
      {
        aulaId: "kickboxing-8h",
        aula: {
          inicio: new Date("2026-11-04T08:00:00-03:00"),
          turma: { modalidadeId: "boxe-kickboxing" },
        },
      },
    ])
    const html = await renderizar()
    expect(html).toContain('data-geo-aula="jiu-jitsu"')
    expect(html).not.toContain('data-geo-aula="boxe"')
    expect(html).not.toContain('type="radio"')
  })

  it("não oferece check-in quando não há aula liberada", async () => {
    vi.setSystemTime(new Date("2026-11-04T22:00:00-03:00"))
    const html = await renderizar()
    expect(html).toContain("Nenhuma aula liberada agora.")
    expect(html).not.toContain("<form")
    expect(html).not.toContain('type="radio"')
  })
})

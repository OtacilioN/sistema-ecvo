import * as React from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { LinhaMonitoramentoAula, TentativaInadimplenteAula } from "@/lib/aula-monitoramento"

const mocks = vi.hoisted(() => ({
  aulas: vi.fn(),
  monitoramento: vi.fn(),
  chamadaRapida: vi.fn(),
  seletor: vi.fn(),
  acoes: vi.fn(),
}))

vi.mock("@/lib/db", () => ({ db: { aula: { findMany: mocks.aulas } } }))
vi.mock("@/lib/services/aula-monitoramento.service", () => ({
  carregarMonitoramentoAula: mocks.monitoramento,
}))
vi.mock("@/lib/services/chamada-rapida.service", () => ({
  carregarChamadaRapida: mocks.chamadaRapida,
}))
vi.mock("@/app/(gestor)/gestao/checkin/seletor-aula-checkin", () => ({
  SeletorAulaCheckin: mocks.seletor,
}))
vi.mock("@/components/checkin/acoes-card-aluno", () => ({ AcoesCardAlunoCheckin: mocks.acoes }))
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }))
vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) =>
    React.createElement("a", { href }, children),
}))

import { PainelChamada } from "./painel-chamada"

const aula = {
  id: "aula-hoje",
  inicio: new Date("2026-11-04T18:00:00-03:00"),
  fim: new Date("2026-11-04T19:00:00-03:00"),
  duracaoMin: 60,
  cancelada: false,
  professor: { usuario: { nome: "Professor da aula" } },
  turma: {
    nome: "Turma da noite",
    local: "Tatame",
    ehEvento: false,
    modalidade: { nome: "Jiu-Jitsu" },
    professor: null,
  },
}

function linha(alunoId: string, dados: Partial<LinhaMonitoramentoAula>): LinhaMonitoramentoAula {
  return {
    alunoId,
    nome: alunoId,
    status: "AUSENTE",
    temComparecimento: false,
    observacoesTecnicas: null,
    historicoObservacoesTecnicas: [],
    checkinId: null,
    checkinRealizadoEm: null,
    checkinAssociadoAutomaticamente: false,
    ...dados,
  }
}

const tentativa: TentativaInadimplenteAula = {
  alunoId: "Presente sem agendamento",
  nome: "Presente sem agendamento",
  motivo: "Motivo financeiro restrito",
  ultimaTentativaEm: new Date("2026-11-04T18:01:00-03:00"),
  totalTentativas: 1,
  observacoesTecnicas: null,
  historicoObservacoesTecnicas: [],
}

async function renderizar(dados: Partial<Parameters<typeof PainelChamada>[0]> = {}) {
  return renderToStaticMarkup(
    await PainelChamada({ searchParams: Promise.resolve({}), podeEditar: false, ...dados }),
  )
}

function totalPresentes(html: string) {
  return html.match(/Alunos presentes<\/span>[\s\S]*?<p[^>]*>(\d+)<\/p>/)?.[1]
}

describe("PainelChamada", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-11-04T18:30:00-03:00"))
    vi.stubGlobal("React", React)
    mocks.aulas.mockResolvedValue([aula])
    mocks.monitoramento.mockResolvedValue({ lista: [], tentativasInadimplentes: [] })
    mocks.chamadaRapida.mockResolvedValue({ lista: [], tentativasInadimplentes: [] })
    mocks.seletor.mockImplementation(() => React.createElement("div", { "data-seletor": true }))
    mocks.acoes.mockImplementation(() =>
      React.createElement("button", { type: "button" }, "Editar aluno"),
    )
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it("soma check-ins com e sem agendamento, sem subtrair bloqueio anterior", async () => {
    mocks.monitoramento.mockResolvedValue({
      lista: [
        linha("Presente com agendamento", { status: "PRESENTE", temComparecimento: true }),
        linha("Presente sem agendamento", { status: "PRESENTE" }),
      ],
      tentativasInadimplentes: [tentativa],
    })

    const html = await renderizar()

    expect(totalPresentes(html)).toBe("2")
    expect(html.match(/Alunos presentes/g)).toHaveLength(1)
    expect(html).not.toContain("Check-in + agendamento")
    expect(html.match(/Presença confirmada\./g)).toHaveLength(2)
  })

  it("não conta pendentes, invalidados, excluídos ou somente agendados como presentes", async () => {
    mocks.monitoramento.mockResolvedValue({
      lista: [
        linha("Presente", { status: "PRESENTE" }),
        linha("Pendente", { status: "PENDENTE_REVISAO" }),
        linha("Invalidado", { status: "INVALIDADO" }),
        linha("Excluído", { status: "EXCLUIDO" }),
        linha("Agendado", { status: "COMPARECEU", temComparecimento: true }),
      ],
      tentativasInadimplentes: [],
    })

    expect(totalPresentes(await renderizar())).toBe("1")
  })

  it("mantém o acesso rápido em hoje, com consulta mínima e sem observações ou edição", async () => {
    mocks.chamadaRapida.mockResolvedValue({
      lista: [
        linha("Aluno da chamada", {
          status: "PRESENTE",
          observacoesTecnicas: "Observação técnica restrita",
          historicoObservacoesTecnicas: [
            {
              id: "historico",
              observacao: "Histórico restrito",
              autor: "Equipe",
              registradaEm: "hoje",
            },
          ],
        }),
      ],
      tentativasInadimplentes: [],
    })

    const html = await renderizar({
      acessoRapido: true,
      podeEditar: true,
      searchParams: Promise.resolve({ data: "2025-01-01", aulaId: "aula-fora-de-hoje" }),
    })

    expect(mocks.aulas).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          inicio: {
            gte: new Date("2026-11-04T00:00:00-03:00"),
            lt: new Date("2026-11-05T00:00:00-03:00"),
          },
        }),
      }),
    )
    expect(mocks.chamadaRapida).toHaveBeenCalledExactlyOnceWith("aula-hoje")
    expect(mocks.monitoramento).not.toHaveBeenCalled()
    expect(mocks.seletor).toHaveBeenCalledWith(
      expect.objectContaining({ somenteHoje: true, dataSelecionada: "2026-11-04" }),
      undefined,
    )
    expect(totalPresentes(html)).toBe("1")
    expect(html).toContain("Aluno da chamada")
    expect(html).not.toContain("Observação técnica restrita")
    expect(html).not.toContain("Histórico restrito")
    expect(html).not.toContain("Inadimplência")
    expect(html).not.toContain("Bloqueios por inadimplência")
    expect(html).not.toContain("Consultar QR Code")
    expect(mocks.acoes).not.toHaveBeenCalled()
  })
})

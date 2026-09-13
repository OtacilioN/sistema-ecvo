import type { ReactElement } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  mensalidades: vi.fn(),
  registros: vi.fn(),
  exclusoes: vi.fn(),
}))
vi.mock("@/lib/auth/dal", () => ({ exigirGestao: async () => ({ papel: "GESTOR" }) }))
vi.mock("@/lib/db", () => ({
  db: {
    mensalidade: { findMany: mocks.mensalidades },
    registroImportado: { findMany: mocks.registros },
    exclusaoRepasseExternoMensal: { findMany: mocks.exclusoes },
  },
}))
vi.mock("@/lib/services/custos-fixos.service", () => ({
  obterCustosFixosMensais: async () => ({ total: 0, itens: [], competencia: "2026-08" }),
}))
vi.mock("./form-custos-fixos", () => ({ FormCustosFixos: () => null }))

import Page from "./page"

function textoPagina(valor: unknown): string {
  if (typeof valor === "string") return valor
  if (Array.isArray(valor)) return valor.map(textoPagina).join(" ")
  if (valor && typeof valor === "object" && "props" in valor) {
    return textoPagina((valor as { props: { children?: unknown } }).props.children)
  }
  return ""
}

function resumo(pagina: ReactElement, rotulo: string): string {
  const visitar = (valor: unknown): string | undefined => {
    if (Array.isArray(valor)) {
      for (const item of valor) {
        const encontrado = visitar(item)
        if (encontrado !== undefined) return encontrado
      }
    }
    if (valor && typeof valor === "object" && "props" in valor) {
      const props = (valor as { props: Record<string, unknown> }).props
      if (props.rotulo === rotulo) return String(props.valor)
      return visitar(props.children)
    }
  }
  return visitar(pagina) ?? "Resumo não encontrado"
}

const modalidade = (id: string, teto: number) => ({
  id,
  nome: id,
  valorRepasseProfessor: teto,
  turmas: [{ professorId: `prof-${id}`, professor: { usuario: { nome: `Professor ${id}` } } }],
})

function registro(
  valor: number,
  conta: string,
  modalidades = [modalidade("kickboxing", 60), modalidade("muay-thai", 50)],
) {
  return {
    id: conta,
    alunoId: "aluno-a",
    nome: "Aluno A",
    email: null,
    valorRepasse: valor,
    dataReferencia: null,
    checkinVinculado: null,
    statusConciliacao: "CONCILIADO",
    importacao: { plataforma: "WELLHUB", resumoMensal: true, competencia: "2026-08" },
    aluno: { tipo: "WELLHUB", usuario: { nome: "Aluno A" }, modalidadesPlano: [], modalidades },
  }
}

beforeEach(() => {
  mocks.mensalidades.mockResolvedValue([])
  mocks.registros.mockReset()
  mocks.exclusoes.mockResolvedValue([])
})

describe("repasses de resumos mensais Wellhub", () => {
  const exclusao = {
    competencia: "2026-08",
    plataforma: "WELLHUB",
    alunoId: "aluno-a",
    modalidadeId: "muay-thai",
    professorId: "prof-muay-thai",
  }

  it("corrige o mês após consolidar contas, mantém mensalidade interna e retira a receita do filtro de Oyama", async () => {
    mocks.registros.mockResolvedValue([
      registro(54, "conta-a"),
      registro(21, "conta-b"),
      { ...registro(67.5, "conta-c"), alunoId: "aluno-b" },
      { ...registro(126, "conta-d"), alunoId: "aluno-b" },
    ])
    mocks.exclusoes.mockResolvedValue([exclusao, { ...exclusao, alunoId: "aluno-b" }])
    mocks.mensalidades.mockResolvedValue([
      {
        id: "mensalidade-interna",
        competencia: "2026-08",
        valor: 90,
        status: "PAGA",
        pagoEm: new Date("2026-08-11T12:00:00Z"),
        formaPagamento: "Pix",
        aluno: { usuario: { nome: "Aluno mensalidade" }, modalidadesPlano: [] },
        repasseSnapshot: [
          {
            modalidadeId: "muay-thai",
            modalidadeNome: "muay-thai",
            professorId: "prof-muay-thai",
            professorNome: "Professor muay-thai",
            plataformaExterna: null,
            valorBase: 100,
          },
        ],
      },
    ])
    const pagina = await Page({ searchParams: Promise.resolve({ competencia: "2026-08" }) })
    expect(mocks.exclusoes).toHaveBeenCalledWith({ where: { competencia: "2026-08" } })
    expect(resumo(pagina, "Recebido")).toMatch(/358,50/)
    expect(resumo(pagina, "Receita de mensalistas")).toMatch(/90,00/)
    expect(resumo(pagina, "Receita de plataformas")).toMatch(/268,50/)
    expect(resumo(pagina, "Plataformas: repasse aos professores")).toMatch(/105,00/)
    expect(resumo(pagina, "Plataformas: sobra após professores")).toMatch(/163,50/)
    expect(resumo(pagina, "Direito identificado dos professores")).toMatch(/165,00/)
    expect(resumo(pagina, "Sobra após professores")).toMatch(/193,50/)
    expect(textoPagina(pagina)).toContain("Ajuste desta competência: muay-thai fora do repasse")
    const filtrada = await Page({
      searchParams: Promise.resolve({ competencia: "2026-08", professorId: "prof-muay-thai" }),
    })
    expect(textoPagina(filtrada)).toContain("Aluno mensalidade")
    expect(textoPagina(filtrada)).not.toContain("Aluno A")
    expect(resumo(filtrada, "Direito identificado dos professores")).toMatch(/165,00/)
    for (const rotulo of [
      "Receita de mensalistas",
      "Receita de plataformas",
      "Plataformas: repasse aos professores",
      "Plataformas: sobra após professores",
    ]) {
      expect(resumo(filtrada, rotulo)).toBe(resumo(pagina, rotulo))
    }
  })

  it("mantém o cálculo normal de setembro mesmo se receber uma exclusão de agosto", async () => {
    const base = registro(75, "setembro")
    mocks.registros.mockResolvedValue([
      { ...base, importacao: { ...base.importacao, competencia: "2026-09" } },
    ])
    mocks.exclusoes.mockResolvedValue([exclusao])
    const pagina = await Page({ searchParams: Promise.resolve({ competencia: "2026-09" }) })
    expect(mocks.exclusoes).toHaveBeenCalledWith({ where: { competencia: "2026-09" } })
    expect(resumo(pagina, "Direito identificado dos professores")).toMatch(/45,00/)
    expect(textoPagina(pagina)).toContain("Professor muay-thai")
    expect(textoPagina(pagina)).not.toContain("Ajuste desta competência")
  })

  it("mantém a receita no caixa sem criar pendência quando todas as modalidades foram excluídas", async () => {
    mocks.registros.mockResolvedValue([registro(75, "conta-a", [modalidade("muay-thai", 50)])])
    mocks.exclusoes.mockResolvedValue([exclusao])
    const pagina = await Page({ searchParams: Promise.resolve({ competencia: "2026-08" }) })
    expect(resumo(pagina, "Recebido")).toMatch(/75,00/)
    expect(resumo(pagina, "Direito identificado dos professores")).toMatch(/\s0,00$/)
    expect(resumo(pagina, "Sobra após professores")).toMatch(/75,00/)
    expect(resumo(pagina, "Pendências sem professor definido")).toMatch(/\s0,00$/)
  })

  it("consulta a competência informada e soma contas com cadastro legado, sem check-in individual", async () => {
    mocks.registros.mockResolvedValue([registro(120, "conta-a"), registro(80, "conta-b")])
    const pagina = await Page({ searchParams: Promise.resolve({ competencia: "2026-08" }) })
    expect(mocks.registros).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: expect.arrayContaining([
            {
              importacao: {
                resumoMensal: true,
                competencia: "2026-08",
                plataforma: { in: ["WELLHUB", "TOTALPASS"] },
              },
              statusConciliacao: { in: ["CONCILIADO", "ALUNO_NAO_IDENTIFICADO", "PENDENTE"] },
            },
            expect.objectContaining({
              importacao: { resumoMensal: false },
              statusConciliacao: "CONCILIADO",
            }),
          ]),
        }),
      }),
    )
    expect(mocks.registros.mock.calls[0][0].where).not.toHaveProperty("statusConciliacao")
    expect(resumo(pagina, "Recebido")).toMatch(/200,00/)
    expect(resumo(pagina, "Direito identificado dos professores")).toMatch(/110,00/)
    expect(resumo(pagina, "A repassar manualmente")).toMatch(/110,00/)
    expect(resumo(pagina, "Sobra após professores")).toMatch(/90,00/)
  })

  it("inclui receita sem modalidade no recebido, reserva integralmente e impede distribuir a sobra", async () => {
    mocks.registros.mockResolvedValue([registro(200, "conta-a", [])])
    const pagina = await Page({ searchParams: Promise.resolve({ competencia: "2026-08" }) })
    expect(resumo(pagina, "Recebido")).toMatch(/200,00/)
    expect(resumo(pagina, "Direito identificado dos professores")).toMatch(/\s0,00$/)
    expect(resumo(pagina, "A repassar manualmente")).toMatch(/\s0,00$/)
    expect(resumo(pagina, "Pendências sem professor definido")).toMatch(/200,00/)
    expect(resumo(pagina, "Sobra após professores")).toMatch(/\s0,00$/)
    expect(textoPagina(pagina)).toContain("Receita integralmente reservada")
  })

  it("inclui e reserva receita de aluno não identificado sem aumentar o repasse ou sobra dos conhecidos", async () => {
    mocks.registros.mockResolvedValue([
      registro(200, "conta-a"),
      {
        ...registro(81, "conta-b"),
        aluno: null,
        alunoId: null,
        nome: "Aluno desconhecido",
        statusConciliacao: "ALUNO_NAO_IDENTIFICADO",
      },
    ])
    const pagina = await Page({ searchParams: Promise.resolve({ competencia: "2026-08" }) })
    expect(resumo(pagina, "Recebido")).toMatch(/281,00/)
    expect(resumo(pagina, "Receita de mensalistas")).toMatch(/\s0,00$/)
    expect(resumo(pagina, "Receita de plataformas")).toMatch(/281,00/)
    expect(resumo(pagina, "Plataformas: repasse aos professores")).toMatch(/110,00/)
    expect(resumo(pagina, "Plataformas: sobra após professores")).toMatch(/90,00/)
    expect(resumo(pagina, "Direito identificado dos professores")).toMatch(/110,00/)
    expect(resumo(pagina, "A repassar manualmente")).toMatch(/110,00/)
    expect(resumo(pagina, "Pendências sem professor definido")).toMatch(/81,00/)
    expect(resumo(pagina, "Sobra após professores")).toMatch(/90,00/)
    expect(textoPagina(pagina)).toContain("Aluno desconhecido")
  })

  it("reserva registro ainda pendente mesmo quando já existe aluno associado", async () => {
    mocks.registros.mockResolvedValue([
      { ...registro(81, "conta-a"), statusConciliacao: "PENDENTE" },
    ])
    const pagina = await Page({ searchParams: Promise.resolve({ competencia: "2026-08" }) })
    expect(resumo(pagina, "Recebido")).toMatch(/81,00/)
    expect(resumo(pagina, "Direito identificado dos professores")).toMatch(/\s0,00$/)
    expect(resumo(pagina, "A repassar manualmente")).toMatch(/\s0,00$/)
    expect(resumo(pagina, "Pendências sem professor definido")).toMatch(/81,00/)
    expect(resumo(pagina, "Sobra após professores")).toMatch(/\s0,00$/)
  })
})

function registroTotalpass(valor: number, id: string, modalidades = [modalidade("boxe", 60)]) {
  const base = registro(valor, id, modalidades)
  return {
    ...base,
    importacao: { ...base.importacao, plataforma: "TOTALPASS" },
    aluno: { ...base.aluno, tipo: "TOTALPASS" },
  }
}

describe("repasses de resumos mensais TotalPass", () => {
  it("inclui os seis valores líquidos do CSV de agosto sem exigir check-in individual", async () => {
    mocks.registros.mockResolvedValue(
      [30.39, 30.39, 70.91, 20.26, 60.78, 10.13].map((valor, index) => ({
        ...registroTotalpass(valor, `registro-${index}`),
        alunoId: `aluno-${index}`,
      })),
    )
    const pagina = await Page({ searchParams: Promise.resolve({ competencia: "2026-08" }) })
    expect(resumo(pagina, "Recebido")).toMatch(/222,86/)
    expect(resumo(pagina, "Receita de plataformas")).toMatch(/222,86/)
    expect(resumo(pagina, "Plataformas: repasse aos professores")).toMatch(/133,72/)
    expect(resumo(pagina, "Plataformas: sobra após professores")).toMatch(/89,14/)
    expect(resumo(pagina, "Direito identificado dos professores")).toMatch(/133,72/)
    expect(resumo(pagina, "A repassar manualmente")).toMatch(/133,72/)
    expect(resumo(pagina, "Sobra após professores")).toMatch(/89,14/)
  })

  it("separa plataformas do mesmo aluno e competência e respeita cobertura explícita", async () => {
    const aluno = {
      tipo: "TOTALPASS",
      usuario: { nome: "Aluno A" },
      modalidades: [modalidade("jiu-jitsu", 90)],
      modalidadesPlano: [
        { plataformaExterna: "TOTALPASS", modalidade: modalidade("boxe", 50) },
        { plataformaExterna: "WELLHUB", modalidade: modalidade("kickboxing", 60) },
        { plataformaExterna: null, modalidade: modalidade("muay-thai", 70) },
      ],
    }
    mocks.registros.mockResolvedValue([
      { ...registro(200, "conta-wh"), aluno },
      { ...registroTotalpass(200, "conta-tp"), aluno },
    ])
    const pagina = await Page({ searchParams: Promise.resolve({ competencia: "2026-08" }) })
    expect(resumo(pagina, "Recebido")).toMatch(/400,00/)
    expect(resumo(pagina, "Direito identificado dos professores")).toMatch(/110,00/)
    expect(resumo(pagina, "Sobra após professores")).toMatch(/290,00/)
    expect(textoPagina(pagina)).toContain("TOTALPASS")
    expect(textoPagina(pagina)).toContain("WELLHUB")
  })

  it.each([
    "sem aluno",
    "sem cobertura",
    "conciliação pendente",
  ])("reserva receita TotalPass %s integralmente", async (situacao) => {
    const base = registroTotalpass(70.91, "tp")
    const pendente =
      situacao === "sem aluno"
        ? { ...base, alunoId: null, aluno: null, statusConciliacao: "ALUNO_NAO_IDENTIFICADO" }
        : situacao === "sem cobertura"
          ? {
              ...base,
              aluno: {
                ...base.aluno,
                modalidadesPlano: [
                  { plataformaExterna: "WELLHUB", modalidade: modalidade("boxe", 60) },
                ],
              },
            }
          : { ...base, statusConciliacao: "PENDENTE" }
    mocks.registros.mockResolvedValue([pendente])
    const pagina = await Page({ searchParams: Promise.resolve({ competencia: "2026-08" }) })
    expect(resumo(pagina, "Recebido")).toMatch(/70,91/)
    expect(resumo(pagina, "A repassar manualmente")).toMatch(/\s0,00$/)
    expect(resumo(pagina, "Direito identificado dos professores")).toMatch(/\s0,00$/)
    expect(resumo(pagina, "Pendências sem professor definido")).toMatch(/70,91/)
    expect(resumo(pagina, "Sobra após professores")).toMatch(/\s0,00$/)
  })

  it("preserva 60% por registro diário legado TotalPass sem aplicar o teto mensal", async () => {
    const base = registroTotalpass(200, "tp-diario")
    mocks.registros.mockResolvedValue([
      {
        ...base,
        importacao: { ...base.importacao, resumoMensal: false },
        dataReferencia: new Date("2026-08-10T12:00:00Z"),
        checkinVinculado: {
          aula: {
            professorId: "prof-boxe",
            professor: { usuario: { nome: "Professor boxe" } },
            turma: {
              professorId: "prof-boxe",
              professor: null,
              modalidade: modalidade("boxe", 60),
            },
          },
        },
      },
    ])
    const pagina = await Page({ searchParams: Promise.resolve({ competencia: "2026-08" }) })
    expect(resumo(pagina, "Recebido")).toMatch(/200,00/)
    expect(resumo(pagina, "Direito identificado dos professores")).toMatch(/120,00/)
    expect(resumo(pagina, "Receita de plataformas")).toMatch(/200,00/)
    expect(resumo(pagina, "Plataformas: repasse aos professores")).toMatch(/120,00/)
    expect(resumo(pagina, "Plataformas: sobra após professores")).toMatch(/80,00/)
    expect(resumo(pagina, "Sobra após professores")).toMatch(/80,00/)
  })
})

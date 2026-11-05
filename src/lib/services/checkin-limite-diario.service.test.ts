import type { OrigemCheckin, StatusCheckin } from "@prisma/client"
import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  db: {
    configuracaoAcademia: { findUnique: vi.fn() },
    aluno: { findUnique: vi.fn() },
    aula: { findUnique: vi.fn() },
    checkin: { findUnique: vi.fn(), findFirst: vi.fn() },
    comparecimento: { findUnique: vi.fn() },
    acessoAulaAvulsa: { findFirst: vi.fn() },
    mensalidade: { findFirst: vi.fn() },
    $transaction: vi.fn(),
  },
  tx: {
    $queryRaw: vi.fn(),
    aula: { findUnique: vi.fn() },
    checkin: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    comparecimento: { findUnique: vi.fn(), findMany: vi.fn(), update: vi.fn() },
  },
  creditar: vi.fn(),
  auditoria: vi.fn(),
  ofensivas: vi.fn(),
  tokenValido: vi.fn(),
  coordenadasValidas: vi.fn(),
  proximoDaAcademia: vi.fn(),
}))

vi.mock("@/lib/db", () => ({ db: mocks.db }))
vi.mock("@/lib/services/horas.service", () => ({
  creditarPorCheckin: mocks.creditar,
  estornarCheckin: vi.fn(),
}))
vi.mock("@/lib/services/auditoria.service", () => ({ registrarLog: mocks.auditoria }))
vi.mock("@/lib/services/ofensiva.service", () => ({
  sincronizarOfensivasDaModalidade: mocks.ofensivas,
}))
vi.mock("@/lib/services/notificacao.service", () => ({ criarNotificacao: vi.fn() }))
vi.mock("@/lib/services/checkin-token.service", () => ({ tokenCheckinValido: mocks.tokenValido }))
vi.mock("@/lib/geolocalizacao", () => ({
  coordenadasGeograficasValidas: mocks.coordenadasValidas,
  estaProximoDaAcademia: mocks.proximoDaAcademia,
}))
vi.mock("@/lib/services/termo-responsabilidade.service", () => ({
  termoResponsabilidadeAtualAceito: async () => true,
  MENSAGEM_TERMO_RESPONSABILIDADE_PENDENTE: "Aceite o termo.",
}))

import {
  realizarCheckin,
  realizarCheckinGeolocalizacao,
  realizarCheckinQr,
} from "./checkin.service"

const MODALIDADE = "boxe-kickboxing"

function aula(id: string, dataHora: string, modalidadeId = MODALIDADE) {
  const inicio = new Date(dataHora)
  return {
    id,
    inicio,
    fim: new Date(inicio.getTime() + 60 * 60_000),
    duracaoMin: 60,
    cancelada: false,
    professor: null,
    turma: {
      capacidade: 0,
      nome: id,
      modalidadeId,
      professor: null,
      modalidade: {
        nome: modalidadeId === MODALIDADE ? "Boxe e Kickboxing" : "Jiu-jitsu",
        checkinSemRestricaoHorario: false,
      },
    },
    comparecimentos: [],
    checkins: [],
  }
}

type Aula = ReturnType<typeof aula>
type Registro = { id: string; alunoId: string; aulaId: string; status: StatusCheckin; aula: Aula }

const aulas = new Map<string, Aula>()
let registros: Registro[] = []

// Avalia o filtro de leitura sobre fixtures para testar sua semântica de data, modalidade e status.
function corresponde(valor: unknown, filtro: unknown): boolean {
  if (filtro === undefined) return true
  if (!filtro || typeof filtro !== "object" || filtro instanceof Date) return valor === filtro
  const condicoes = filtro as Record<string, unknown>
  return Object.entries(condicoes).every(([chave, esperado]) => {
    if (chave === "in") return Array.isArray(esperado) && esperado.includes(valor)
    if (chave === "not") return !corresponde(valor, esperado)
    if (chave === "gte") return Number(valor) >= Number(esperado)
    if (chave === "lt") return Number(valor) < Number(esperado)
    if (chave === "is") return corresponde(valor, esperado)
    if (chave === "AND") {
      return (Array.isArray(esperado) ? esperado : [esperado]).every((item) =>
        corresponde(valor, item),
      )
    }
    if (chave === "OR") {
      return Array.isArray(esperado) && esperado.some((item) => corresponde(valor, item))
    }
    return corresponde((valor as Record<string, unknown> | null)?.[chave], esperado)
  })
}

function registrar(aulaRegistrada: Aula, status: StatusCheckin = "VALIDO", alunoId = "aluno") {
  const registro = {
    id: `checkin-${registros.length + 1}`,
    alunoId,
    aulaId: aulaRegistrada.id,
    status,
    aula: aulaRegistrada,
  }
  registros.push(registro)
  return registro
}

function tentar(aulaEscolhida: Aula, extra: Partial<Parameters<typeof realizarCheckin>[0]> = {}) {
  aulas.set(aulaEscolhida.id, aulaEscolhida)
  return realizarCheckin({
    alunoId: "aluno",
    aulaId: aulaEscolhida.id,
    autorId: "usuario-aluno",
    agora: aulaEscolhida.inicio,
    ...extra,
  })
}

function esperarBloqueioSemEfeitos() {
  expect(mocks.tx.checkin.create).not.toHaveBeenCalled()
  expect(mocks.tx.checkin.update).not.toHaveBeenCalled()
  expect(mocks.creditar).not.toHaveBeenCalled()
  expect(mocks.auditoria).not.toHaveBeenCalled()
  expect(mocks.ofensivas).not.toHaveBeenCalled()
}

beforeEach(() => {
  vi.resetAllMocks()
  aulas.clear()
  registros = []
  mocks.db.configuracaoAcademia.findUnique.mockResolvedValue(null)
  mocks.tokenValido.mockResolvedValue(true)
  mocks.coordenadasValidas.mockReturnValue(true)
  mocks.proximoDaAcademia.mockReturnValue(true)
  mocks.db.aluno.findUnique.mockResolvedValue({
    status: "ATIVO",
    tipo: "MENSALISTA",
    planoId: "plano",
    usuario: { nome: "Aluno" },
    solicitacaoMatricula: null,
    modalidades: [{ id: MODALIDADE }, { id: "jiu-jitsu" }],
    modalidadesPlano: [MODALIDADE, "jiu-jitsu"].map((modalidadeId) => ({
      modalidadeId,
      plataformaExterna: false,
    })),
  })
  const buscarAula = ({ where }: { where: { id: string } }) => aulas.get(where.id) ?? null
  const buscarRegistro = ({
    where,
  }: {
    where: { alunoId_aulaId: { alunoId: string; aulaId: string } }
  }) => registros.find((registro) => corresponde(registro, where.alunoId_aulaId)) ?? null
  const buscarLimite = ({ where }: { where: unknown }) =>
    registros.find((registro) => corresponde(registro, where)) ?? null
  mocks.db.aula.findUnique.mockImplementation(buscarAula)
  mocks.tx.aula.findUnique.mockImplementation(buscarAula)
  mocks.db.checkin.findUnique.mockImplementation(buscarRegistro)
  mocks.tx.checkin.findUnique.mockImplementation(buscarRegistro)
  mocks.db.checkin.findFirst.mockImplementation(buscarLimite)
  mocks.tx.checkin.findFirst.mockImplementation(buscarLimite)
  mocks.db.comparecimento.findUnique.mockResolvedValue(null)
  mocks.db.acessoAulaAvulsa.findFirst.mockResolvedValue(null)
  mocks.db.mensalidade.findFirst.mockResolvedValue(null)
  mocks.tx.comparecimento.findUnique.mockResolvedValue(null)
  mocks.tx.comparecimento.findMany.mockResolvedValue([])
  mocks.tx.checkin.findMany.mockResolvedValue([])
  mocks.tx.$queryRaw.mockResolvedValue([])
  mocks.tx.checkin.create.mockImplementation(({ data }) => {
    const aulaAtual = aulas.get(data.aulaId)
    if (!aulaAtual) throw new Error("Fixture da aula não encontrada")
    return registrar(aulaAtual, data.status, data.alunoId)
  })
  mocks.tx.checkin.update.mockImplementation(({ where, data }) => {
    const registro = registros.find((item) => item.id === where.id)
    if (!registro) throw new Error("Fixture do check-in não encontrada")
    Object.assign(registro, data)
    return registro
  })
  mocks.db.$transaction.mockImplementation(async (executar) => executar(mocks.tx))
})

describe("limite de uma aula por modalidade no dia da academia", () => {
  it.each([
    ["kickboxing-17", "2026-11-04T17:00:00-03:00"],
    ["boxe-19", "2026-11-04T19:00:00-03:00"],
  ])("kickboxing às 8h bloqueia %s no mesmo dia", async (id, horario) => {
    registrar(aula("kickboxing-8", "2026-11-04T08:00:00-03:00"))
    const resultado = await tentar(aula(id, horario))
    expect(resultado).toMatchObject({ ok: false, codigo: "LIMITE_DIARIO_MODALIDADE" })
    esperarBloqueioSemEfeitos()
  })

  it("boxe às 19h bloqueia kickboxing às 20h na modalidade compartilhada", async () => {
    registrar(aula("boxe-19", "2026-11-04T19:00:00-03:00"))
    expect(await tentar(aula("kickboxing-20", "2026-11-04T20:00:00-03:00"))).toMatchObject({
      ok: false,
      codigo: "LIMITE_DIARIO_MODALIDADE",
    })
    esperarBloqueioSemEfeitos()
  })

  it("permite kickboxing segunda, boxe quarta e kickboxing sexta", async () => {
    for (const item of [
      aula("kickboxing-segunda-8", "2026-11-02T08:00:00-03:00"),
      aula("boxe-quarta-19", "2026-11-04T19:00:00-03:00"),
      aula("kickboxing-sexta-20", "2026-11-06T20:00:00-03:00"),
    ]) {
      expect(await tentar(item)).toMatchObject({ ok: true, aulaId: item.id })
    }
    expect(mocks.creditar).toHaveBeenCalledTimes(3)
  })

  it("permite outra modalidade no mesmo dia", async () => {
    registrar(aula("kickboxing-8", "2026-11-04T08:00:00-03:00"))
    expect(
      await tentar(aula("jiu-jitsu-19", "2026-11-04T19:00:00-03:00", "jiu-jitsu")),
    ).toMatchObject({ ok: true })
  })

  it("não usa o check-in de outro aluno para bloquear", async () => {
    registrar(aula("kickboxing-8", "2026-11-04T08:00:00-03:00"), "VALIDO", "outro-aluno")
    expect(await tentar(aula("boxe-19", "2026-11-04T19:00:00-03:00"))).toMatchObject({
      ok: true,
    })
  })

  it.each([
    "VALIDO",
    "PENDENTE_REVISAO",
  ] as const)("registro %s em outra aula ocupa o limite diário", async (status) => {
    registrar(aula("kickboxing-8", "2026-11-04T08:00:00-03:00"), status)
    expect(await tentar(aula("boxe-19", "2026-11-04T19:00:00-03:00"))).toMatchObject({
      ok: false,
      codigo: "LIMITE_DIARIO_MODALIDADE",
    })
    esperarBloqueioSemEfeitos()
  })

  it.each([
    "INVALIDADO",
    "EXCLUIDO",
  ] as const)("registro %s não ocupa o limite diário", async (status) => {
    registrar(aula("kickboxing-8", "2026-11-04T08:00:00-03:00"), status)
    expect(await tentar(aula("boxe-19", "2026-11-04T19:00:00-03:00"))).toMatchObject({
      ok: true,
    })
  })

  it("mantém o erro de duplicidade da própria aula", async () => {
    const boxe = aula("boxe-19", "2026-11-04T19:00:00-03:00")
    registrar(boxe)
    expect(await tentar(boxe)).toMatchObject({
      ok: false,
      motivo: "Check-in já realizado nesta aula.",
    })
    esperarBloqueioSemEfeitos()
  })

  it("permite a equipe aprovar o pendente da própria aula sem tratá-lo como outra aula", async () => {
    const boxe = aula("boxe-19", "2026-11-04T19:00:00-03:00")
    registrar(boxe, "PENDENTE_REVISAO")
    expect(await tentar(boxe, { lancadoPorId: "gestor", autorId: "gestor" })).toMatchObject({
      ok: true,
      status: "VALIDO",
    })
    expect(mocks.tx.checkin.update).toHaveBeenCalledOnce()
    expect(mocks.creditar).toHaveBeenCalledOnce()
  })

  it.each([
    "QR_CODE",
    "GEOLOCALIZACAO",
    "BOTAO",
  ] as OrigemCheckin[])("aplica o limite à origem %s", async (origem) => {
    registrar(aula("kickboxing-8", "2026-11-04T08:00:00-03:00"))
    expect(await tentar(aula("boxe-19", "2026-11-04T19:00:00-03:00"), { origem })).toMatchObject({
      ok: false,
      codigo: "LIMITE_DIARIO_MODALIDADE",
    })
  })

  it("não permite que lançamento da equipe contorne o limite", async () => {
    registrar(aula("kickboxing-8", "2026-11-04T08:00:00-03:00"))
    expect(
      await tentar(aula("boxe-19", "2026-11-04T19:00:00-03:00"), {
        lancadoPorId: "gestor",
        autorId: "gestor",
      }),
    ).toMatchObject({ ok: false, codigo: "LIMITE_DIARIO_MODALIDADE" })
    esperarBloqueioSemEfeitos()
  })

  it.each([
    "QR_CODE",
    "GEOLOCALIZACAO",
  ] as const)("o fluxo %s chega ao bloqueio central após validar acesso", async (origem) => {
    registrar(aula("kickboxing-8", "2026-11-04T08:00:00-03:00"))
    const boxe = aula("boxe-19", "2026-11-04T19:00:00-03:00")
    aulas.set(boxe.id, boxe)
    const params = {
      alunoId: "aluno",
      aulaId: boxe.id,
      autorId: "usuario-aluno",
      confirmouCheckinPlataforma: false,
      agora: new Date("2026-11-04T19:50:00-03:00"),
    }
    const resultado =
      origem === "QR_CODE"
        ? await realizarCheckinQr({ ...params, token: "token-de-teste" })
        : await realizarCheckinGeolocalizacao({ ...params, latitude: -7.2, longitude: -34.8 })
    expect(resultado).toMatchObject({ ok: false, codigo: "LIMITE_DIARIO_MODALIDADE" })
    expect(origem === "QR_CODE" ? mocks.tokenValido : mocks.proximoDaAcademia).toHaveBeenCalled()
    esperarBloqueioSemEfeitos()
  })

  it("preserva a rejeição de QR inválido antes de consultar o limite diário", async () => {
    mocks.tokenValido.mockResolvedValue(false)
    expect(
      await realizarCheckinQr({
        alunoId: "aluno",
        aulaId: "boxe-19",
        autorId: "usuario-aluno",
        token: "invalido",
        confirmouCheckinPlataforma: false,
      }),
    ).toMatchObject({ ok: false, codigo: "TOKEN_INVALIDO" })
    expect(mocks.db.checkin.findFirst).not.toHaveBeenCalled()
    esperarBloqueioSemEfeitos()
  })

  it("preserva a rejeição de localização fora da área antes de consultar o limite diário", async () => {
    mocks.proximoDaAcademia.mockReturnValue(false)
    expect(
      await realizarCheckinGeolocalizacao({
        alunoId: "aluno",
        aulaId: "boxe-19",
        autorId: "usuario-aluno",
        latitude: 0,
        longitude: 0,
        confirmouCheckinPlataforma: false,
      }),
    ).toMatchObject({ ok: false, codigo: "FORA_DA_AREA" })
    expect(mocks.db.checkin.findFirst).not.toHaveBeenCalled()
    esperarBloqueioSemEfeitos()
  })

  it("lançamento retroativo usa o dia da aula, mesmo quando feito em outro dia", async () => {
    registrar(aula("kickboxing-8", "2026-11-04T08:00:00-03:00"))
    expect(
      await tentar(aula("boxe-19", "2026-11-04T19:00:00-03:00"), {
        retroativo: true,
        lancadoPorId: "gestor",
        autorId: "gestor",
        agora: new Date("2026-11-06T10:00:00-03:00"),
      }),
    ).toMatchObject({ ok: false, codigo: "LIMITE_DIARIO_MODALIDADE" })
  })

  it("considera aulas de UTCs diferentes que pertencem ao mesmo dia civil da academia", async () => {
    registrar(aula("kickboxing-8", "2026-11-04T08:00:00-03:00"))
    expect(await tentar(aula("boxe-23", "2026-11-05T02:30:00Z"))).toMatchObject({
      ok: false,
      codigo: "LIMITE_DIARIO_MODALIDADE",
    })
  })

  it("libera novamente exatamente à meia-noite local do dia seguinte", async () => {
    registrar(aula("boxe-23", "2026-11-04T23:00:00-03:00"))
    expect(await tentar(aula("kickboxing-novo-dia", "2026-11-05T00:00:00-03:00"))).toMatchObject({
      ok: true,
    })
  })

  it("revalida sob lock e bloqueia um conflito que não existia na leitura inicial", async () => {
    registrar(aula("kickboxing-8", "2026-11-04T08:00:00-03:00"))
    mocks.db.checkin.findFirst.mockResolvedValue(null)
    expect(await tentar(aula("boxe-19", "2026-11-04T19:00:00-03:00"))).toMatchObject({
      ok: false,
      codigo: "LIMITE_DIARIO_MODALIDADE",
    })
    expect(mocks.tx.checkin.findFirst).toHaveBeenCalledOnce()
    const [sql, ...valores] = mocks.tx.$queryRaw.mock.calls[0]
    expect(sql.join("")).toContain('"Modalidade"')
    expect(sql.join("")).toContain("FOR UPDATE")
    expect(valores).toContain(MODALIDADE)
    expect(mocks.tx.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.tx.checkin.findFirst.mock.invocationCallOrder[0],
    )
    esperarBloqueioSemEfeitos()
  })

  it("duas tentativas concorrentes geram só um check-in após serialização transacional", async () => {
    // O mock simula a serialização; a consulta real sob FOR UPDATE é verificada no caso acima.
    let fila: Promise<unknown> = Promise.resolve()
    mocks.db.$transaction.mockImplementation((executar) => {
      const resultado = fila.then(() => executar(mocks.tx))
      fila = resultado.catch(() => undefined)
      return resultado
    })
    const resultados = await Promise.all([
      tentar(aula("boxe-19", "2026-11-04T19:00:00-03:00")),
      tentar(aula("kickboxing-20", "2026-11-04T20:00:00-03:00")),
    ])
    expect(resultados.filter((resultado) => resultado.ok)).toHaveLength(1)
    expect(resultados.find((resultado) => !resultado.ok)).toMatchObject({
      ok: false,
      codigo: "LIMITE_DIARIO_MODALIDADE",
    })
    expect(mocks.tx.checkin.create).toHaveBeenCalledOnce()
    expect(mocks.creditar).toHaveBeenCalledOnce()
    expect(mocks.auditoria).toHaveBeenCalledOnce()
  })
})

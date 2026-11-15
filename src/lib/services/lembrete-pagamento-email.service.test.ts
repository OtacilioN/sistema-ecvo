import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  findMany: vi.fn(),
  findFirst: vi.fn(),
  createMany: vi.fn(),
  findUniqueOrThrow: vi.fn(),
  updateMany: vi.fn(),
  update: vi.fn(),
  fetch: vi.fn(),
}))

vi.mock("@/lib/db", () => ({
  db: {
    mensalidade: { findMany: mocks.findMany, findFirst: mocks.findFirst },
    lembretePagamentoEmail: {
      createMany: mocks.createMany,
      findUniqueOrThrow: mocks.findUniqueOrThrow,
      updateMany: mocks.updateMany,
      update: mocks.update,
    },
  },
}))

import { enviarLembretesPagamentoEmail } from "./lembrete-pagamento-email.service"

const agora = new Date("2026-11-15T11:00:00Z")

function mensalidade(id = "mensalidade-1") {
  return {
    id,
    status: "EM_ABERTO",
    competencia: "2026-11",
    valor: "120.00",
    valorBase: "120.00" as string | null,
    valorComDesconto: "100.00" as string | null,
    vencimento: new Date("2026-11-20T15:00:00Z"),
    aluno: {
      usuario: { nome: "Aluno de Teste", email: "aluno@example.com" },
      responsavel: null as { responsavelFinanceiro: boolean; email: string | null } | null,
    },
  }
}

type Registro = {
  id: string
  mensalidadeId: string
  remetente: string
  destinatario: string
  assunto: string
  texto: string
  primeiraTentativaEm: Date
  enviadoEm: Date | null
  reservadoAte: Date | null
  resendId: string | null
  ultimoErro: string | null
  tentativas: number
}

let registros: Map<string, Registro>
let mensalidades: ReturnType<typeof mensalidade>[]

async function executar(data = agora) {
  const resultado = enviarLembretesPagamentoEmail({ agora: data })
  await vi.runAllTimersAsync()
  return resultado
}

function corpo(indice = 0) {
  return JSON.parse(mocks.fetch.mock.calls[indice][1].body) as {
    from: string
    to: string[]
    subject: string
    text: string
  }
}

beforeEach(() => {
  vi.resetAllMocks()
  vi.useFakeTimers()
  vi.setSystemTime(agora)
  vi.stubEnv("RESEND_API_KEY", "chave-simulada")
  vi.stubEnv("EMAIL_REMETENTE", "ECVO <contato@example.com>")
  vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://ecvo.example.com")
  vi.stubGlobal("fetch", mocks.fetch)
  registros = new Map()
  mensalidades = [mensalidade()]
  mocks.findMany.mockImplementation(async () => mensalidades)
  mocks.findFirst.mockImplementation(async ({ where }) =>
    mensalidades.find((item) => item.id === where.id),
  )
  mocks.createMany.mockImplementation(async ({ data }) => {
    const item = data[0]
    const existente = registros.get(item.id)
    if (existente) return { count: 0 }
    const novo = {
      ...item,
      enviadoEm: null,
      reservadoAte: null,
      resendId: null,
      ultimoErro: null,
      tentativas: 0,
    }
    registros.set(item.id, novo)
    return { count: 1 }
  })
  mocks.findUniqueOrThrow.mockImplementation(async ({ where }) => {
    const registro = [...registros.values()].find(
      (item) => item.mensalidadeId === where.mensalidadeId,
    )
    if (!registro) throw new Error("Registro inexistente")
    return { ...registro }
  })
  mocks.updateMany.mockImplementation(async ({ where, data }) => {
    const registro = registros.get(where.id)
    if (
      !registro ||
      registro.enviadoEm ||
      (registro.reservadoAte && registro.reservadoAte > where.OR[1].reservadoAte.lte)
    ) {
      return { count: 0 }
    }
    registro.reservadoAte = data.reservadoAte
    registro.tentativas++
    return { count: 1 }
  })
  mocks.update.mockImplementation(async ({ where, data }) => {
    const registro = registros.get(where.id)
    if (!registro) throw new Error("Registro inexistente")
    Object.assign(registro, data)
    return { ...registro }
  })
  mocks.fetch.mockResolvedValue({ ok: true, json: async () => ({ id: "resend-simulado" }) })
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe("lembrete de pagamento por e-mail", () => {
  it("informa o valor promocional do snapshot, o prazo e o valor após vencimento", async () => {
    expect(await executar()).toEqual({ ok: true, analisadas: 1, enviados: 1, falhas: 0 })

    expect(corpo()).toMatchObject({
      from: "ECVO <contato@example.com>",
      to: ["aluno@example.com"],
      subject: "Sua mensalidade vence em 5 dias — ECVO",
    })
    expect(corpo().text).toContain("novembro de 2026 de Aluno de Teste")
    expect(corpo().text).toContain("Valor: R$ 100,00")
    expect(corpo().text).toContain("Data limite para pagamento: 20/11/2026")
    expect(corpo().text).toContain(
      "Para manter o valor promocional de R$ 100,00, é necessário pagar até 20/11/2026.",
    )
    expect(corpo().text).toContain("Após essa data, o valor da mensalidade será R$ 120,00.")
    expect(corpo().text).toContain("https://ecvo.example.com/aluno/financeiro")
    expect([...registros.values()][0]).toMatchObject({
      resendId: "resend-simulado",
      enviadoEm: expect.any(Date),
      reservadoAte: null,
    })
  })

  it.each([
    ["2026-11-27T01:00:00Z", "2026-12-01T03:00:00Z", "2026-12-02T03:00:00Z"],
    ["2026-12-28T01:00:00Z", "2027-01-01T03:00:00Z", "2027-01-02T03:00:00Z"],
  ])("busca D+5 no calendário da academia na virada a partir de %s", async (data, inicio, fim) => {
    mensalidades = []
    await executar(new Date(data))

    const filtro = mocks.findMany.mock.calls[0][0].where
    expect(filtro.vencimento).toEqual({ gte: new Date(inicio), lt: new Date(fim) })
    expect(filtro.status).toBe("EM_ABERTO")
    expect(filtro.aluno).toEqual({
      status: { in: ["ATIVO", "INADIMPLENTE"] },
      usuario: { ativo: true },
    })
    expect(fetch).not.toHaveBeenCalled()
  })

  it.each([
    [null, null],
    ["100.00", "100.00"],
  ])("não promete promoção inexistente em mensalidade sem desconto (%s, %s)", async (base, desconto) => {
    mensalidades[0].valorBase = base
    mensalidades[0].valorComDesconto = desconto
    mensalidades[0].valor = "100.00"

    await executar()

    expect(corpo().text).not.toContain("promocional")
    expect(corpo().text).not.toContain("Após essa data")
    expect(corpo().text).toContain("Efetue o pagamento até 20/11/2026")
  })

  it("envia ao responsável financeiro e identifica o aluno", async () => {
    mensalidades[0].aluno.responsavel = {
      responsavelFinanceiro: true,
      email: " responsavel@example.com ",
    }
    await executar()
    expect(corpo().to).toEqual(["responsavel@example.com"])
    expect(corpo().text).toContain("Aluno de Teste")
  })

  it.each([
    { responsavelFinanceiro: false, email: "responsavel@example.com" },
    { responsavelFinanceiro: true, email: null },
  ])("usa o e-mail do aluno quando o responsável não é destinatário: %j", async (responsavel) => {
    mensalidades[0].aluno.responsavel = responsavel
    await executar()
    expect(corpo().to).toEqual(["aluno@example.com"])
  })

  it("não duplica o envio em reexecuções nem em execuções concorrentes", async () => {
    const primeira = enviarLembretesPagamentoEmail({ agora })
    const concorrente = enviarLembretesPagamentoEmail({ agora })
    await vi.runAllTimersAsync()
    const resultados = await Promise.all([primeira, concorrente])
    expect(resultados.reduce((soma, item) => soma + item.enviados, 0)).toBe(1)
    expect(resultados).toContainEqual({ ok: false, analisadas: 1, enviados: 0, falhas: 1 })
    expect(await executar()).toMatchObject({ enviados: 0, falhas: 0 })
    expect(fetch).toHaveBeenCalledOnce()
  })

  it.each([
    "pagamento",
    "trancamento",
    "inativação",
    "mudança de vencimento",
  ])("revalida elegibilidade antes do envio e ignora %s ocorrido após a seleção", async () => {
    mocks.findFirst.mockResolvedValue(null)
    expect(await executar()).toMatchObject({ enviados: 0, falhas: 0 })
    expect(fetch).not.toHaveBeenCalled()
    expect(mocks.findFirst.mock.calls[0][0].where).toMatchObject({
      id: "mensalidade-1",
      status: "EM_ABERTO",
      aluno: { usuario: { ativo: true }, status: { in: ["ATIVO", "INADIMPLENTE"] } },
    })
  })

  it("não envia um valor ou destinatário desatualizado após reservar o conteúdo", async () => {
    mocks.findFirst.mockImplementation(async () => ({
      ...mensalidades[0],
      valorComDesconto: "90.00",
    }))
    expect(await executar()).toMatchObject({ ok: false, enviados: 0, falhas: 1 })
    expect(fetch).not.toHaveBeenCalled()
  })

  it("repete falha de rede e 429 com o mesmo conteúdo e chave de idempotência", async () => {
    mocks.fetch
      .mockRejectedValueOnce(new Error("timeout com aceitação desconhecida"))
      .mockResolvedValueOnce({ ok: false, status: 429 })

    expect(await executar()).toMatchObject({ ok: true, enviados: 1, falhas: 0 })
    expect(fetch).toHaveBeenCalledTimes(3)
    const requisicoes = mocks.fetch.mock.calls.map(([, opcoes]) => ({
      corpo: opcoes.body,
      chave: opcoes.headers["Idempotency-Key"],
    }))
    expect(new Set(requisicoes.map((item) => JSON.stringify(item))).size).toBe(1)
    expect(requisicoes[0].chave).toMatch(/^lembrete-mensalidade\//)
  })

  it("preserva a chave após envio aceito seguido de falha de persistência", async () => {
    const atualizar = mocks.update.getMockImplementation()
    let falhou = false
    mocks.update.mockImplementation(async (argumentos) => {
      if (argumentos.data.enviadoEm && !falhou) {
        falhou = true
        throw new Error("falha após envio")
      }
      return atualizar?.(argumentos)
    })
    expect(await executar()).toMatchObject({ ok: false, enviados: 0, falhas: 1 })
    expect(await executar()).toMatchObject({ ok: true, enviados: 1, falhas: 0 })

    // O Resend recebe a mesma operação lógica e devolve o resultado original.
    expect(fetch).toHaveBeenCalledTimes(2)
    expect(mocks.fetch.mock.calls[1][1].body).toBe(mocks.fetch.mock.calls[0][1].body)
    expect(mocks.fetch.mock.calls[1][1].headers["Idempotency-Key"]).toBe(
      mocks.fetch.mock.calls[0][1].headers["Idempotency-Key"],
    )
    expect([...registros.values()][0].resendId).toBe("resend-simulado")
  })

  it("bloqueia repetição incerta fora da janela de idempotência", async () => {
    mocks.fetch.mockResolvedValue({ ok: false, status: 403 })
    await executar()
    const registro = [...registros.values()][0]
    registro.primeiraTentativaEm = new Date(agora.getTime() - 24 * 60 * 60 * 1000)
    mocks.fetch.mockClear()

    expect(await executar()).toMatchObject({ ok: false, enviados: 0, falhas: 1 })
    expect(fetch).not.toHaveBeenCalled()
  })

  it("não suprime outra mensalidade do mesmo responsável e isola uma falha permanente", async () => {
    mensalidades.push(mensalidade("mensalidade-2"))
    for (const item of mensalidades) {
      item.aluno.responsavel = { responsavelFinanceiro: true, email: "responsavel@example.com" }
    }
    mocks.fetch.mockResolvedValueOnce({ ok: false, status: 422 })

    const resultado = await executar()
    expect(resultado).toEqual({ ok: false, analisadas: 2, enviados: 1, falhas: 1 })
    expect(fetch).toHaveBeenCalledTimes(2)
    expect(corpo(0).to).toEqual(corpo(1).to)
    expect(mocks.fetch.mock.calls[0][1].headers["Idempotency-Key"]).not.toBe(
      mocks.fetch.mock.calls[1][1].headers["Idempotency-Key"],
    )
    expect(JSON.stringify(resultado)).not.toContain("responsavel@example.com")
    expect(JSON.stringify(resultado)).not.toContain("Aluno de Teste")
  })

  it("rejeita e-mail inválido do responsável sem enviar a outra pessoa", async () => {
    mensalidades[0].aluno.responsavel = {
      responsavelFinanceiro: true,
      email: "endereço-inválido",
    }
    expect(await executar()).toMatchObject({ ok: false, enviados: 0, falhas: 1 })
    expect(fetch).not.toHaveBeenCalled()
  })

  it("continua os demais envios se também falhar o registro de erro no banco", async () => {
    mensalidades.push(mensalidade("mensalidade-2"))
    mocks.fetch.mockResolvedValueOnce({ ok: false, status: 422 })
    mocks.update.mockRejectedValueOnce(new Error("banco indisponível ao registrar erro"))

    expect(await executar()).toEqual({ ok: false, analisadas: 2, enviados: 1, falhas: 1 })
    expect(fetch).toHaveBeenCalledTimes(2)
    const registrosPersistidos = [...registros.values()]
    expect(registrosPersistidos[0].reservadoAte).toBeInstanceOf(Date)
    expect(registrosPersistidos[1].resendId).toBe("resend-simulado")
  })

  it("retorna pendência sem reservar ou enviar quando falta orçamento para concluir", async () => {
    mensalidades.push(mensalidade("mensalidade-2"))
    const resultado = await enviarLembretesPagamentoEmail({
      agora,
      limiteExecucaoEm: Date.now() + 34_000,
    })

    expect(resultado).toEqual({ ok: false, analisadas: 2, enviados: 0, falhas: 2 })
    expect(mocks.createMany).not.toHaveBeenCalled()
    expect(fetch).not.toHaveBeenCalled()
  })

  it("não reserva nem envia sem configuração completa", async () => {
    vi.stubEnv("RESEND_API_KEY", "")
    await expect(enviarLembretesPagamentoEmail({ agora })).rejects.toThrow(
      "E-mail financeiro não configurado.",
    )
    expect(mocks.createMany).not.toHaveBeenCalled()
    expect(fetch).not.toHaveBeenCalled()
  })
})

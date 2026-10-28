import { beforeEach, describe, expect, it, vi } from "vitest"
import { enviarPushParaNotificacao } from "@/lib/services/push.service"
import { gerarAvisosDiariosAdimplencia } from "./adimplencia.service"

vi.mock("@/lib/services/push.service", () => ({
  enviarPushParaNotificacao: vi.fn(async () => ({ enviados: 1 })),
}))

type MensalidadeTeste = {
  id: string
  competencia: string
  status: string
  valor: number
  valorBase: number | null
  valorComDesconto: number | null
  vencimento: Date
  aluno: { usuarioId: string; status: string; usuario: { ativo: boolean } }
}

type NotificacaoTeste = {
  id: string
  usuarioId: string
  tipo: string
  titulo: string
  mensagem: string
  chaveDeduplicacao: string
}

function mensalidade(overrides: Partial<MensalidadeTeste> = {}): MensalidadeTeste {
  return {
    id: "mensalidade-1",
    competencia: "2026-10",
    status: "VENCIDA",
    valor: 100,
    valorBase: 120,
    valorComDesconto: 100,
    vencimento: new Date("2026-10-10T15:00:00Z"),
    aluno: { usuarioId: "aluno-1", status: "INADIMPLENTE", usuario: { ativo: true } },
    ...overrides,
  }
}

function prepararCliente(
  mensalidades: MensalidadeTeste[] = [mensalidade()],
  notificarFinanceiro = true,
) {
  const persistidas = new Map<string, NotificacaoTeste>()
  const cliente = {
    configuracaoAcademia: {
      findUnique: vi.fn(async () => ({ notificarFinanceiro })),
    },
    mensalidade: {
      findMany: vi.fn(
        async ({
          where,
        }: {
          where: {
            status: { in: string[] }
            vencimento: { lt: Date }
            valorBase: { not: null }
            valorComDesconto: { not: null }
            aluno: { status: { in: string[] }; usuario: { ativo: boolean } }
          }
        }) =>
          mensalidades.filter(
            (item) =>
              where.status.in.includes(item.status) &&
              item.vencimento < where.vencimento.lt &&
              item.valorBase !== where.valorBase.not &&
              item.valorComDesconto !== where.valorComDesconto.not &&
              where.aluno.status.in.includes(item.aluno.status) &&
              item.aluno.usuario.ativo === where.aluno.usuario.ativo,
          ),
      ),
    },
    notificacao: {
      create: vi.fn(async ({ data }: { data: Omit<NotificacaoTeste, "id"> }) => {
        if (persistidas.has(data.chaveDeduplicacao)) {
          throw Object.assign(new Error("Chave duplicada"), { code: "P2002" })
        }
        const notificacao = { id: `notificacao-${persistidas.size + 1}`, ...data }
        persistidas.set(data.chaveDeduplicacao, notificacao)
        return notificacao
      }),
    },
  }
  return {
    cliente,
    persistidas,
    executar: (data: string) =>
      gerarAvisosDiariosAdimplencia(
        cliente as unknown as Parameters<typeof gerarAvisosDiariosAdimplencia>[0],
        { agora: new Date(data) },
      ),
  }
}

beforeEach(() => {
  vi.mocked(enviarPushParaNotificacao).mockClear()
})

describe("gerarAvisosDiariosAdimplencia", () => {
  it("avisa a perda do desconto e envia push já no primeiro dia de atraso", async () => {
    const { executar, persistidas } = prepararCliente()

    expect(await executar("2026-10-11T12:00:00Z")).toEqual({ ok: true, total: 1 })

    const notificacao = [...persistidas.values()][0]
    expect(notificacao).toEqual(
      expect.objectContaining({
        usuarioId: "aluno-1",
        tipo: "FINANCEIRO",
        titulo: "Desconto de adimplência encerrado",
        chaveDeduplicacao: "adimplencia:mensalidade-1:aluno-1:2026-10-11",
      }),
    )
    expect(notificacao.mensagem).toContain("outubro de 2026")
    expect(notificacao.mensagem.replaceAll("\u00a0", " ")).toContain("pagar R$ 100,00")
    expect(notificacao.mensagem).toContain("venceu em 10/10/2026")
    expect(notificacao.mensagem.replaceAll("\u00a0", " ")).toContain(
      "o valor para pagamento agora é R$ 120,00",
    )
    expect(notificacao.mensagem).not.toContain("0 dias")
    expect(enviarPushParaNotificacao).toHaveBeenCalledWith(notificacao)
  })

  it("não avisa antes da meia-noite da academia e informa o encerramento no dia seguinte", async () => {
    const { executar, persistidas } = prepararCliente()

    expect(await executar("2026-10-11T02:59:59.999Z")).toEqual({ ok: true, total: 0 })
    expect(await executar("2026-10-11T03:00:00Z")).toEqual({ ok: true, total: 1 })

    const notificacoes = [...persistidas.values()]
    expect(notificacoes).toHaveLength(1)
    expect(notificacoes[0].titulo).toBe("Desconto de adimplência encerrado")
    expect(notificacoes[0].mensagem.replaceAll("\u00a0", " ")).toContain(
      "o valor para pagamento agora é R$ 120,00",
    )
    expect(enviarPushParaNotificacao).toHaveBeenCalledTimes(1)
  })

  it.each([
    "2026-10-10T15:00:00Z",
    "2026-10-11T02:59:59Z",
    "2026-10-12T03:00:00Z",
  ])("não envia no vencimento nem repete o encerramento após o primeiro dia de atraso (%s)", async (data) => {
    const { executar, persistidas } = prepararCliente()
    expect(await executar(data)).toEqual({ ok: true, total: 0 })
    expect(persistidas.size).toBe(0)
    expect(enviarPushParaNotificacao).not.toHaveBeenCalled()
  })

  it("deduplica execuções concorrentes e não repete o encerramento em outro dia", async () => {
    const { executar, persistidas } = prepararCliente()

    const resultados = await Promise.all([
      executar("2026-10-11T03:00:00Z"),
      executar("2026-10-11T03:00:00Z"),
      executar("2026-10-12T02:59:59Z"),
    ])
    expect(resultados.reduce((soma, resultado) => soma + resultado.total, 0)).toBe(1)
    expect(await executar("2026-10-12T03:00:00Z")).toEqual({ ok: true, total: 0 })
    expect(persistidas.size).toBe(1)
    expect(enviarPushParaNotificacao).toHaveBeenCalledTimes(1)
  })

  it("mantém avisos separados para mensalidades e destinatários diferentes", async () => {
    const { executar, persistidas } = prepararCliente([
      mensalidade(),
      mensalidade({ id: "mensalidade-2", competencia: "2026-09" }),
      mensalidade({
        id: "mensalidade-3",
        aluno: { usuarioId: "aluno-2", status: "ATIVO", usuario: { ativo: true } },
      }),
    ])

    expect(await executar("2026-10-11T12:00:00Z")).toEqual({ ok: true, total: 3 })
    expect(persistidas.size).toBe(3)
  })

  it("exclui mensalidades pagas, canceladas, isentas, sem desconto e alunos fora de operação", async () => {
    const { executar, persistidas } = prepararCliente([
      mensalidade({ id: "paga", status: "PAGA" }),
      mensalidade({ id: "cancelada", status: "CANCELADA" }),
      mensalidade({ id: "isenta", status: "ISENTA" }),
      mensalidade({ id: "legada", valorBase: null, valorComDesconto: null }),
      mensalidade({ id: "sem-desconto", valorBase: 100, valorComDesconto: 100 }),
      mensalidade({
        id: "aluno-inativo",
        aluno: { usuarioId: "inativo", status: "ATIVO", usuario: { ativo: false } },
      }),
      mensalidade({
        id: "aluno-cancelado",
        aluno: { usuarioId: "cancelado", status: "CANCELADO", usuario: { ativo: true } },
      }),
      mensalidade({
        id: "aluno-trancado",
        aluno: { usuarioId: "trancado", status: "TRANCADO", usuario: { ativo: true } },
      }),
    ])

    expect(await executar("2026-10-11T12:00:00Z")).toEqual({ ok: true, total: 0 })
    expect(persistidas.size).toBe(0)
    expect(enviarPushParaNotificacao).not.toHaveBeenCalled()
  })

  it("respeita a configuração desligada e não consulta mensalidades", async () => {
    const { executar, cliente } = prepararCliente([mensalidade()], false)

    expect(await executar("2026-10-11T12:00:00Z")).toEqual({ ok: true, total: 0 })
    expect(cliente.mensalidade.findMany).not.toHaveBeenCalled()
    expect(cliente.notificacao.create).not.toHaveBeenCalled()
    expect(enviarPushParaNotificacao).not.toHaveBeenCalled()
  })

  it("preserva a notificação interna quando a entrega push falha", async () => {
    const { executar, persistidas } = prepararCliente()
    vi.mocked(enviarPushParaNotificacao).mockRejectedValueOnce(new Error("Push indisponível"))

    expect(await executar("2026-10-11T12:00:00Z")).toEqual({ ok: true, total: 1 })
    expect(await executar("2026-10-11T12:30:00Z")).toEqual({ ok: true, total: 0 })
    expect(persistidas.size).toBe(1)
  })

  it("propaga falhas de persistência que não sejam duplicação", async () => {
    const { executar, cliente } = prepararCliente()
    cliente.notificacao.create.mockRejectedValueOnce(new Error("Banco indisponível"))

    await expect(executar("2026-10-11T12:00:00Z")).rejects.toThrow("Banco indisponível")
    expect(enviarPushParaNotificacao).not.toHaveBeenCalled()
  })
})

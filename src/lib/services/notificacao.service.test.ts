import { beforeEach, describe, expect, it, vi } from "vitest"
import { enviarPushParaNotificacao } from "@/lib/services/push.service"
import {
  campoConfiguracaoNotificacao,
  DIAS_RETENCAO_NOTIFICACOES_LIDAS,
  DIAS_RETENCAO_NOTIFICACOES_TODAS,
  expurgarNotificacoesAntigas,
  gerarLembretesAniversario,
  gerarLembretesTreino,
  mensagemLembreteAniversario,
} from "./notificacao.service"

vi.mock("@/lib/services/push.service", () => ({
  enviarPushParaNotificacao: vi.fn(async () => ({
    configurado: true,
    tentativas: 1,
    enviados: 1,
    removidos: 0,
    falhas: [],
  })),
}))

type NotificacaoData = {
  usuarioId: string
  tipo: string
  titulo: string
  mensagem: string
}

beforeEach(() => {
  vi.mocked(enviarPushParaNotificacao).mockClear()
})

describe("campoConfiguracaoNotificacao", () => {
  it("mapeia cada tipo de notificação para sua flag configurável", () => {
    expect(campoConfiguracaoNotificacao("COMPARECIMENTO")).toBe("notificarComparecimento")
    expect(campoConfiguracaoNotificacao("LEMBRETE_TREINO")).toBe("notificarLembreteTreino")
    expect(campoConfiguracaoNotificacao("CANCELAMENTO_AULA")).toBe("notificarCancelamentoAula")
    expect(campoConfiguracaoNotificacao("FINANCEIRO")).toBe("notificarFinanceiro")
    expect(campoConfiguracaoNotificacao("GRADUACAO")).toBe("notificarGraduacao")
    expect(campoConfiguracaoNotificacao("CHECKIN_INVALIDADO")).toBe("notificarCheckinInvalidado")
    expect(campoConfiguracaoNotificacao("ANIVERSARIO")).toBe("notificarAniversario")
  })
})

describe("mensagemLembreteAniversario", () => {
  it("gera mensagem de aniversário em pt-BR", () => {
    expect(
      mensagemLembreteAniversario({
        alunoNome: "Ana Silva",
        dataNascimento: new Date("2000-06-10T12:00:00Z"),
      }),
    ).toEqual({
      titulo: "Aniversário amanhã",
      mensagem: "Ana Silva faz aniversário amanhã (10/06).",
    })
  })
})

describe("expurgarNotificacoesAntigas", () => {
  it("remove lidas após 45 dias e qualquer notificação após 90 dias", async () => {
    const cliente = {
      notificacao: {
        deleteMany: vi.fn(async () => ({ count: 4 })),
      },
    }
    const agora = new Date("2026-06-17T12:00:00Z")

    const resultado = await expurgarNotificacoesAntigas(
      cliente as unknown as Parameters<typeof expurgarNotificacoesAntigas>[0],
      { agora },
    )

    const lidasAntesDe = new Date(
      agora.getTime() - DIAS_RETENCAO_NOTIFICACOES_LIDAS * 24 * 60 * 60 * 1000,
    )
    const todasAntesDe = new Date(
      agora.getTime() - DIAS_RETENCAO_NOTIFICACOES_TODAS * 24 * 60 * 60 * 1000,
    )

    expect(resultado).toEqual({
      ok: true,
      notificacoesExpurgadas: 4,
      lidasAntesDe,
      todasAntesDe,
    })
    expect(cliente.notificacao.deleteMany).toHaveBeenCalledWith({
      where: {
        OR: [{ criadoEm: { lt: todasAntesDe } }, { lida: true, criadoEm: { lt: lidasAntesDe } }],
      },
    })
  })
})

describe("gerarLembretesTreino", () => {
  it("cria o lembrete pelo fluxo que tenta enviar push", async () => {
    const cliente = {
      configuracaoAcademia: {
        findUnique: vi.fn(async () => ({ notificarLembreteTreino: true })),
      },
      comparecimento: {
        findMany: vi.fn(async () => [
          {
            alunoId: "aluno-1",
            aluno: { usuarioId: "usuario-aluno" },
            aula: {
              inicio: new Date("2026-06-17T18:00:00-03:00"),
              turma: { nome: "Kickboxing", modalidade: { nome: "Kickboxing" } },
              checkins: [],
            },
          },
        ]),
      },
      notificacao: {
        findFirst: vi.fn(async () => null),
        create: vi.fn(async ({ data }: { data: NotificacaoData }) => ({
          id: "notificacao-treino",
          lida: false,
          criadoEm: new Date("2026-06-17T16:00:00-03:00"),
          ...data,
        })),
      },
    }

    const resultado = await gerarLembretesTreino(
      cliente as unknown as Parameters<typeof gerarLembretesTreino>[0],
      {
        agora: new Date("2026-06-17T16:00:00-03:00"),
      },
    )

    expect(resultado).toEqual({ ok: true, total: 1 })
    expect(cliente.notificacao.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        usuarioId: "usuario-aluno",
        tipo: "LEMBRETE_TREINO",
        titulo: "Lembrete de treino",
      }),
    })
    expect(enviarPushParaNotificacao).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "notificacao-treino",
        usuarioId: "usuario-aluno",
        tipo: "LEMBRETE_TREINO",
      }),
    )
  })
})

describe("gerarLembretesAniversario", () => {
  it("cria lembretes únicos pelo fluxo que tenta enviar push", async () => {
    const cliente = {
      configuracaoAcademia: {
        findUnique: vi.fn(async () => ({ notificarAniversario: true })),
      },
      usuario: {
        findMany: vi.fn(async () => [{ id: "gestor-1" }]),
      },
      aluno: {
        findMany: vi.fn(async () => [
          {
            dataNascimento: new Date("2000-06-18T12:00:00Z"),
            usuario: { nome: "Ana Silva" },
            modalidades: [{ professores: [{ usuarioId: "professor-1" }] }],
          },
        ]),
      },
      notificacao: {
        findFirst: vi.fn(async () => null),
        create: vi.fn(async ({ data }: { data: NotificacaoData }) => ({
          id: `notificacao-${data.usuarioId}`,
          lida: false,
          criadoEm: new Date("2026-06-17T16:00:00-03:00"),
          ...data,
        })),
      },
    }

    const resultado = await gerarLembretesAniversario(
      cliente as unknown as Parameters<typeof gerarLembretesAniversario>[0],
      {
        agora: new Date("2026-06-17T12:00:00-03:00"),
      },
    )

    expect(resultado).toEqual({ ok: true, total: 2 })
    expect(cliente.notificacao.create).toHaveBeenCalledTimes(2)
    expect(enviarPushParaNotificacao).toHaveBeenCalledTimes(2)
    expect(enviarPushParaNotificacao).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "notificacao-gestor-1",
        usuarioId: "gestor-1",
        tipo: "ANIVERSARIO",
      }),
    )
    expect(enviarPushParaNotificacao).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "notificacao-professor-1",
        usuarioId: "professor-1",
        tipo: "ANIVERSARIO",
      }),
    )
  })
})

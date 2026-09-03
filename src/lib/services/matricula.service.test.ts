import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => {
  const tx = {
    modalidade: { findFirst: vi.fn() },
    plano: { findFirst: vi.fn() },
    solicitacaoMatricula: {
      create: vi.fn(),
      findUnique: vi.fn(),
      updateMany: vi.fn(),
      update: vi.fn(),
    },
    usuario: { create: vi.fn(), findMany: vi.fn() },
    clienteAsaas: { create: vi.fn() },
    cobrancaAsaas: { create: vi.fn() },
    mensalidade: { update: vi.fn() },
    cobrancaMatriculaAsaas: { update: vi.fn() },
  }
  const db = {
    usuario: { findUnique: vi.fn() },
    solicitacaoMatricula: { findMany: vi.fn() },
    $transaction: vi.fn(async (callback: (cliente: typeof tx) => unknown) => callback(tx)),
  }
  return {
    db,
    tx,
    gerarHashSenha: vi.fn(),
    registrarLog: vi.fn(),
    registrarMensalidadeInicialPagaAsaas: vi.fn(),
    criarNotificacao: vi.fn(),
    enviarPushParaNotificacoes: vi.fn(),
  }
})

vi.mock("@/lib/db", () => ({ db: mocks.db }))
vi.mock("@/lib/auth/senha", () => ({ gerarHashSenha: mocks.gerarHashSenha }))
vi.mock("@/lib/services/auditoria.service", () => ({ registrarLog: mocks.registrarLog }))
vi.mock("@/lib/services/financeiro.service", () => ({
  registrarMensalidadeInicialPagaAsaas: mocks.registrarMensalidadeInicialPagaAsaas,
}))
vi.mock("@/lib/services/notificacao.service", () => ({
  criarNotificacao: mocks.criarNotificacao,
  enviarPushParaNotificacoes: mocks.enviarPushParaNotificacoes,
}))

import {
  aprovarMatricula,
  listarMatriculasPendentes,
  rejeitarMatricula,
  solicitarMatricula,
} from "./matricula.service"

const dadosBase = {
  nome: "Aluno Parceiro",
  email: "aluno@exemplo.com",
  senha: "123456",
  confirmarSenha: "123456",
  cpf: "52998224725",
  telefone: null,
  dataNascimento: null,
  endereco: null,
  contatoEmergencia: null,
  restricoesMedicas: null,
  modalidadeId: "modalidade-1",
  aceiteDados: "on" as const,
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.db.usuario.findUnique.mockResolvedValue(null)
  mocks.gerarHashSenha.mockResolvedValue("senha-hash")
  mocks.tx.modalidade.findFirst.mockResolvedValue({ id: "modalidade-1", nome: "Jiu-Jitsu" })
  mocks.tx.solicitacaoMatricula.create.mockImplementation(({ data }) => ({
    id: "solicitacao-1",
    tokenAcompanhamento: "token-acompanhamento",
    ...data,
  }))
  mocks.tx.solicitacaoMatricula.updateMany.mockResolvedValue({ count: 1 })
  mocks.tx.usuario.create.mockResolvedValue({
    id: "usuario-1",
    aluno: { id: "aluno-1" },
  })
  mocks.tx.usuario.findMany.mockResolvedValue([{ id: "gestor-1" }, { id: "gestor-2" }])
  mocks.criarNotificacao.mockImplementation(async (_cliente, params) => ({
    id: `notificacao-${params.usuarioId}`,
    ...params,
  }))
})

describe("solicitarMatricula", () => {
  it("preserva o plano padrão e o fluxo financeiro para mensalista", async () => {
    mocks.tx.plano.findFirst.mockResolvedValue({
      id: "plano-padrao",
      nome: "Plano padrão",
      valor: 150,
    })

    const resultado = await solicitarMatricula({
      ...dadosBase,
      tipoPagamento: "MENSALISTA",
      beneficioAtivoDeclarado: false,
    })

    expect(resultado.ok).toBe(true)
    expect(mocks.tx.plano.findFirst).toHaveBeenCalledOnce()
    expect(mocks.tx.solicitacaoMatricula.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tipoPagamento: "MENSALISTA",
        beneficioAtivoDeclarado: false,
        planoId: "plano-padrao",
      }),
    })
    expect(mocks.tx.usuario.findMany).toHaveBeenCalledWith({
      where: { papel: "GESTOR", ativo: true },
      select: { id: true },
    })
    expect(mocks.criarNotificacao).toHaveBeenCalledTimes(2)
    expect(mocks.criarNotificacao).toHaveBeenNthCalledWith(
      1,
      mocks.tx,
      {
        usuarioId: "gestor-1",
        tipo: "MATRICULA",
        titulo: "Matrícula aguardando análise",
        mensagem: "Aluno Parceiro solicitou matrícula em Jiu-Jitsu. Tipo de pagamento: mensalista.",
      },
      { enviarPush: false },
    )
    expect(mocks.criarNotificacao).toHaveBeenNthCalledWith(
      2,
      mocks.tx,
      {
        usuarioId: "gestor-2",
        tipo: "MATRICULA",
        titulo: "Matrícula aguardando análise",
        mensagem: "Aluno Parceiro solicitou matrícula em Jiu-Jitsu. Tipo de pagamento: mensalista.",
      },
      { enviarPush: false },
    )
    expect(mocks.enviarPushParaNotificacoes).toHaveBeenCalledWith([
      expect.objectContaining({ id: "notificacao-gestor-1", usuarioId: "gestor-1" }),
      expect.objectContaining({ id: "notificacao-gestor-2", usuarioId: "gestor-2" }),
    ])
  })

  it.each([
    "WELLHUB",
    "TOTALPASS",
  ] as const)("cria solicitação %s sem consultar nem vincular plano interno", async (tipoPagamento) => {
    const resultado = await solicitarMatricula({
      ...dadosBase,
      tipoPagamento,
      beneficioAtivoDeclarado: true,
    })

    expect(resultado.ok).toBe(true)
    expect(mocks.tx.plano.findFirst).not.toHaveBeenCalled()
    expect(mocks.tx.solicitacaoMatricula.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tipoPagamento,
        beneficioAtivoDeclarado: true,
        planoId: null,
        comprovantePagamentoUrl: null,
      }),
    })
  })

  it("rejeita comprovante enviado diretamente para matrícula externa", async () => {
    const resultado = await solicitarMatricula({
      ...dadosBase,
      tipoPagamento: "WELLHUB",
      beneficioAtivoDeclarado: true,
      comprovante: {
        url: "privado/matricula.pdf",
        contentType: "application/pdf",
        nomeOriginal: "matricula.pdf",
      },
    })

    expect(resultado).toEqual({
      ok: false,
      motivo: "Matrículas Wellhub e TotalPass não recebem comprovante de pagamento.",
    })
    expect(mocks.db.usuario.findUnique).not.toHaveBeenCalled()
  })
})

describe("listarMatriculasPendentes", () => {
  it("lista externos declarados sem cobrança e mensalistas somente após recebimento", () => {
    listarMatriculasPendentes()

    expect(mocks.db.solicitacaoMatricula.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          status: "PENDENTE",
          OR: [
            {
              tipoPagamento: { in: ["WELLHUB", "TOTALPASS"] },
              beneficioAtivoDeclarado: true,
            },
            {
              tipoPagamento: "MENSALISTA",
              cobrancasAsaas: { some: { status: "RECEBIDA" } },
            },
          ],
        },
      }),
    )
  })
})

describe("aprovarMatricula", () => {
  it("continua exigindo vencimento para aprovar mensalista", async () => {
    mocks.tx.solicitacaoMatricula.findUnique.mockResolvedValue({
      id: "solicitacao-1",
      status: "PENDENTE",
      senhaHash: "senha-hash",
      tipoPagamento: "MENSALISTA",
      beneficioAtivoDeclarado: false,
      modalidade: { id: "modalidade-1", nome: "Jiu-Jitsu", ativa: true },
      plano: { id: "plano-padrao" },
      cobrancasAsaas: [],
    })

    const resultado = await aprovarMatricula({
      solicitacaoId: "solicitacao-1",
      autorId: "gestor-1",
    })

    expect(resultado).toEqual({ ok: false, motivo: "Informe o dia de vencimento." })
    expect(mocks.tx.solicitacaoMatricula.updateMany).not.toHaveBeenCalled()
  })

  it.each([
    "WELLHUB",
    "TOTALPASS",
  ] as const)("aprova %s sem criar mensalidade ou registros Asaas", async (tipoPagamento) => {
    mocks.tx.solicitacaoMatricula.findUnique.mockResolvedValue({
      id: "solicitacao-1",
      status: "PENDENTE",
      senhaHash: "senha-hash",
      nome: "Aluno Parceiro",
      email: "aluno@exemplo.com",
      cpf: "52998224725",
      telefone: null,
      dataNascimento: null,
      endereco: null,
      contatoEmergencia: null,
      restricoesMedicas: null,
      tipoPagamento,
      beneficioAtivoDeclarado: true,
      comprovantePagamentoUrl: null,
      modalidade: { id: "modalidade-1", nome: "Jiu-Jitsu", ativa: true },
      plano: null,
      cobrancasAsaas: [],
    })

    const resultado = await aprovarMatricula({
      solicitacaoId: "solicitacao-1",
      autorId: "gestor-1",
    })

    expect(resultado).toEqual({ ok: true, alunoId: "aluno-1" })
    expect(mocks.tx.usuario.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          aluno: {
            create: expect.objectContaining({
              tipo: tipoPagamento,
              planoId: null,
              modalidadesPlano: {
                create: {
                  modalidadeId: "modalidade-1",
                  plataformaExterna: tipoPagamento,
                },
              },
            }),
          },
        }),
      }),
    )
    expect(mocks.registrarMensalidadeInicialPagaAsaas).not.toHaveBeenCalled()
    expect(mocks.tx.clienteAsaas.create).not.toHaveBeenCalled()
    expect(mocks.tx.cobrancaAsaas.create).not.toHaveBeenCalled()
    expect(mocks.tx.mensalidade.update).not.toHaveBeenCalled()
    expect(mocks.tx.cobrancaMatriculaAsaas.update).not.toHaveBeenCalled()
    expect(mocks.criarNotificacao).toHaveBeenCalledTimes(2)
    expect(mocks.criarNotificacao).toHaveBeenCalledWith(
      mocks.tx,
      {
        usuarioId: "gestor-1",
        tipo: "MATRICULA",
        titulo: "Matrícula aprovada",
        mensagem:
          "A matrícula de Aluno Parceiro em Jiu-Jitsu está concluída. O acesso ao sistema está liberado.",
      },
      { enviarPush: false },
    )
    expect(mocks.criarNotificacao).toHaveBeenCalledWith(
      mocks.tx,
      {
        usuarioId: "gestor-2",
        tipo: "MATRICULA",
        titulo: "Matrícula aprovada",
        mensagem:
          "A matrícula de Aluno Parceiro em Jiu-Jitsu está concluída. O acesso ao sistema está liberado.",
      },
      { enviarPush: false },
    )
    expect(mocks.enviarPushParaNotificacoes).toHaveBeenCalledWith([
      expect.objectContaining({ id: "notificacao-gestor-1", usuarioId: "gestor-1" }),
      expect.objectContaining({ id: "notificacao-gestor-2", usuarioId: "gestor-2" }),
    ])
  })
})

describe("rejeitarMatricula", () => {
  it("rejeita solicitação externa pendente com justificativa e auditoria", async () => {
    mocks.tx.solicitacaoMatricula.findUnique.mockResolvedValue({
      id: "solicitacao-1",
      nome: "Aluno Parceiro",
      status: "PENDENTE",
      tipoPagamento: "WELLHUB",
      cobrancasAsaas: [],
    })

    const resultado = await rejeitarMatricula({
      solicitacaoId: "solicitacao-1",
      justificativa: "Pedido duplicado; aluna já possui matrícula ativa.",
      autorId: "gestor-1",
      agora: new Date("2026-09-02T12:00:00.000Z"),
    })

    expect(resultado).toEqual({ ok: true })
    expect(mocks.tx.solicitacaoMatricula.updateMany).toHaveBeenCalledWith({
      where: { id: "solicitacao-1", status: "PENDENTE" },
      data: expect.objectContaining({
        status: "REJEITADA",
        justificativa: "Pedido duplicado; aluna já possui matrícula ativa.",
        analisadoPorId: "gestor-1",
        senhaHash: null,
      }),
    })
    expect(mocks.registrarLog).toHaveBeenCalledWith(
      expect.objectContaining({
        acao: "MATRICULA_REJEITADA",
        entidadeId: "solicitacao-1",
        justificativa: "Pedido duplicado; aluna já possui matrícula ativa.",
      }),
      mocks.tx,
    )
  })

  it("bloqueia rejeição de mensalista com pagamento confirmado", async () => {
    mocks.tx.solicitacaoMatricula.findUnique.mockResolvedValue({
      id: "solicitacao-1",
      nome: "Aluno Mensalista",
      status: "PENDENTE",
      tipoPagamento: "MENSALISTA",
      cobrancasAsaas: [{ id: "cobranca-1" }],
    })

    await expect(
      rejeitarMatricula({
        solicitacaoId: "solicitacao-1",
        justificativa: "Pedido duplicado; aluno já possui matrícula ativa.",
        autorId: "gestor-1",
      }),
    ).resolves.toEqual({
      ok: false,
      motivo:
        "Esta matrícula possui pagamento confirmado. Concilie o pagamento antes de rejeitar a solicitação.",
    })
    expect(mocks.tx.solicitacaoMatricula.updateMany).not.toHaveBeenCalled()
  })
})

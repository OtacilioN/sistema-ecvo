import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => {
  const tx = {
    $queryRaw: vi.fn(),
    modalidade: { findMany: vi.fn() },
    aula: { findFirst: vi.fn(), findUnique: vi.fn() },
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
    acessoAulaAvulsa: { create: vi.fn() },
    comparecimento: { findMany: vi.fn(), create: vi.fn() },
    checkin: { findMany: vi.fn() },
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
  modalidadeIds: ["modalidade-1"],
  aceiteDados: "on" as const,
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.db.usuario.findUnique.mockResolvedValue(null)
  mocks.gerarHashSenha.mockResolvedValue("senha-hash")
  mocks.tx.modalidade.findMany.mockResolvedValue([{ id: "modalidade-1", nome: "Jiu-Jitsu" }])
  mocks.tx.solicitacaoMatricula.create.mockImplementation(({ data }) => ({
    id: "solicitacao-1",
    tokenAcompanhamento: "token-acompanhamento",
    ...data,
  }))
  mocks.tx.solicitacaoMatricula.updateMany.mockResolvedValue({ count: 1 })
  mocks.tx.comparecimento.findMany.mockResolvedValue([])
  mocks.tx.checkin.findMany.mockResolvedValue([])
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
      quantidadeModalidadesMatricula: 1,
    })

    const resultado = await solicitarMatricula({
      ...dadosBase,
      tipoPagamento: "MENSALISTA",
      beneficioAtivoDeclarado: false,
    })

    expect(resultado.ok).toBe(true)
    expect(mocks.tx.plano.findFirst).toHaveBeenCalledOnce()
    expect(mocks.tx.plano.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          quantidadeModalidadesMatricula: 1,
          ativo: true,
          periodicidade: "MENSAL",
        },
      }),
    )
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

  it("seleciona o plano pela quantidade e preserva seu valor dinâmico", async () => {
    mocks.tx.modalidade.findMany.mockResolvedValue([
      { id: "modalidade-1", nome: "Jiu-Jitsu" },
      { id: "modalidade-2", nome: "Boxe" },
      { id: "modalidade-3", nome: "Kickboxing" },
    ])
    mocks.tx.plano.findFirst.mockResolvedValue({
      id: "plano-tres",
      nome: "Plano livre de três",
      valor: 281.2,
      quantidadeModalidadesMatricula: 3,
    })

    const resultado = await solicitarMatricula({
      ...dadosBase,
      modalidadeIds: ["modalidade-1", "modalidade-2", "modalidade-3"],
      tipoPagamento: "MENSALISTA",
      beneficioAtivoDeclarado: false,
    })

    expect(resultado.ok).toBe(true)
    expect(mocks.tx.plano.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          quantidadeModalidadesMatricula: 3,
          ativo: true,
          periodicidade: "MENSAL",
        },
      }),
    )
    expect(mocks.tx.solicitacaoMatricula.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        planoId: "plano-tres",
        modalidadePrincipalId: "modalidade-1",
        modalidades: {
          create: [
            { modalidadeId: "modalidade-1" },
            { modalidadeId: "modalidade-2" },
            { modalidadeId: "modalidade-3" },
          ],
        },
      }),
    })
    expect(mocks.registrarLog).toHaveBeenCalledWith(
      expect.objectContaining({
        valorNovo: expect.objectContaining({
          modalidadeIds: ["modalidade-1", "modalidade-2", "modalidade-3"],
          quantidadeModalidades: 3,
          planoId: "plano-tres",
          valorPlano: 281.2,
        }),
      }),
      mocks.tx,
    )
  })

  it("rejeita quando alguma modalidade não está ativa ou não existe", async () => {
    mocks.tx.modalidade.findMany.mockResolvedValue([{ id: "modalidade-1", nome: "Jiu-Jitsu" }])

    await expect(
      solicitarMatricula({
        ...dadosBase,
        modalidadeIds: ["modalidade-1", "modalidade-invalida"],
        tipoPagamento: "MENSALISTA",
        beneficioAtivoDeclarado: false,
      }),
    ).resolves.toEqual({
      ok: false,
      motivo: "Uma das modalidades selecionadas não está disponível.",
    })
    expect(mocks.tx.plano.findFirst).not.toHaveBeenCalled()
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
      motivo: "Este tipo de matrícula não recebe comprovante de pagamento.",
    })
    expect(mocks.db.usuario.findUnique).not.toHaveBeenCalled()
  })

  it("vincula a aula real e preserva o plano de R$ 100 como alvo da conversão", async () => {
    mocks.tx.aula.findFirst.mockResolvedValue({
      id: "aula-1",
      inicio: new Date("2026-09-05T12:00:00.000Z"),
      fim: new Date("2026-09-05T13:00:00.000Z"),
      turma: { nome: "Turma manhã", local: "Unidade Centro", capacidade: 20 },
    })
    mocks.tx.plano.findFirst.mockResolvedValue({
      id: "plano-padrao",
      nome: "Plano mensal",
      valor: 100,
    })

    const resultado = await solicitarMatricula({
      ...dadosBase,
      tipoPagamento: "AULA_AVULSA",
      aulaAvulsaId: "aula-1",
      beneficioAtivoDeclarado: false,
    })

    expect(resultado.ok).toBe(true)
    expect(mocks.tx.aula.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: "aula-1",
          cancelada: false,
          turma: expect.objectContaining({ modalidadeId: "modalidade-1", ehEvento: false }),
        }),
      }),
    )
    expect(mocks.tx.solicitacaoMatricula.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tipoPagamento: "AULA_AVULSA",
        aulaAvulsaId: "aula-1",
        planoId: "plano-padrao",
      }),
    })
  })
})

describe("listarMatriculasPendentes", () => {
  it("lista externos declarados e pagamentos diretos somente após recebimento", () => {
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
            {
              tipoPagamento: "AULA_AVULSA",
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
      modalidadePrincipal: { id: "modalidade-1", nome: "Jiu-Jitsu", ativa: true },
      modalidades: [{ modalidade: { id: "modalidade-1", nome: "Jiu-Jitsu", ativa: true } }],
      plano: {
        id: "plano-padrao",
        ativo: true,
        periodicidade: "MENSAL",
        quantidadeModalidadesMatricula: 1,
      },
      cobrancasAsaas: [],
    })
    const resultado = await aprovarMatricula({
      solicitacaoId: "solicitacao-1",
      autorId: "gestor-1",
    })

    expect(resultado).toEqual({ ok: false, motivo: "Informe o dia de vencimento." })
    expect(mocks.tx.solicitacaoMatricula.updateMany).not.toHaveBeenCalled()
  })

  it("aprova mensalista com três modalidades e o valor preservado da cobrança", async () => {
    const modalidades = [
      { id: "modalidade-1", nome: "Jiu-Jitsu", ativa: true },
      { id: "modalidade-2", nome: "Boxe", ativa: true },
      { id: "modalidade-3", nome: "Kickboxing", ativa: true },
    ]
    const recebidaEmAsaas = new Date("2026-09-07T12:00:00.000Z")
    mocks.tx.solicitacaoMatricula.findUnique.mockResolvedValue({
      id: "solicitacao-1",
      status: "PENDENTE",
      senhaHash: "senha-hash",
      nome: "Aluno Mensalista",
      email: "mensalista@exemplo.com",
      cpf: "52998224725",
      telefone: null,
      dataNascimento: null,
      endereco: null,
      contatoEmergencia: null,
      restricoesMedicas: null,
      tipoPagamento: "MENSALISTA",
      beneficioAtivoDeclarado: false,
      comprovantePagamentoUrl: null,
      modalidadePrincipal: modalidades[0],
      modalidades: modalidades.map((modalidade) => ({ modalidade })),
      aulaAvulsa: null,
      plano: {
        id: "plano-tres",
        ativo: true,
        periodicidade: "MENSAL",
        quantidadeModalidadesMatricula: 3,
      },
      cobrancasAsaas: [
        {
          id: "cobranca-matricula-1",
          status: "RECEBIDA",
          finalidade: "PRIMEIRA_MENSALIDADE",
          competencia: "2026-09",
          valor: 281.2,
          recebidaEmAsaas,
          asaasPaymentId: "pay-1",
          asaasCustomerId: "cus-1",
          externalReference: "matricula:solicitacao-1",
          vencimentoAsaas: new Date("2026-09-07T15:00:00.000Z"),
          statusAsaas: "RECEIVED",
          pixCopiaECola: "pix",
          qrCodeExpiraEm: new Date("2026-09-08T00:00:00.000Z"),
          invoiceUrl: "https://asaas.example/invoice",
          ultimoEventoAsaas: "PAYMENT_RECEIVED",
        },
      ],
    })
    mocks.registrarMensalidadeInicialPagaAsaas.mockResolvedValue({
      ok: true,
      mensalidade: { id: "mensalidade-1" },
    })
    mocks.tx.cobrancaAsaas.create.mockResolvedValue({ id: "cobranca-canonica-1" })

    const resultado = await aprovarMatricula({
      solicitacaoId: "solicitacao-1",
      diaVencimento: 10,
      autorId: "gestor-1",
      agora: new Date("2026-09-07T13:00:00.000Z"),
    })

    expect(resultado).toEqual({ ok: true, alunoId: "aluno-1" })
    expect(mocks.tx.usuario.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          aluno: {
            create: expect.objectContaining({
              planoId: "plano-tres",
              modalidades: {
                connect: modalidades.map((modalidade) => ({ id: modalidade.id })),
              },
              modalidadesPlano: {
                create: modalidades.map((modalidade) => ({
                  modalidadeId: modalidade.id,
                  plataformaExterna: null,
                })),
              },
            }),
          },
        }),
      }),
    )
    expect(mocks.registrarMensalidadeInicialPagaAsaas).toHaveBeenCalledWith(
      mocks.tx,
      expect.objectContaining({ valor: 281.2, pagoEm: recebidaEmAsaas }),
    )
    expect(mocks.tx.solicitacaoMatricula.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ planoAprovadoId: "plano-tres" }) }),
    )
    expect(mocks.registrarLog).toHaveBeenCalledWith(
      expect.objectContaining({
        acao: "ALUNO_CRIADO",
        valorNovo: expect.objectContaining({
          modalidadeIds: ["modalidade-1", "modalidade-2", "modalidade-3"],
        }),
      }),
      mocks.tx,
    )
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
      modalidadePrincipal: { id: "modalidade-1", nome: "Jiu-Jitsu", ativa: true },
      modalidades: [{ modalidade: { id: "modalidade-1", nome: "Jiu-Jitsu", ativa: true } }],
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
                create: [
                  {
                    modalidadeId: "modalidade-1",
                    plataformaExterna: tipoPagamento,
                  },
                ],
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

  it("aprova aula avulsa sem vincular plano e reserva somente a aula paga", async () => {
    const inicio = new Date("2026-09-05T12:00:00.000Z")
    mocks.tx.solicitacaoMatricula.findUnique.mockResolvedValue({
      id: "solicitacao-1",
      status: "PENDENTE",
      senhaHash: "senha-hash",
      nome: "Aluno Avulso",
      email: "avulso@exemplo.com",
      cpf: "52998224725",
      telefone: null,
      dataNascimento: null,
      endereco: null,
      contatoEmergencia: null,
      restricoesMedicas: null,
      tipoPagamento: "AULA_AVULSA",
      beneficioAtivoDeclarado: false,
      modalidadePrincipal: { id: "modalidade-1", nome: "Jiu-Jitsu", ativa: true },
      modalidades: [{ modalidade: { id: "modalidade-1", nome: "Jiu-Jitsu", ativa: true } }],
      aulaAvulsa: {
        id: "aula-1",
        inicio,
        fim: new Date("2026-09-05T13:00:00.000Z"),
        cancelada: false,
        turma: { ativa: true, ehEvento: false, modalidadeId: "modalidade-1", capacidade: 20 },
      },
      plano: {
        id: "plano-padrao",
        ativo: true,
        periodicidade: "MENSAL",
        valor: 100,
        quantidadeModalidadesMatricula: 1,
      },
      cobrancasAsaas: [
        {
          id: "cobranca-1",
          status: "RECEBIDA",
          finalidade: "AULA_AVULSA",
          recebidaEmAsaas: new Date("2026-09-03T15:00:00.000Z"),
          asaasPaymentId: "pay-1",
          asaasCustomerId: "cus-1",
          valor: 20,
        },
      ],
    })
    mocks.tx.aula.findUnique.mockResolvedValue({
      inicio,
      fim: new Date("2026-09-05T13:00:00.000Z"),
      cancelada: false,
      turma: { ativa: true, ehEvento: false, modalidadeId: "modalidade-1", capacidade: 20 },
    })

    const resultado = await aprovarMatricula({
      solicitacaoId: "solicitacao-1",
      autorId: "gestor-1",
      agora: new Date("2026-09-03T16:00:00.000Z"),
    })

    expect(resultado).toEqual({ ok: true, alunoId: "aluno-1" })
    expect(mocks.tx.usuario.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          aluno: {
            create: expect.objectContaining({ tipo: "AVULSO", planoId: null }),
          },
        }),
      }),
    )
    expect(mocks.tx.acessoAulaAvulsa.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        solicitacaoId: "solicitacao-1",
        alunoId: "aluno-1",
        aulaId: "aula-1",
        valorPago: 20,
        valorPlanoSnapshot: 100,
        valorComplemento: 80,
      }),
    })
    expect(mocks.tx.comparecimento.create).toHaveBeenCalledWith({
      data: { alunoId: "aluno-1", aulaId: "aula-1", status: "CONFIRMADO" },
    })
    expect(mocks.registrarMensalidadeInicialPagaAsaas).not.toHaveBeenCalled()
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

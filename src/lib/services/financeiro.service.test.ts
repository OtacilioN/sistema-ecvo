import { describe, expect, it } from "vitest"
import {
  atualizarVencimentosMensalidadesAluno,
  calcularDistribuicaoSobraFinanceira,
  calcularRepasseFinanceiro,
  gerarLembretesFinanceiros,
  lerRepasseSnapshotMensalidade,
  mensagemInadimplenciaMensalidade,
  mensagemInadimplenciaMensalidadeAluno,
  mensagemLembreteVencimentoMensalidade,
  mensagemPagamentoAvulso,
  mensagemStatusMensalidade,
  mensalidadeBloqueiaTreino,
  mensalistaAdimplente,
  modalidadesMensalidadeInterna,
  sincronizarStatusFinanceiroAluno,
  statusMensalidadeEfetivo,
  vencerMensalidadesAtrasadas,
} from "./financeiro.service"

describe("statusMensalidadeEfetivo", () => {
  it("deriva vencida quando em aberto após o vencimento", () => {
    expect(
      statusMensalidadeEfetivo(
        { status: "EM_ABERTO", vencimento: new Date("2026-06-10T12:00:00Z") },
        new Date("2026-06-11T12:00:00Z"),
      ),
    ).toBe("VENCIDA")
  })

  it("preserva status final", () => {
    expect(
      statusMensalidadeEfetivo(
        { status: "PAGA", vencimento: new Date("2026-06-10T12:00:00Z") },
        new Date("2026-06-11T12:00:00Z"),
      ),
    ).toBe("PAGA")
  })
})

describe("mensalistaAdimplente", () => {
  it("é verdadeiro quando há mensalidade em aberto antes do vencimento", () => {
    expect(
      mensalistaAdimplente(
        [{ status: "EM_ABERTO", vencimento: new Date("2026-06-10T12:00:00Z") }],
        new Date("2026-06-09T12:00:00Z"),
      ),
    ).toBe(true)
  })

  it("é falso quando há mensalidade vencida", () => {
    expect(
      mensalistaAdimplente(
        [{ status: "EM_ABERTO", vencimento: new Date("2026-06-10T12:00:00Z") }],
        new Date("2026-06-11T12:00:00Z"),
      ),
    ).toBe(false)
  })

  it("é verdadeiro quando tudo está pago/isento/cancelado", () => {
    expect(
      mensalistaAdimplente([
        { status: "PAGA", vencimento: new Date("2026-06-10T12:00:00Z") },
        { status: "ISENTA", vencimento: new Date("2026-06-10T12:00:00Z") },
      ]),
    ).toBe(true)
  })
})

describe("mensalidadeBloqueiaTreino", () => {
  it("não bloqueia mensalidade em aberto antes do vencimento", () => {
    expect(
      mensalidadeBloqueiaTreino(
        { status: "EM_ABERTO", vencimento: new Date("2026-06-10T12:00:00Z") },
        new Date("2026-06-09T12:00:00Z"),
      ),
    ).toBe(false)
  })

  it("bloqueia mensalidade vencida automaticamente pela data", () => {
    expect(
      mensalidadeBloqueiaTreino(
        { status: "EM_ABERTO", vencimento: new Date("2026-06-10T12:00:00Z") },
        new Date("2026-06-11T12:00:00Z"),
      ),
    ).toBe(true)
  })
})

describe("atualizarVencimentosMensalidadesAluno", () => {
  it("recalcula vencimento e status de mensalidades abertas e vencidas", async () => {
    const atualizacoes: unknown[] = []
    const cliente = {
      mensalidade: {
        findMany: async () => [
          { id: "mensalidade-1", competencia: "2026-06", status: "VENCIDA" },
          { id: "mensalidade-2", competencia: "2026-05", status: "EM_ABERTO" },
        ],
        update: async (params: unknown) => {
          atualizacoes.push(params)
          return params
        },
        findFirst: async () => ({ id: "mensalidade-2" }),
      },
      aluno: {
        updateMany: async () => ({ count: 1 }),
      },
    } as never

    const resultado = await atualizarVencimentosMensalidadesAluno(cliente, {
      alunoId: "aluno-1",
      diaVencimentoAnterior: 8,
      diaVencimentoNovo: 12,
      hoje: new Date("2026-06-11T12:00:00Z"),
    })

    expect(resultado).toBe(2)
    expect(atualizacoes).toEqual([
      {
        where: { id: "mensalidade-1" },
        data: {
          vencimento: new Date("2026-06-12T12:00:00Z"),
          status: "EM_ABERTO",
        },
      },
      {
        where: { id: "mensalidade-2" },
        data: {
          vencimento: new Date("2026-05-12T12:00:00Z"),
          status: "VENCIDA",
        },
      },
    ])
  })

  it("atualiza o vencimento sem reabrir status finais", async () => {
    const atualizacoes: unknown[] = []
    const cliente = {
      mensalidade: {
        findMany: async () => [{ id: "mensalidade-1", competencia: "2026-06", status: "PAGA" }],
        update: async (params: unknown) => {
          atualizacoes.push(params)
          return params
        },
        findFirst: async () => null,
      },
      aluno: {
        updateMany: async () => ({ count: 1 }),
      },
    } as never

    const resultado = await atualizarVencimentosMensalidadesAluno(cliente, {
      alunoId: "aluno-1",
      diaVencimentoAnterior: 8,
      diaVencimentoNovo: 12,
      hoje: new Date("2026-06-11T12:00:00Z"),
    })

    expect(resultado).toBe(1)
    expect(atualizacoes).toEqual([
      {
        where: { id: "mensalidade-1" },
        data: {
          vencimento: new Date("2026-06-12T12:00:00Z"),
          status: "PAGA",
        },
      },
    ])
  })

  it("não busca mensalidades quando o dia não mudou", async () => {
    const cliente = {
      mensalidade: {
        findMany: async () => {
          throw new Error("não deveria buscar mensalidades")
        },
      },
    } as never

    const resultado = await atualizarVencimentosMensalidadesAluno(cliente, {
      alunoId: "aluno-1",
      diaVencimentoAnterior: 12,
      diaVencimentoNovo: 12,
    })

    expect(resultado).toBe(0)
  })
})

describe("vencerMensalidadesAtrasadas", () => {
  it("marca como vencidas mensalidades em aberto com vencimento passado e notifica alunos", async () => {
    const buscas: unknown[] = []
    const atualizacoes: unknown[] = []
    const atualizacoesAluno: unknown[] = []
    const notificacoes: unknown[] = []
    const cliente = {
      mensalidade: {
        findMany: async (params: unknown) => {
          buscas.push(params)
          return [
            {
              id: "mensalidade-1",
              alunoId: "aluno-1",
              competencia: "2026-06",
              vencimento: new Date("2026-06-10T12:00:00Z"),
              valor: 250,
              aluno: { usuarioId: "usuario-aluno-1" },
            },
            {
              id: "mensalidade-2",
              alunoId: "aluno-2",
              competencia: "2026-06",
              vencimento: new Date("2026-06-09T12:00:00Z"),
              valor: 300,
              aluno: { usuarioId: "usuario-aluno-2" },
            },
          ]
        },
        updateMany: async (params: unknown) => {
          atualizacoes.push(params)
          return { count: atualizacoes.length === 1 ? 1 : 0 }
        },
        findFirst: async () => ({ id: "mensalidade-1" }),
      },
      aluno: {
        updateMany: async (params: unknown) => {
          atualizacoesAluno.push(params)
          return { count: 1 }
        },
      },
      notificacao: {
        findFirst: async () => null,
        create: async (params: unknown) => {
          notificacoes.push(params)
          return { id: "notificacao-1" }
        },
      },
      configuracaoAcademia: {
        findUnique: async () => ({ notificarFinanceiro: true }),
      },
    } as never

    const resultado = await vencerMensalidadesAtrasadas(cliente, {
      agora: new Date("2026-06-11T12:00:00Z"),
    })

    expect(resultado).toEqual({ ok: true, mensalidadesVencidas: 1, alunosNotificados: 1 })
    expect(buscas).toEqual([
      {
        where: {
          status: "EM_ABERTO",
          vencimento: { lt: expect.any(Date) },
        },
        select: {
          id: true,
          alunoId: true,
          competencia: true,
          vencimento: true,
          valor: true,
          aluno: { select: { usuarioId: true } },
        },
        orderBy: { vencimento: "asc" },
      },
    ])
    expect(atualizacoes).toEqual([
      {
        where: { id: "mensalidade-1", status: "EM_ABERTO" },
        data: { status: "VENCIDA" },
      },
      {
        where: { id: "mensalidade-2", status: "EM_ABERTO" },
        data: { status: "VENCIDA" },
      },
    ])
    expect(atualizacoesAluno).toEqual([
      {
        where: { id: "aluno-1", status: "ATIVO" },
        data: { status: "INADIMPLENTE" },
      },
    ])
    expect(notificacoes).toEqual([
      {
        data: {
          usuarioId: "usuario-aluno-1",
          tipo: "FINANCEIRO",
          titulo: "Mensalidade vencida",
          mensagem: expect.stringContaining("2026-06: vencida desde 10/06/2026, valor"),
        },
      },
    ])
    expect(JSON.stringify(notificacoes[0])).toContain("250,00")
  })

  it("não duplica notificação de inadimplência do aluno", async () => {
    const notificacoesCriadas: unknown[] = []
    const cliente = {
      mensalidade: {
        findMany: async () => [
          {
            id: "mensalidade-1",
            alunoId: "aluno-1",
            competencia: "2026-06",
            vencimento: new Date("2026-06-10T12:00:00Z"),
            valor: 250,
            aluno: { usuarioId: "usuario-aluno-1" },
          },
        ],
        updateMany: async () => ({ count: 1 }),
        findFirst: async () => ({ id: "mensalidade-1" }),
      },
      aluno: {
        updateMany: async () => ({ count: 1 }),
      },
      notificacao: {
        findFirst: async () => ({ id: "notificacao-existente" }),
        create: async (params: unknown) => {
          notificacoesCriadas.push(params)
          return { id: "notificacao-nova" }
        },
      },
      configuracaoAcademia: {
        findUnique: async () => ({ notificarFinanceiro: true }),
      },
    } as never

    const resultado = await vencerMensalidadesAtrasadas(cliente, {
      agora: new Date("2026-06-11T12:00:00Z"),
    })

    expect(resultado).toEqual({ ok: true, mensalidadesVencidas: 1, alunosNotificados: 0 })
    expect(notificacoesCriadas).toEqual([])
  })

  it("volta aluno inadimplente para ativo quando não resta mensalidade vencida", async () => {
    const atualizacoesAluno: unknown[] = []
    const cliente = {
      mensalidade: {
        findFirst: async () => null,
      },
      aluno: {
        updateMany: async (params: unknown) => {
          atualizacoesAluno.push(params)
          return { count: 1 }
        },
      },
    } as never

    await sincronizarStatusFinanceiroAluno(cliente, "aluno-1", new Date("2026-06-11T12:00:00Z"))

    expect(atualizacoesAluno).toEqual([
      {
        where: { id: "aluno-1", status: "INADIMPLENTE" },
        data: { status: "ATIVO" },
      },
    ])
  })
})

describe("mensagemStatusMensalidade", () => {
  it("gera mensagem em pt-BR para atualização financeira", () => {
    expect(mensagemStatusMensalidade({ competencia: "2026-06", status: "PAGA" })).toEqual({
      titulo: "Mensalidade atualizada",
      mensagem: "2026-06: mensalidade paga.",
    })
    expect(mensagemStatusMensalidade({ competencia: "2026-06", status: "ISENTA" }).mensagem).toBe(
      "2026-06: mensalidade isenta.",
    )
  })
})

describe("gerarLembretesFinanceiros", () => {
  it("notifica gestores e professores dos próprios alunos sobre vencimento e inadimplência", async () => {
    const notificacoes: Array<{ data: { usuarioId: string; titulo: string } }> = []
    const professoresBuscados: unknown[] = []
    let buscaProfessores = 0
    const cliente = {
      usuario: {
        findMany: async () => [{ id: "usuario-gestor-1" }],
      },
      mensalidade: {
        findMany: async (params: {
          where?: { status?: string; vencimento?: { lt?: Date; gte?: Date } }
        }) => {
          if (params.where?.status === "EM_ABERTO" && params.where.vencimento?.gte) {
            return [
              {
                id: "mensalidade-a-vencer",
                alunoId: "aluno-a-vencer",
                competencia: "2026-06",
                vencimento: new Date("2026-06-12T12:00:00Z"),
                valor: 250,
                aluno: { usuario: { nome: "Ana Silva" } },
              },
            ]
          }
          if (params.where?.status === "EM_ABERTO" && params.where.vencimento?.lt) return []
          if (params.where?.status === "VENCIDA") {
            return [
              {
                id: "mensalidade-vencida",
                alunoId: "aluno-vencido",
                competencia: "2026-06",
                vencimento: new Date("2026-06-10T12:00:00Z"),
                valor: 300,
                aluno: { usuario: { nome: "Bruno Costa" } },
              },
            ]
          }
          return []
        },
      },
      professor: {
        findMany: async (params: unknown) => {
          professoresBuscados.push(params)
          buscaProfessores++
          if (buscaProfessores === 1) return [{ usuarioId: "usuario-professor-1" }]
          return [{ usuarioId: "usuario-professor-1" }, { usuarioId: "usuario-professor-2" }]
        },
      },
      notificacao: {
        findFirst: async () => null,
        create: async (params: { data: { usuarioId: string; titulo: string } }) => {
          notificacoes.push(params)
          return { id: `notificacao-${notificacoes.length}` }
        },
      },
      configuracaoAcademia: {
        findUnique: async () => ({ notificarFinanceiro: true }),
      },
    } as never

    const resultado = await gerarLembretesFinanceiros(cliente, {
      agora: new Date("2026-06-11T12:00:00Z"),
    })

    expect(resultado).toMatchObject({
      ok: true,
      gestoresNotificados: 1,
      professoresNotificados: 2,
      mensalidadesAVencer: 1,
      mensalidadesInadimplentes: 1,
      lembretesCriados: 2,
      inadimplenciasCriadas: 3,
      totalCriado: 5,
    })
    expect(professoresBuscados).toHaveLength(2)
    expect(notificacoes.map((notificacao) => notificacao.data)).toEqual([
      expect.objectContaining({
        usuarioId: "usuario-gestor-1",
        titulo: "Mensalidade vence amanhã",
      }),
      expect.objectContaining({
        usuarioId: "usuario-professor-1",
        titulo: "Mensalidade vence amanhã",
      }),
      expect.objectContaining({
        usuarioId: "usuario-gestor-1",
        titulo: "Mensalidade inadimplente",
      }),
      expect.objectContaining({
        usuarioId: "usuario-professor-1",
        titulo: "Mensalidade inadimplente",
      }),
      expect.objectContaining({
        usuarioId: "usuario-professor-2",
        titulo: "Mensalidade inadimplente",
      }),
    ])
  })
})

describe("mensagens de lembrete financeiro", () => {
  it("gera lembrete de vencimento no padrão pt-BR", () => {
    const mensagem = mensagemLembreteVencimentoMensalidade({
      alunoNome: "Ana Silva",
      competencia: "2026-06",
      vencimento: new Date("2026-06-10T12:00:00Z"),
      valor: 250,
    })
    expect(mensagem.titulo).toBe("Mensalidade vence amanhã")
    expect(mensagem.mensagem).toContain("Ana Silva · 2026-06")
    expect(mensagem.mensagem).toContain("vence em 10/06/2026")
    expect(mensagem.mensagem).toContain("250,00")
  })

  it("gera alerta de inadimplência no padrão pt-BR", () => {
    const mensagem = mensagemInadimplenciaMensalidade({
      alunoNome: "Ana Silva",
      competencia: "2026-06",
      vencimento: new Date("2026-06-10T12:00:00Z"),
      valor: 250,
    })
    expect(mensagem.titulo).toBe("Mensalidade inadimplente")
    expect(mensagem.mensagem).toContain("Ana Silva · 2026-06")
    expect(mensagem.mensagem).toContain("vencida desde 10/06/2026")
    expect(mensagem.mensagem).toContain("250,00")
  })

  it("gera alerta de inadimplência para o aluno sem repetir o próprio nome", () => {
    const mensagem = mensagemInadimplenciaMensalidadeAluno({
      competencia: "2026-06",
      vencimento: new Date("2026-06-10T12:00:00Z"),
      valor: 250,
    })
    expect(mensagem).toEqual({
      titulo: "Mensalidade vencida",
      mensagem: expect.stringContaining("2026-06: vencida desde 10/06/2026, valor"),
    })
    expect(mensagem.mensagem).toContain("250,00")
  })
})

describe("mensagemPagamentoAvulso", () => {
  it("gera mensagem financeira para pagamento avulso", () => {
    const mensagem = mensagemPagamentoAvulso({ tipo: "EXAME", valor: 150, descricao: "Faixa azul" })
    expect(mensagem.titulo).toBe("Pagamento registrado")
    expect(mensagem.mensagem).toContain("exame:")
    expect(mensagem.mensagem).toContain("150,00")
    expect(mensagem.mensagem).toContain("Faixa azul")
  })
})

describe("calcularRepasseFinanceiro", () => {
  it("separa o repasse do professor da sobra do recebimento", () => {
    expect(
      calcularRepasseFinanceiro({
        valorRecebido: 100,
        itens: [{ professorId: "prof-a", modalidadeId: "kickboxing" }],
      }),
    ).toMatchObject({
      valorRecebido: 100,
      valorBaseTotal: 100,
      desconto: 0,
      professores: [
        {
          professorId: "prof-a",
          valor: 60,
          modalidades: [{ modalidadeId: "kickboxing", valor: 60, tetoProfessor: 60 }],
        },
      ],
      sobraAposProfessores: 40,
    })
  })

  it("mantém professores no valor cheio e reduz a sobra quando há desconto", () => {
    expect(
      calcularRepasseFinanceiro({
        valorRecebido: 175,
        itens: [
          { professorId: "prof-a", modalidadeId: "kickboxing" },
          { professorId: "prof-b", modalidadeId: "muay-thai" },
        ],
      }),
    ).toMatchObject({
      valorBaseTotal: 200,
      desconto: 25,
      professores: [
        { professorId: "prof-a", valor: 60 },
        { professorId: "prof-b", valor: 60 },
      ],
      sobraAposProfessores: 55,
    })
  })

  it("agrega duas modalidades do mesmo professor", () => {
    const resultado = calcularRepasseFinanceiro({
      valorRecebido: 235,
      itens: [
        { professorId: "prof-a", modalidadeId: "kickboxing" },
        { professorId: "prof-a", modalidadeId: "muay-thai" },
        { professorId: "prof-b", modalidadeId: "jiu-jitsu" },
      ],
    })

    expect(resultado.professores).toMatchObject([
      { professorId: "prof-a", valor: 120 },
      { professorId: "prof-b", valor: 60 },
    ])
    expect(resultado.sobraAposProfessores).toBe(55)
  })

  it("direciona arrecadação parcial inteira ao professor até atingir o teto", () => {
    expect(
      calcularRepasseFinanceiro({
        valorRecebido: 40,
        itens: [{ professorId: "prof-a", modalidadeId: "kickboxing" }],
      }),
    ).toMatchObject({
      professores: [{ professorId: "prof-a", valor: 40 }],
      sobraAposProfessores: 0,
    })
  })

  it("separa 60% para professor no repasse Wellhub/TotalPass", () => {
    expect(
      calcularRepasseFinanceiro({
        valorRecebido: 90,
        politica: "REPASSE_EXTERNO",
        itens: [{ professorId: "prof-a", modalidadeId: "kickboxing" }],
      }),
    ).toMatchObject({
      professores: [{ professorId: "prof-a", valor: 54 }],
      sobraAposProfessores: 36,
    })
  })

  it("aplica 60% ao professor no repasse externo mesmo abaixo do teto", () => {
    expect(
      calcularRepasseFinanceiro({
        valorRecebido: 40,
        politica: "REPASSE_EXTERNO",
        itens: [{ professorId: "prof-a", modalidadeId: "kickboxing" }],
      }),
    ).toMatchObject({
      professores: [{ professorId: "prof-a", valor: 24 }],
      sobraAposProfessores: 16,
    })
  })

  it("zera todos os repasses quando o aluno é bolsista integral", () => {
    expect(
      calcularRepasseFinanceiro({
        valorRecebido: 0,
        itens: [{ professorId: "prof-a", modalidadeId: "kickboxing" }],
      }),
    ).toMatchObject({
      professores: [{ professorId: "prof-a", valor: 0 }],
      sobraAposProfessores: 0,
    })
  })

  it("exclui modalidade Wellhub da mensalidade interna de aluno misto", () => {
    const itens = modalidadesMensalidadeInterna([
      {
        professorId: "prof-kickboxing",
        modalidadeId: "kickboxing",
        plataformaExterna: "WELLHUB",
      },
      {
        professorId: "prof-oyama",
        modalidadeId: "muay-thai",
        plataformaExterna: null,
      },
    ])

    expect(itens).toEqual([{ professorId: "prof-oyama", modalidadeId: "muay-thai" }])
    expect(
      calcularRepasseFinanceiro({
        valorRecebido: 90,
        itens,
      }),
    ).toMatchObject({
      professores: [{ professorId: "prof-oyama", valor: 60 }],
      sobraAposProfessores: 30,
    })
  })

  it("preserva repasse pelo snapshot da mensalidade mesmo após nova modalidade interna", () => {
    const snapshot = lerRepasseSnapshotMensalidade([
      {
        modalidadeId: "kickboxing",
        modalidadeNome: "Kickboxing",
        professorId: "prof-vinicius",
        professorNome: "Vinicius de Oliveira",
        plataformaExterna: "WELLHUB",
        valorBase: 100,
      },
      {
        modalidadeId: "muay-thai-oyama",
        modalidadeNome: "Muay Thai Oyama",
        professorId: "prof-oyama",
        professorNome: "Oyama",
        plataformaExterna: null,
        valorBase: 100,
      },
    ])
    const itens = snapshot
      .filter((item) => !item.plataformaExterna)
      .map((item) => ({
        professorId: item.professorId ?? "pendencia",
        professorNome: item.professorNome,
        modalidadeId: item.modalidadeId,
        modalidadeNome: item.modalidadeNome,
        valorBase: item.valorBase,
      }))

    expect(
      calcularRepasseFinanceiro({
        valorRecebido: 90,
        itens,
      }),
    ).toMatchObject({
      professores: [{ professorId: "prof-oyama", valor: 60 }],
      sobraAposProfessores: 30,
    })
  })
})

describe("calcularDistribuicaoSobraFinanceira", () => {
  it("desconta os custos fixos e divide o saldo igualmente em três partes", () => {
    expect(
      calcularDistribuicaoSobraFinanceira({
        totalRecebido: 6000,
        totalProfessores: 3000,
      }),
    ).toEqual({
      sobraAposProfessores: 3000,
      custosFixos: 2670,
      saldoAposCustosFixos: 330,
      valorDistribuivel: 330,
      caixaInvestimento: 110,
      socioA: 110,
      socioB: 110,
    })
  })

  it("expõe o déficit e zera as três partes quando a sobra não cobre os custos fixos", () => {
    expect(
      calcularDistribuicaoSobraFinanceira({
        totalRecebido: 4000,
        totalProfessores: 2000,
      }),
    ).toEqual({
      sobraAposProfessores: 2000,
      custosFixos: 2670,
      saldoAposCustosFixos: -670,
      valorDistribuivel: 0,
      caixaInvestimento: 0,
      socioA: 0,
      socioB: 0,
    })
  })

  it("considera o custo fixo quitado quando o saldo é exatamente zero", () => {
    expect(
      calcularDistribuicaoSobraFinanceira({
        totalRecebido: 3670,
        totalProfessores: 1000,
      }),
    ).toMatchObject({
      saldoAposCustosFixos: 0,
      caixaInvestimento: 0,
      socioA: 0,
      socioB: 0,
    })
  })

  it("preserva todos os centavos na divisão em três partes", () => {
    const resultado = calcularDistribuicaoSobraFinanceira({
      totalRecebido: 2670.01,
      totalProfessores: 0,
    })

    expect(resultado).toMatchObject({
      saldoAposCustosFixos: 0.01,
      caixaInvestimento: 0.01,
      socioA: 0,
      socioB: 0,
    })
    expect(resultado.caixaInvestimento + resultado.socioA + resultado.socioB).toBe(
      resultado.valorDistribuivel,
    )
  })
})

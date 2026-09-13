import { describe, expect, it } from "vitest"
import {
  atualizarVencimentosMensalidadesAluno,
  calcularComposicaoRepasseProfessor,
  calcularDistribuicaoSobraFinanceira,
  calcularRepasseExternoMensal,
  calcularRepasseFinanceiro,
  consolidarReceitasExternasMensais,
  consolidarReceitasWellhubMensais,
  gerarLembretesFinanceiros,
  lerRepasseSnapshotMensalidade,
  mensagemInadimplenciaMensalidade,
  mensagemInadimplenciaMensalidadeAluno,
  mensagemLembretePagamentoMensalidadeAluno,
  mensagemLembreteVencimentoMensalidade,
  mensagemPagamentoAvulso,
  mensagemStatusMensalidade,
  mensalidadeBloqueiaTreino,
  mensalistaAdimplente,
  modalidadesExternasParaRepasse,
  modalidadesMensalidadeInterna,
  modalidadesWellhubParaRepasse,
  registrarMensalidadeInicialPaga,
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

describe("registrarMensalidadeInicialPaga", () => {
  it("gera e baixa a competência atual na mesma transação", async () => {
    const logs: Array<Record<string, unknown>> = []
    const notificacoes: Array<Record<string, unknown>> = []
    const mensalidadeAberta = {
      id: "mensalidade-1",
      alunoId: "aluno-1",
      planoId: "plano-1",
      competencia: "2026-08",
      valor: 250,
      vencimento: new Date("2026-08-10T12:00:00Z"),
      status: "EM_ABERTO",
      pagoEm: null,
      formaPagamento: null,
      observacao: null,
      repasseSnapshot: null,
      atualizadoEm: new Date("2026-08-27T14:00:00Z"),
    }
    let buscasMensalidade = 0
    let mensalidadePersistida = mensalidadeAberta
    const cliente = {
      $queryRaw: async () => [{ id: "mensalidade-1" }],
      aluno: {
        findUnique: async () => ({
          id: "aluno-1",
          usuarioId: "usuario-1",
          diaVencimento: 10,
          plano: { id: "plano-1", valor: 250 },
          modalidadesPlano: [
            {
              plataformaExterna: null,
              modalidade: {
                id: "modalidade-1",
                nome: "Jiu-Jitsu",
                valorRepasseProfessor: 50,
                turmas: [
                  {
                    professorId: "professor-1",
                    professor: { usuario: { nome: "Professor ECVO" } },
                  },
                ],
              },
            },
          ],
        }),
        updateMany: async () => ({ count: 0 }),
      },
      configuracaoAcademia: {
        findUnique: async (params: { select: Record<string, boolean> }) =>
          "valorBaseModalidade" in params.select
            ? { valorBaseModalidade: 100 }
            : { notificarFinanceiro: true },
      },
      mensalidade: {
        findUnique: async () => {
          buscasMensalidade += 1
          if (buscasMensalidade === 1) return null
          return {
            ...mensalidadePersistida,
            aluno: { usuarioId: "usuario-1", usuario: { nome: "Aluno ECVO" } },
          }
        },
        create: async (params: { data: Record<string, unknown> }) => {
          mensalidadePersistida = { ...mensalidadeAberta, ...params.data } as never
          return mensalidadePersistida
        },
        update: async (params: { data: Record<string, unknown> }) => {
          mensalidadePersistida = { ...mensalidadePersistida, ...params.data } as never
          return mensalidadePersistida
        },
        updateMany: async (params: { data: Record<string, unknown> }) => {
          mensalidadePersistida = { ...mensalidadePersistida, ...params.data } as never
          return { count: 1 }
        },
        findUniqueOrThrow: async () => mensalidadePersistida,
        findFirst: async () => null,
      },
      cobrancaAsaas: {
        findMany: async () => [],
        updateMany: async () => ({ count: 0 }),
      },
      logAuditoria: {
        create: async (params: { data: Record<string, unknown> }) => {
          logs.push(params.data)
          return params.data
        },
      },
      notificacao: {
        create: async (params: { data: Record<string, unknown> }) => {
          notificacoes.push(params.data)
          return { id: `notificacao-${notificacoes.length}`, ...params.data }
        },
      },
    } as never

    const resultado = await registrarMensalidadeInicialPaga(cliente, {
      alunoId: "aluno-1",
      competenciaEsperada: "2026-08",
      pagoEm: new Date("2026-08-27T12:00:00Z"),
      formaPagamento: "Pix",
      observacao: "Pago na matrícula",
      autorId: "gestor-1",
      agora: new Date("2026-08-27T15:00:00Z"),
    })

    expect(resultado).toMatchObject({
      ok: true,
      mensalidade: {
        competencia: "2026-08",
        status: "PAGA",
        pagoEm: new Date("2026-08-27T12:00:00Z"),
        formaPagamento: "Pix",
        observacao: "Pago na matrícula",
      },
    })
    expect(logs).toHaveLength(2)
    expect(resultado.ok && resultado.mensalidade.repasseSnapshot).toEqual([
      {
        modalidadeId: "modalidade-1",
        modalidadeNome: "Jiu-Jitsu",
        professorId: "professor-1",
        professorNome: "Professor ECVO",
        plataformaExterna: null,
        valorBase: 100,
        valorRepasseProfessor: 50,
      },
    ])
    expect(notificacoes).toEqual([
      expect.objectContaining({ titulo: "Nova mensalidade disponível" }),
      expect.objectContaining({ titulo: "Pagamento confirmado" }),
    ])
  })

  it("rejeita se a competência exibida ficou desatualizada", async () => {
    const resultado = await registrarMensalidadeInicialPaga({} as never, {
      alunoId: "aluno-1",
      competenciaEsperada: "2026-07",
      pagoEm: new Date("2026-08-27T12:00:00Z"),
      autorId: "gestor-1",
      agora: new Date("2026-08-27T15:00:00Z"),
    })

    expect(resultado).toEqual({
      ok: false,
      motivo: "A competência mudou. Atualize a página e informe o pagamento novamente.",
    })
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
          titulo: "Mensalidade em atraso",
          mensagem: expect.stringContaining(
            "Sua mensalidade de junho de 2026, no valor de R$ 250,00, venceu em 10/06/2026.",
          ),
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
      titulo: "Pagamento confirmado",
      mensagem: "A mensalidade de junho de 2026 foi paga.",
    })
    expect(mensagemStatusMensalidade({ competencia: "2026-06", status: "ISENTA" }).mensagem).toBe(
      "A mensalidade de junho de 2026 foi marcada como isenta.",
    )
  })
})

describe("gerarLembretesFinanceiros", () => {
  it("notifica gestores e professores dos próprios alunos sobre vencimento e inadimplência", async () => {
    const notificacoes: Array<{ data: { usuarioId: string; titulo: string } }> = []
    const buscasNotificacao: Array<{
      where: { OR: Array<{ titulo: string; mensagem: string }> }
    }> = []
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
            if (params.where.vencimento.gte.getUTCDate() === 16) {
              return [
                {
                  id: "mensalidade-lembrete-pagamento",
                  alunoId: "aluno-lembrete-pagamento",
                  competencia: "2026-06",
                  vencimento: new Date("2026-06-16T12:00:00Z"),
                  valor: 275,
                  aluno: { usuario: { id: "usuario-aluno-1" } },
                },
              ]
            }
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
        findFirst: async (params: {
          where: { OR: Array<{ titulo: string; mensagem: string }> }
        }) => {
          buscasNotificacao.push(params)
          return null
        },
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
      mensalidadesComLembretePagamento: 1,
      mensalidadesInadimplentes: 1,
      lembretesCriados: 2,
      lembretesPagamentoCriados: 1,
      inadimplenciasCriadas: 3,
      totalCriado: 6,
    })
    expect(professoresBuscados).toHaveLength(2)
    expect(buscasNotificacao.flatMap((busca) => busca.where.OR)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ titulo: "Sua mensalidade vence em 5 dias" }),
        expect.objectContaining({ titulo: "Mensalidade vence amanhã" }),
        expect.objectContaining({ titulo: "Mensalidade inadimplente" }),
      ]),
    )
    expect(notificacoes.map((notificacao) => notificacao.data)).toEqual([
      expect.objectContaining({
        usuarioId: "usuario-aluno-1",
        titulo: "Mensalidade vence em 5 dias",
      }),
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
        titulo: "Mensalidade em atraso",
      }),
      expect.objectContaining({
        usuarioId: "usuario-professor-1",
        titulo: "Mensalidade em atraso",
      }),
      expect.objectContaining({
        usuarioId: "usuario-professor-2",
        titulo: "Mensalidade em atraso",
      }),
    ])
  })
})

describe("mensagens de lembrete financeiro", () => {
  it("gera lembrete de pagamento para o aluno cinco dias antes do vencimento", () => {
    const mensagem = mensagemLembretePagamentoMensalidadeAluno({
      competencia: "2026-06",
      vencimento: new Date("2026-06-16T12:00:00Z"),
      valor: 275,
    })
    expect(mensagem.titulo).toBe("Mensalidade vence em 5 dias")
    expect(mensagem.mensagem).toContain("mensalidade de junho de 2026")
    expect(mensagem.mensagem).toContain("vence em 16/06/2026")
    expect(mensagem.mensagem).toContain("275,00")
    expect(mensagem.mensagem).toContain("O pagamento via Pix está disponível no financeiro.")
  })

  it("gera lembrete de vencimento no padrão pt-BR", () => {
    const mensagem = mensagemLembreteVencimentoMensalidade({
      alunoNome: "Ana Silva",
      competencia: "2026-06",
      vencimento: new Date("2026-06-10T12:00:00Z"),
      valor: 250,
    })
    expect(mensagem.titulo).toBe("Mensalidade vence amanhã")
    expect(mensagem.mensagem).toContain("Ana Silva: mensalidade de junho de 2026")
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
    expect(mensagem.titulo).toBe("Mensalidade em atraso")
    expect(mensagem.mensagem).toContain("Ana Silva: mensalidade de junho de 2026")
    expect(mensagem.mensagem).toContain("vencida em 10/06/2026")
    expect(mensagem.mensagem).toContain("250,00")
  })

  it("gera alerta de inadimplência para o aluno sem repetir o próprio nome", () => {
    const mensagem = mensagemInadimplenciaMensalidadeAluno({
      competencia: "2026-06",
      vencimento: new Date("2026-06-10T12:00:00Z"),
      valor: 250,
    })
    expect(mensagem).toEqual({
      titulo: "Mensalidade em atraso",
      mensagem: expect.stringContaining(
        "Sua mensalidade de junho de 2026, no valor de R$ 250,00, venceu em 10/06/2026.",
      ),
    })
    expect(mensagem.mensagem).toContain("250,00")
  })
})

describe("mensagemPagamentoAvulso", () => {
  it("gera mensagem financeira para pagamento avulso", () => {
    const mensagem = mensagemPagamentoAvulso({ tipo: "EXAME", valor: 150, descricao: "Faixa azul" })
    expect(mensagem.titulo).toBe("Pagamento registrado")
    expect(mensagem.mensagem).toContain("Exame:")
    expect(mensagem.mensagem).toContain("150,00")
    expect(mensagem.mensagem).toContain("Faixa azul")
  })
})

describe("modalidadesWellhubParaRepasse", () => {
  it("usa cadastro de aluno Wellhub legado sem vínculos de plano", () => {
    expect(
      modalidadesWellhubParaRepasse({
        tipo: "WELLHUB",
        modalidadesPlano: [],
        modalidades: ["kickboxing"],
      }),
    ).toEqual(["kickboxing"])
  })

  it("prioriza vínculos explícitos e exclui modalidades pagas internamente ou por TotalPass", () => {
    expect(
      modalidadesWellhubParaRepasse({
        tipo: "WELLHUB",
        modalidadesPlano: [
          { plataformaExterna: "WELLHUB", modalidade: "kickboxing" },
          { plataformaExterna: null, modalidade: "muay-thai" },
          { plataformaExterna: "TOTALPASS", modalidade: "boxe" },
        ],
        modalidades: ["kickboxing", "muay-thai", "boxe", "jiu-jitsu"],
      }),
    ).toEqual(["kickboxing"])
  })

  it("não usa cadastro legado quando existe somente vínculo explícito de outra forma de pagamento", () => {
    expect(
      modalidadesWellhubParaRepasse({
        tipo: "WELLHUB",
        modalidadesPlano: [{ plataformaExterna: null, modalidade: "kickboxing" }],
        modalidades: ["kickboxing"],
      }),
    ).toEqual([])
  })

  it("não presume Wellhub para outro tipo de aluno sem vínculo explícito", () => {
    expect(
      modalidadesWellhubParaRepasse({
        tipo: "TOTALPASS",
        modalidadesPlano: [],
        modalidades: ["kickboxing"],
      }),
    ).toEqual([])
  })
})

describe("consolidarReceitasWellhubMensais", () => {
  it("separa competências e alunos, preservando valores monetários exatos", () => {
    const receitas = consolidarReceitasWellhubMensais([
      { alunoId: "aluno-a", competencia: "2026-08", valorRepasse: 12.34 },
      { alunoId: "aluno-a", competencia: "2026-08", valorRepasse: 0.01 },
      { alunoId: "aluno-a", competencia: "2026-09", valorRepasse: 50 },
      { alunoId: "aluno-b", competencia: "2026-08", valorRepasse: 70 },
    ])
    expect(
      receitas.map(({ alunoId, competencia, valorRecebido }) => ({
        alunoId,
        competencia,
        valorRecebido,
      })),
    ).toEqual([
      { alunoId: "aluno-a", competencia: "2026-08", valorRecebido: 12.35 },
      { alunoId: "aluno-a", competencia: "2026-09", valorRecebido: 50 },
      { alunoId: "aluno-b", competencia: "2026-08", valorRecebido: 70 },
    ])
  })

  it.each([
    { alunoId: "", competencia: "2026-08", valorRepasse: 10 },
    { alunoId: "a", competencia: "2026-13", valorRepasse: 10 },
    { alunoId: "a", competencia: "2026-08", valorRepasse: -1 },
    { alunoId: "a", competencia: "2026-08", valorRepasse: Number.NaN },
  ])("rejeita receita sem identificação, competência ou valor válidos: %o", (receita) => {
    expect(() => consolidarReceitasWellhubMensais([receita])).toThrow()
  })
})

describe("exclusões de repasse externo por competência", () => {
  const itens = [
    { professorId: "vinicius", modalidadeId: "kickboxing", valorRepasseProfessor: 60 },
    { professorId: "oyama", modalidadeId: "muay-thai", valorRepasseProfessor: 50 },
  ]
  const exclusao = {
    competencia: "2026-08",
    plataforma: "WELLHUB" as const,
    alunoId: "aluno-a",
    modalidadeId: "muay-thai",
    professorId: "oyama",
  }
  const params = { ...exclusao, valorRecebido: 75, itens, exclusoes: [exclusao] }

  it("soma as duas contas e recalcula apenas Kickboxing sem perder receita", () => {
    const [grupo] = consolidarReceitasExternasMensais([
      { ...exclusao, valorRepasse: 54 },
      { ...exclusao, valorRepasse: 21 },
    ])
    expect(
      calcularRepasseExternoMensal({ ...params, valorRecebido: grupo.valorRecebido }),
    ).toMatchObject({
      valorRecebido: 75,
      professores: [{ professorId: "vinicius", valor: 45 }],
      sobraAposProfessores: 30,
      modalidadesExcluidas: [itens[1]],
    })
  })

  it("mantém o teto do Kickboxing para receita de R$ 193,50", () => {
    expect(calcularRepasseExternoMensal({ ...params, valorRecebido: 193.5 })).toMatchObject({
      valorRecebido: 193.5,
      professores: [{ professorId: "vinicius", valor: 60 }],
      sobraAposProfessores: 133.5,
    })
  })

  it.each([
    { competencia: "2026-09" },
    { plataforma: "TOTALPASS" as const },
    { alunoId: "outro-aluno" },
  ])("não aplica a exceção fora do mês, plataforma ou aluno: %o", (escopo) => {
    const resultado = calcularRepasseExternoMensal({ ...params, ...escopo })
    expect(resultado.professores).toMatchObject([
      { professorId: "vinicius", valor: 24.55 },
      { professorId: "oyama", valor: 20.45 },
    ])
    expect(resultado.modalidadesExcluidas).toEqual([])
  })

  it.each([
    { professorId: "outro-professor" },
    { modalidadeId: "outra-modalidade" },
  ])("exige correspondência exata de professor e modalidade: %o", (destino) => {
    expect(
      calcularRepasseExternoMensal({ ...params, exclusoes: [{ ...exclusao, ...destino }] })
        .professores,
    ).toHaveLength(2)
  })

  it("preserva outra modalidade do mesmo professor", () => {
    const resultado = calcularRepasseExternoMensal({
      ...params,
      itens: [itens[1], { ...itens[1], modalidadeId: "boxe" }],
    })
    expect(resultado.professores).toMatchObject([
      { professorId: "oyama", valor: 45, modalidades: [{ modalidadeId: "boxe" }] },
    ])
  })

  it("mantém toda a receita no caixa se todas as modalidades forem explicitamente excluídas", () => {
    expect(calcularRepasseExternoMensal({ ...params, itens: [itens[1]] })).toMatchObject({
      valorRecebido: 75,
      professores: [],
      sobraAposProfessores: 75,
    })
    expect(() => calcularRepasseExternoMensal({ ...params, itens: [] })).toThrow(
      "Informe ao menos uma modalidade",
    )
  })

  it("não interfere no cálculo da mensalidade interna já paga", () => {
    calcularRepasseExternoMensal(params)
    expect(
      calcularRepasseFinanceiro({
        valorRecebido: 90,
        politica: "MENSALIDADE_INTERNA",
        itens: [{ professorId: "oyama", modalidadeId: "muay-thai", valorBase: 100 }],
      }),
    ).toMatchObject({ professores: [{ professorId: "oyama", valor: 60 }] })
    expect(params.itens).toEqual(itens)
  })
})

describe("calcularRepasseFinanceiro", () => {
  it("soma duas contas Wellhub antes de aplicar os tetos mensais de R$ 60 e R$ 50", () => {
    const [receita] = consolidarReceitasWellhubMensais([
      { alunoId: "aluno-a", competencia: "2026-08", valorRepasse: 120, unidade: "conta-1" },
      { alunoId: "aluno-a", competencia: "2026-08", valorRepasse: 80, unidade: "conta-2" },
    ])
    expect(receita.valorRecebido).toBe(200)
    expect(receita.registros).toHaveLength(2)
    expect(
      calcularRepasseFinanceiro({
        valorRecebido: receita.valorRecebido,
        politica: "WELLHUB_MENSAL",
        itens: [
          { professorId: "prof-a", modalidadeId: "kickboxing", valorRepasseProfessor: 60 },
          { professorId: "prof-b", modalidadeId: "muay-thai", valorRepasseProfessor: 50 },
        ],
      }),
    ).toMatchObject({
      professores: [
        { professorId: "prof-a", valor: 60 },
        { professorId: "prof-b", valor: 50 },
      ],
      sobraAposProfessores: 90,
    })
  })

  it("mantém R$ 30 para professor e R$ 20 para escola quando Wellhub gera R$ 50 e teto é R$ 60", () => {
    expect(
      calcularRepasseFinanceiro({
        valorRecebido: 50,
        politica: "WELLHUB_MENSAL",
        itens: [{ professorId: "prof-a", valorRepasseProfessor: 60 }],
      }),
    ).toMatchObject({ professores: [{ valor: 30 }], sobraAposProfessores: 20 })
  })

  it("rateia 60% da receita insuficiente proporcionalmente aos tetos das modalidades", () => {
    expect(
      calcularRepasseFinanceiro({
        valorRecebido: 55,
        politica: "WELLHUB_MENSAL",
        itens: [
          { professorId: "prof-a", valorRepasseProfessor: 60 },
          { professorId: "prof-b", valorRepasseProfessor: 50 },
        ],
      }),
    ).toMatchObject({
      professores: [{ valor: 18 }, { valor: 15 }],
      sobraAposProfessores: 22,
    })
  })

  it("não aumenta o teto mensal ao receber muito mais que a mensalidade", () => {
    expect(
      calcularRepasseFinanceiro({
        valorRecebido: 1000,
        politica: "WELLHUB_MENSAL",
        itens: [{ professorId: "prof-a", valorRepasseProfessor: 50 }],
      }),
    ).toMatchObject({ professores: [{ valor: 50 }], sobraAposProfessores: 950 })
  })

  it("agrega modalidades do mesmo professor sem duplicar o total e conserva centavos", () => {
    const resultado = calcularRepasseFinanceiro({
      valorRecebido: 100.01,
      politica: "WELLHUB_MENSAL",
      itens: [
        { professorId: "prof-a", modalidadeId: "kickboxing", valorRepasseProfessor: 60 },
        { professorId: "prof-a", modalidadeId: "muay-thai", valorRepasseProfessor: 50 },
      ],
    })
    expect(resultado.professores).toHaveLength(1)
    expect(resultado.professores[0].valor).toBe(60.01)
    expect(resultado.professores[0].modalidades.map((item) => item.valor)).toEqual([32.73, 27.28])
    expect(resultado.sobraAposProfessores).toBe(40)
  })

  it("usa o valor configurado para cada modalidade no repasse interno", () => {
    expect(
      calcularRepasseFinanceiro({
        valorRecebido: 110,
        itens: [
          {
            professorId: "prof-kickboxing",
            modalidadeId: "kickboxing",
            valorRepasseProfessor: 60,
          },
          {
            professorId: "prof-muay-thai",
            modalidadeId: "muay-thai",
            valorRepasseProfessor: 50,
          },
        ],
      }),
    ).toMatchObject({
      professores: [
        { professorId: "prof-kickboxing", valor: 60 },
        { professorId: "prof-muay-thai", valor: 50 },
      ],
      sobraAposProfessores: 0,
    })
  })

  it("reduz proporcionalmente os valores configurados quando a arrecadação é parcial", () => {
    expect(
      calcularRepasseFinanceiro({
        valorRecebido: 55,
        itens: [
          { professorId: "prof-kickboxing", valorRepasseProfessor: 60 },
          { professorId: "prof-muay-thai", valorRepasseProfessor: 50 },
        ],
      }),
    ).toMatchObject({
      professores: [
        { professorId: "prof-kickboxing", valor: 30 },
        { professorId: "prof-muay-thai", valor: 25 },
      ],
      sobraAposProfessores: 0,
    })
  })

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
        itens: [
          {
            professorId: "prof-a",
            modalidadeId: "kickboxing",
            valorRepasseProfessor: 50,
          },
        ],
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
        valorRepasseProfessor: 50,
      },
      {
        modalidadeId: "muay-thai-oyama",
        modalidadeNome: "Muay Thai Oyama",
        professorId: "prof-oyama",
        professorNome: "Oyama",
        plataformaExterna: null,
        valorBase: 100,
        valorRepasseProfessor: 50,
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
        valorRepasseProfessor: item.valorRepasseProfessor,
      }))

    expect(
      calcularRepasseFinanceiro({
        valorRecebido: 90,
        itens,
      }),
    ).toMatchObject({
      professores: [{ professorId: "prof-oyama", valor: 50 }],
      sobraAposProfessores: 40,
    })
  })
})

describe("calcularComposicaoRepasseProfessor", () => {
  it("considera concluído apenas o valor efetivamente repassado pelo split", () => {
    expect(
      calcularComposicaoRepasseProfessor({
        direitoTotal: 50,
        splits: [{ valor: 50, status: "CONCLUIDO" }],
      }),
    ).toEqual({
      direitoTotal: 50,
      splitConcluido: 50,
      splitEmProcessamento: 0,
      repasseManual: 0,
    })
  })

  it("separa split em processamento para impedir repasse manual duplicado", () => {
    for (const status of ["PREPARADO", "PENDENTE", "AGUARDANDO_CREDITO", "PROCESSANDO"] as const) {
      expect(
        calcularComposicaoRepasseProfessor({
          direitoTotal: 60,
          splits: [{ valor: 60, status }],
        }),
      ).toMatchObject({
        splitConcluido: 0,
        splitEmProcessamento: 60,
        repasseManual: 0,
      })
    }
  })

  it("direciona ao repasse manual quando não existe split", () => {
    expect(calcularComposicaoRepasseProfessor({ direitoTotal: 50, splits: [] })).toMatchObject({
      splitConcluido: 0,
      splitEmProcessamento: 0,
      repasseManual: 50,
    })
  })

  it("direciona ao repasse manual os splits com falha ou encerrados sem crédito", () => {
    for (const status of ["BLOQUEADO", "CANCELADO", "RECUSADO", "ESTORNADO", "ERRO"] as const) {
      expect(
        calcularComposicaoRepasseProfessor({
          direitoTotal: 50,
          splits: [{ valor: 50, status }],
        }),
      ).toMatchObject({
        splitConcluido: 0,
        splitEmProcessamento: 0,
        repasseManual: 50,
      })
    }
  })

  it("mantém no manual somente o saldo não coberto pelo split", () => {
    expect(
      calcularComposicaoRepasseProfessor({
        direitoTotal: 60,
        splits: [
          { valor: 20, status: "CONCLUIDO" },
          { valor: 15, status: "PROCESSANDO" },
          { valor: 25, status: "RECUSADO" },
        ],
      }),
    ).toEqual({
      direitoTotal: 60,
      splitConcluido: 20,
      splitEmProcessamento: 15,
      repasseManual: 25,
    })
  })
})

describe("calcularDistribuicaoSobraFinanceira", () => {
  it("usa o custo configurado do mês inclusive quando todos os custos são zero", () => {
    expect(
      calcularDistribuicaoSobraFinanceira({
        totalRecebido: 6000,
        totalProfessores: 3000,
        custosFixos: 2400,
      }),
    ).toMatchObject({
      custosFixos: 2400,
      saldoAposCustosFixos: 600,
      caixaInvestimento: 200,
      socioA: 200,
      socioB: 200,
    })
    expect(
      calcularDistribuicaoSobraFinanceira({
        totalRecebido: 6000,
        totalProfessores: 3000,
        custosFixos: 0,
      }),
    ).toMatchObject({
      custosFixos: 0,
      saldoAposCustosFixos: 3000,
      caixaInvestimento: 1000,
      socioA: 1000,
      socioB: 1000,
    })
  })

  it("desconta os custos fixos e divide o saldo igualmente em três partes", () => {
    expect(
      calcularDistribuicaoSobraFinanceira({
        totalRecebido: 6000,
        totalProfessores: 3000,
      }),
    ).toEqual({
      sobraAposProfessores: 3000,
      custosFixos: 2640,
      saldoAposCustosFixos: 360,
      valorDistribuivel: 360,
      caixaInvestimento: 120,
      socioA: 120,
      socioB: 120,
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
      custosFixos: 2640,
      saldoAposCustosFixos: -640,
      valorDistribuivel: 0,
      caixaInvestimento: 0,
      socioA: 0,
      socioB: 0,
    })
  })

  it("considera o custo fixo quitado quando o saldo é exatamente zero", () => {
    expect(
      calcularDistribuicaoSobraFinanceira({
        totalRecebido: 3640,
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
      totalRecebido: 2640.01,
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

describe("resumo mensal TotalPass", () => {
  it("consolida valores líquidos exatos e separa alunos, competências e plataformas", () => {
    const receitas = consolidarReceitasExternasMensais([
      ...[30.39, 30.39, 70.91, 20.26, 60.78, 10.13].map((valorRepasse) => ({
        plataforma: "TOTALPASS" as const,
        alunoId: "aluno-a",
        competencia: "2026-08",
        valorRepasse,
      })),
      { plataforma: "WELLHUB", alunoId: "aluno-a", competencia: "2026-08", valorRepasse: 200 },
      { plataforma: "TOTALPASS", alunoId: "aluno-b", competencia: "2026-08", valorRepasse: 30 },
      { plataforma: "TOTALPASS", alunoId: "aluno-a", competencia: "2026-09", valorRepasse: 40 },
    ])
    expect(
      receitas.map(({ plataforma, alunoId, competencia, valorRecebido }) => ({
        plataforma,
        alunoId,
        competencia,
        valorRecebido,
      })),
    ).toEqual([
      {
        plataforma: "TOTALPASS",
        alunoId: "aluno-a",
        competencia: "2026-08",
        valorRecebido: 222.86,
      },
      { plataforma: "WELLHUB", alunoId: "aluno-a", competencia: "2026-08", valorRecebido: 200 },
      { plataforma: "TOTALPASS", alunoId: "aluno-b", competencia: "2026-08", valorRecebido: 30 },
      { plataforma: "TOTALPASS", alunoId: "aluno-a", competencia: "2026-09", valorRecebido: 40 },
    ])
    expect(receitas[0].registros).toHaveLength(6)
  })

  it("aplica somente modalidades TotalPass explícitas e usa legado apenas sem nenhum vínculo", () => {
    const aluno = {
      tipo: "TOTALPASS" as const,
      modalidades: ["kickboxing", "boxe"],
      modalidadesPlano: [],
    }
    expect(modalidadesExternasParaRepasse(aluno, "TOTALPASS")).toEqual(["kickboxing", "boxe"])
    expect(modalidadesExternasParaRepasse(aluno, "WELLHUB")).toEqual([])
    expect(
      modalidadesExternasParaRepasse(
        {
          ...aluno,
          modalidadesPlano: [
            { plataformaExterna: "TOTALPASS", modalidade: "boxe" },
            { plataformaExterna: "WELLHUB", modalidade: "kickboxing" },
            { plataformaExterna: null, modalidade: "muay-thai" },
          ],
        },
        "TOTALPASS",
      ),
    ).toEqual(["boxe"])
    expect(
      modalidadesExternasParaRepasse(
        { ...aluno, modalidadesPlano: [{ plataformaExterna: null, modalidade: "boxe" }] },
        "TOTALPASS",
      ),
    ).toEqual([])
  })

  it.each([
    [200, 110, 90],
    [50, 30, 20],
    [60, 36, 24],
    [222.86, 110, 112.86],
  ])("limita 60%% de R$ %s ao teto das modalidades", (receita, professores, sobra) => {
    const resultado = calcularRepasseFinanceiro({
      valorRecebido: receita,
      politica: "REPASSE_EXTERNO_MENSAL",
      itens: [
        { professorId: "prof-a", valorRepasseProfessor: 60 },
        { professorId: "prof-b", valorRepasseProfessor: 50 },
      ],
    })
    expect(
      resultado.professores.reduce((total, item) => total + Math.round(item.valor * 100), 0),
    ).toBe(Math.round(professores * 100))
    expect(resultado.sobraAposProfessores).toBe(sobra)
    expect(resultado.professores[0].valor).toBeLessThanOrEqual(60)
    expect(resultado.professores[1].valor).toBeLessThanOrEqual(50)
  })
})

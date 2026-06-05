import { describe, expect, it } from "vitest"
import {
  calcularRepasseFinanceiro,
  mensagemInadimplenciaMensalidade,
  mensagemLembreteVencimentoMensalidade,
  mensagemPagamentoAvulso,
  mensagemStatusMensalidade,
  mensalistaAdimplente,
  statusMensalidadeEfetivo,
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
  it("é falso quando há mensalidade vencida ou em aberto", () => {
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

describe("mensagens de lembrete financeiro para gestores", () => {
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
  it("divide preço cheio em 60% professor, 20% sócio A e 20% sócio B", () => {
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
      socioA: 20,
      socioB: 20,
    })
  })

  it("mantém professores no valor cheio e sócios absorvem desconto de duas modalidades", () => {
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
      socioA: 27.5,
      socioB: 27.5,
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
    expect(resultado.socioA).toBe(27.5)
    expect(resultado.socioB).toBe(27.5)
  })

  it("direciona arrecadação parcial inteira ao professor até atingir o teto", () => {
    expect(
      calcularRepasseFinanceiro({
        valorRecebido: 40,
        itens: [{ professorId: "prof-a", modalidadeId: "kickboxing" }],
      }),
    ).toMatchObject({
      professores: [{ professorId: "prof-a", valor: 40 }],
      socioA: 0,
      socioB: 0,
    })
  })

  it("divide repasse Wellhub/TotalPass diretamente em 60/20/20", () => {
    expect(
      calcularRepasseFinanceiro({
        valorRecebido: 90,
        politica: "REPASSE_EXTERNO",
        itens: [{ professorId: "prof-a", modalidadeId: "kickboxing" }],
      }),
    ).toMatchObject({
      professores: [{ professorId: "prof-a", valor: 54 }],
      socioA: 18,
      socioB: 18,
    })
  })

  it("aplica 60/20/20 no repasse externo mesmo abaixo do teto do professor", () => {
    expect(
      calcularRepasseFinanceiro({
        valorRecebido: 40,
        politica: "REPASSE_EXTERNO",
        itens: [{ professorId: "prof-a", modalidadeId: "kickboxing" }],
      }),
    ).toMatchObject({
      professores: [{ professorId: "prof-a", valor: 24 }],
      socioA: 8,
      socioB: 8,
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
      socioA: 0,
      socioB: 0,
    })
  })
})

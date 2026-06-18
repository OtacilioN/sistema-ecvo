import { describe, expect, it } from "vitest"
import {
  bloqueiaComparecimentoPorFinanceiro,
  podeCancelarComparecimento,
  podeMarcarComparecimento,
  podeMarcarNoShow,
  statusAoMarcarComparecimento,
  temVaga,
} from "./comparecimento.service"

const inicioAula = new Date("2026-06-10T19:00:00Z")

describe("podeMarcarComparecimento", () => {
  it("permite dentro da janela de 24h", () => {
    const agora = new Date("2026-06-10T10:00:00Z") // 9h antes
    expect(podeMarcarComparecimento({ agora, inicioAula, janelaHoras: 24 })).toBe(true)
  })
  it("bloqueia antes de a janela abrir", () => {
    const agora = new Date("2026-06-08T19:00:00Z") // 48h antes
    expect(podeMarcarComparecimento({ agora, inicioAula, janelaHoras: 24 })).toBe(false)
  })
  it("bloqueia depois de a aula começar", () => {
    const agora = new Date("2026-06-10T19:00:01Z")
    expect(podeMarcarComparecimento({ agora, inicioAula, janelaHoras: 24 })).toBe(false)
  })
})

describe("podeCancelarComparecimento", () => {
  it("permite até o prazo (2h antes)", () => {
    const agora = new Date("2026-06-10T16:00:00Z") // 3h antes
    expect(podeCancelarComparecimento({ agora, inicioAula, prazoHoras: 2 })).toBe(true)
  })
  it("bloqueia dentro do prazo", () => {
    const agora = new Date("2026-06-10T18:00:00Z") // 1h antes
    expect(podeCancelarComparecimento({ agora, inicioAula, prazoHoras: 2 })).toBe(false)
  })
})

describe("temVaga", () => {
  it("capacidade 0 = ilimitado", () => {
    expect(temVaga({ capacidade: 0, confirmados: 999 })).toBe(true)
  })
  it("bloqueia quando lotado", () => {
    expect(temVaga({ capacidade: 10, confirmados: 10 })).toBe(false)
    expect(temVaga({ capacidade: 10, confirmados: 9 })).toBe(true)
  })
})

describe("statusAoMarcarComparecimento", () => {
  it("confirma quando há vaga", () => {
    expect(
      statusAoMarcarComparecimento({
        capacidade: 10,
        confirmados: 9,
        listaEsperaAtiva: true,
      }),
    ).toBe("CONFIRMADO")
  })

  it("envia para lista de espera quando lotado e a lista está ativa", () => {
    expect(
      statusAoMarcarComparecimento({
        capacidade: 10,
        confirmados: 10,
        listaEsperaAtiva: true,
      }),
    ).toBe("LISTA_ESPERA")
  })

  it("bloqueia quando lotado e sem lista de espera", () => {
    expect(
      statusAoMarcarComparecimento({
        capacidade: 10,
        confirmados: 10,
        listaEsperaAtiva: false,
      }),
    ).toBeNull()
  })
})

describe("bloqueiaComparecimentoPorFinanceiro", () => {
  it.each([
    "TRANCADO",
    "CANCELADO",
  ] as const)("bloqueia aluno %s independentemente da política financeira", (statusAluno) => {
    expect(
      bloqueiaComparecimentoPorFinanceiro({
        statusAluno,
        tipoAluno: "MENSALISTA",
        mensalidadeInternaNaModalidade: false,
        mensalidadeEmDia: true,
        bloqueioInadimplencia: "APENAS_ALERTAR",
      }),
    ).toBe(true)
  })

  it("bloqueia mensalista inadimplente apenas na política de bloqueio de agendamento", () => {
    expect(
      bloqueiaComparecimentoPorFinanceiro({
        statusAluno: "ATIVO",
        tipoAluno: "MENSALISTA",
        mensalidadeInternaNaModalidade: true,
        mensalidadeEmDia: false,
        bloqueioInadimplencia: "BLOQUEAR_COMPARECIMENTO",
      }),
    ).toBe(true)

    expect(
      bloqueiaComparecimentoPorFinanceiro({
        statusAluno: "ATIVO",
        tipoAluno: "MENSALISTA",
        mensalidadeInternaNaModalidade: true,
        mensalidadeEmDia: false,
        bloqueioInadimplencia: "BLOQUEAR_CHECKIN",
      }),
    ).toBe(false)
  })

  it("bloqueia Wellhub apenas quando há plano mensal interno na modalidade", () => {
    expect(
      bloqueiaComparecimentoPorFinanceiro({
        statusAluno: "ATIVO",
        tipoAluno: "WELLHUB",
        mensalidadeInternaNaModalidade: true,
        mensalidadeEmDia: false,
        bloqueioInadimplencia: "BLOQUEAR_COMPARECIMENTO",
      }),
    ).toBe(true)

    expect(
      bloqueiaComparecimentoPorFinanceiro({
        statusAluno: "ATIVO",
        tipoAluno: "WELLHUB",
        mensalidadeInternaNaModalidade: false,
        mensalidadeEmDia: false,
        bloqueioInadimplencia: "BLOQUEAR_COMPARECIMENTO",
      }),
    ).toBe(false)
  })
})

describe("podeMarcarNoShow", () => {
  it("só permite após o fim da aula", () => {
    const fimAula = new Date("2026-06-10T20:30:00Z")
    expect(podeMarcarNoShow({ fimAula, agora: new Date("2026-06-10T20:29:59Z") })).toBe(false)
    expect(podeMarcarNoShow({ fimAula, agora: new Date("2026-06-10T20:30:00Z") })).toBe(true)
  })
})

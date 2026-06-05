import { describe, expect, it } from "vitest"
import {
  avaliarCheckin,
  type ContextoCheckin,
  checkinRetroativo,
  statusPresenca,
} from "./checkin.service"

const base: ContextoCheckin = {
  statusAluno: "ATIVO",
  tipoAluno: "MENSALISTA",
  aulaCancelada: false,
  jaTemCheckinValido: false,
  temComparecimento: true,
  capacidadeAula: 10,
  ocupacaoAula: 2,
  lancadoPorTerceiro: false,
  exigirComparecimento: false,
  politicaSemComparecimento: "PERMITIR",
  bloqueioInadimplencia: "APENAS_ALERTAR",
  mensalidadeInternaNaModalidade: true,
  mensalidadeEmDia: true,
}

describe("avaliarCheckin", () => {
  it("permite o caso feliz", () => {
    expect(avaliarCheckin(base)).toEqual({ ok: true })
  })

  it("bloqueia dupla contagem (RF-039)", () => {
    expect(avaliarCheckin({ ...base, jaTemCheckinValido: true })).toMatchObject({ ok: false })
  })

  it("bloqueia aula cancelada", () => {
    expect(avaliarCheckin({ ...base, aulaCancelada: true })).toMatchObject({ ok: false })
  })

  it.each([
    "INATIVO",
    "SUSPENSO",
    "CANCELADO",
    "TRANCADO",
  ] as const)("bloqueia aluno %s", (statusAluno) => {
    expect(avaliarCheckin({ ...base, statusAluno })).toMatchObject({ ok: false })
  })

  it("bloqueia inadimplente só quando a política é BLOQUEAR_CHECKIN", () => {
    const inadimplente = { ...base, mensalidadeEmDia: false }
    expect(avaliarCheckin({ ...inadimplente, bloqueioInadimplencia: "APENAS_ALERTAR" })).toEqual({
      ok: true,
    })
    expect(
      avaliarCheckin({ ...inadimplente, bloqueioInadimplencia: "BLOQUEAR_CHECKIN" }),
    ).toMatchObject({ ok: false })
  })

  it("não bloqueia Wellhub sem mensalidade interna na modalidade", () => {
    expect(
      avaliarCheckin({
        ...base,
        tipoAluno: "WELLHUB",
        mensalidadeInternaNaModalidade: false,
        mensalidadeEmDia: false,
        bloqueioInadimplencia: "BLOQUEAR_CHECKIN",
      }),
    ).toEqual({ ok: true })
  })

  it("bloqueia Wellhub com plano mensal interno na modalidade", () => {
    expect(
      avaliarCheckin({
        ...base,
        tipoAluno: "WELLHUB",
        mensalidadeInternaNaModalidade: true,
        mensalidadeEmDia: false,
        bloqueioInadimplencia: "BLOQUEAR_CHECKIN",
      }),
    ).toMatchObject({ ok: false })
  })

  it("bloqueia check-in sem comparecimento quando a aula está lotada (RF-020)", () => {
    expect(
      avaliarCheckin({
        ...base,
        temComparecimento: false,
        capacidadeAula: 10,
        ocupacaoAula: 10,
      }),
    ).toEqual({ ok: false, motivo: "Aula sem vagas disponíveis." })
  })

  it("permite check-in com reserva confirmada mesmo quando a ocupação alcançou a capacidade", () => {
    expect(avaliarCheckin({ ...base, capacidadeAula: 10, ocupacaoAula: 10 })).toEqual({ ok: true })
  })

  describe("comparecimento prévio (RF-022)", () => {
    const sem = { ...base, temComparecimento: false }
    it("PERMITIR libera sem comparecimento", () => {
      expect(avaliarCheckin({ ...sem, politicaSemComparecimento: "PERMITIR" })).toEqual({
        ok: true,
      })
    })
    it("BLOQUEAR exige comparecimento", () => {
      expect(avaliarCheckin({ ...sem, politicaSemComparecimento: "BLOQUEAR" })).toMatchObject({
        ok: false,
      })
    })
    it("exigirComparecimento força bloqueio", () => {
      expect(avaliarCheckin({ ...sem, exigirComparecimento: true })).toMatchObject({ ok: false })
    })
    it("APENAS_COM_APROVACAO deixa o aluno pendente e libera lançamento por terceiro", () => {
      expect(avaliarCheckin({ ...sem, politicaSemComparecimento: "APENAS_COM_APROVACAO" })).toEqual(
        { ok: true, pendenteRevisao: true },
      )
      expect(
        avaliarCheckin({
          ...sem,
          politicaSemComparecimento: "APENAS_COM_APROVACAO",
          lancadoPorTerceiro: true,
        }),
      ).toEqual({ ok: true })
    })
  })
})

describe("statusPresenca", () => {
  it("deriva o status de presença do check-in (RF-029)", () => {
    expect(statusPresenca(null)).toBe("AUSENTE")
    expect(statusPresenca({ status: "VALIDO" })).toBe("PRESENTE")
    expect(statusPresenca({ status: "PENDENTE_REVISAO" })).toBe("PENDENTE_REVISAO")
    expect(statusPresenca({ status: "INVALIDADO" })).toBe("INVALIDADO")
    expect(statusPresenca({ status: "EXCLUIDO" })).toBe("EXCLUIDO")
  })
})

describe("checkinRetroativo", () => {
  it("marca lançamento após o fim da aula como retroativo", () => {
    const fimAula = new Date("2026-06-10T20:30:00Z")
    expect(checkinRetroativo({ fimAula, agora: new Date("2026-06-10T20:30:00Z") })).toBe(false)
    expect(checkinRetroativo({ fimAula, agora: new Date("2026-06-10T20:30:01Z") })).toBe(true)
  })
})

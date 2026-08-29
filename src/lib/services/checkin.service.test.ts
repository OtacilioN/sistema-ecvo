import { describe, expect, it } from "vitest"
import {
  avaliarCheckin,
  type ContextoCheckin,
  checkinImpedeNovoRegistro,
  checkinRetroativo,
  conteudoNotificacaoCheckinRealizado,
  podeRealizarCheckinNaJanela,
  statusPresenca,
  usuarioProfessorResponsavelCheckin,
} from "./checkin.service"

const base: ContextoCheckin = {
  statusAluno: "ATIVO",
  tipoAluno: "MENSALISTA",
  possuiPlanoPagamento: true,
  modalidadeCobertaPeloPlano: true,
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
  termoResponsabilidadeAceito: true,
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

  it.each(["CANCELADO", "TRANCADO"] as const)("bloqueia aluno %s", (statusAluno) => {
    expect(avaliarCheckin({ ...base, statusAluno })).toMatchObject({ ok: false })
  })

  it("bloqueia mensalista sem aprovação completa e vínculo de plano", () => {
    expect(avaliarCheckin({ ...base, possuiPlanoPagamento: false })).toEqual({
      ok: false,
      motivo: "Matrícula pendente de aprovação e vínculo de plano.",
    })
    expect(avaliarCheckin({ ...base, modalidadeCobertaPeloPlano: false })).toEqual({
      ok: false,
      motivo: "Matrícula pendente de aprovação e vínculo de plano.",
    })
  })

  it("não exige plano interno de aluno Wellhub, TotalPass ou avulso", () => {
    for (const tipoAluno of ["WELLHUB", "TOTALPASS", "AVULSO"] as const) {
      expect(
        avaliarCheckin({
          ...base,
          tipoAluno,
          possuiPlanoPagamento: false,
          modalidadeCobertaPeloPlano: false,
          mensalidadeInternaNaModalidade: false,
        }),
      ).toEqual({ ok: true })
    }
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

  it("bloqueia check-in sem aceite do termo de responsabilidade", () => {
    expect(avaliarCheckin({ ...base, termoResponsabilidadeAceito: false })).toEqual({
      ok: false,
      motivo: "Aceite o termo de responsabilidade para agendar aulas e fazer check-in.",
    })
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

  it("bloqueia check-in sem agendamento quando a aula está lotada (RF-020)", () => {
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

  describe("agendamento prévio (RF-022)", () => {
    const sem = { ...base, temComparecimento: false }
    it("PERMITIR libera sem agendamento", () => {
      expect(avaliarCheckin({ ...sem, politicaSemComparecimento: "PERMITIR" })).toEqual({
        ok: true,
      })
    })
    it("BLOQUEAR exige agendamento", () => {
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

describe("checkinImpedeNovoRegistro", () => {
  it("mantém o pendente bloqueado para o aluno e permite que a equipe o aprove", () => {
    expect(checkinImpedeNovoRegistro("PENDENTE_REVISAO", false)).toBe(true)
    expect(checkinImpedeNovoRegistro("PENDENTE_REVISAO", true)).toBe(false)
    expect(checkinImpedeNovoRegistro("VALIDO", true)).toBe(true)
  })
})

describe("conteudoNotificacaoCheckinRealizado", () => {
  it("avisa o professor sobre o check-in válido", () => {
    expect(
      conteudoNotificacaoCheckinRealizado({
        alunoNome: "Ana Silva",
        nomeAula: "Turma avançada",
        inicioAula: new Date("2026-06-10T22:00:00Z"),
        pendenteRevisao: false,
      }),
    ).toEqual({
      titulo: "Check-in realizado",
      mensagem: "Ana Silva fez check-in em Turma avançada (10/06/2026 às 19:00).",
    })
  })

  it("deixa explícito quando o check-in aguarda revisão", () => {
    expect(
      conteudoNotificacaoCheckinRealizado({
        alunoNome: "Ana Silva",
        nomeAula: "Turma avançada",
        inicioAula: new Date("2026-06-10T22:00:00Z"),
        pendenteRevisao: true,
      }),
    ).toEqual({
      titulo: "Check-in pendente de revisão",
      mensagem:
        "Ana Silva fez check-in em Turma avançada (10/06/2026 às 19:00). Aguarda sua aprovação.",
    })
  })
})

describe("usuarioProfessorResponsavelCheckin", () => {
  const professor = (usuarioId: string, ativo = true, usuarioAtivo = true) => ({
    usuarioId,
    ativo,
    usuario: { ativo: usuarioAtivo },
  })

  it("prioriza o professor efetivo da aula", () => {
    expect(
      usuarioProfessorResponsavelCheckin({
        professorAula: professor("substituto"),
        professorTurma: professor("titular"),
      }),
    ).toBe("substituto")
  })

  it("usa o professor da turma quando não há professor efetivo ativo", () => {
    expect(
      usuarioProfessorResponsavelCheckin({
        professorAula: professor("inativo", false),
        professorTurma: professor("titular"),
      }),
    ).toBe("titular")
  })
})

describe("checkinRetroativo", () => {
  it("marca lançamento após o fim da aula como retroativo", () => {
    const fimAula = new Date("2026-06-10T20:30:00Z")
    expect(checkinRetroativo({ fimAula, agora: new Date("2026-06-10T20:30:00Z") })).toBe(false)
    expect(checkinRetroativo({ fimAula, agora: new Date("2026-06-10T20:30:01Z") })).toBe(true)
  })
})

describe("podeRealizarCheckinNaJanela", () => {
  const inicioAula = new Date("2026-06-10T20:00:00Z")
  const fimAula = new Date("2026-06-10T21:00:00Z")

  it("libera de 30 minutos antes até 30 minutos após o fim da aula", () => {
    expect(
      podeRealizarCheckinNaJanela({
        inicioAula,
        fimAula,
        agora: new Date("2026-06-10T19:30:00Z"),
      }),
    ).toBe(true)
    expect(
      podeRealizarCheckinNaJanela({
        inicioAula,
        fimAula,
        agora: new Date("2026-06-10T21:30:00Z"),
      }),
    ).toBe(true)
  })

  it("bloqueia fora da tolerância", () => {
    expect(
      podeRealizarCheckinNaJanela({
        inicioAula,
        fimAula,
        agora: new Date("2026-06-10T19:29:59Z"),
      }),
    ).toBe(false)
    expect(
      podeRealizarCheckinNaJanela({
        inicioAula,
        fimAula,
        agora: new Date("2026-06-10T21:30:01Z"),
      }),
    ).toBe(false)
  })
})

import { describe, expect, it } from "vitest"
import { campoConfiguracaoNotificacao, mensagemLembreteAniversario } from "./notificacao.service"

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

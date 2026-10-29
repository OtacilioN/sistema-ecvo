import { describe, expect, it, vi } from "vitest"
import webPush from "web-push"
import { opcoesEnvioPush } from "./push.service"

vi.mock("@/lib/db", () => ({ db: {} }))

describe("opcoesEnvioPush", () => {
  const endpoint = "https://push.example.com/subscription"
  const keys = { auth: "nao-usado-sem-payload", p256dh: "nao-usado-sem-payload" }

  it.each([
    "lembrete-treino:aula-1:usuario-1",
    "lembrete-aluguel:2026-10:gestor-1",
  ])("gera topic aceito pela biblioteca Web Push para %s", (notificacaoId) => {
    const opcoes = opcoesEnvioPush(notificacaoId, endpoint)
    // A biblioteca real valida e monta a requisição, sem enviar nada pela rede.
    const requisicao = webPush.generateRequestDetails({ endpoint, keys }, null, opcoes)

    expect(opcoes.topic).toMatch(/^[A-Za-z0-9_-]{32}$/)
    expect(requisicao.headers.Topic).toBe(opcoes.topic)
    expect(requisicao.headers.TTL).toBe(86_400)
    expect(requisicao.headers.Urgency).toBe("normal")
    expect(opcoesEnvioPush(notificacaoId, endpoint).topic).toBe(opcoes.topic)
  })

  it("distingue aulas cujos IDs compartilham os primeiros 32 caracteres", () => {
    const primeira = "lembrete-treino:claaaaaaaaaaaaaaaaaaaaaaa1:usuario-1"
    const segunda = "lembrete-treino:claaaaaaaaaaaaaaaaaaaaaaa2:usuario-1"
    expect(primeira.slice(0, 32)).toBe(segunda.slice(0, 32))

    expect(opcoesEnvioPush(primeira, endpoint).topic).not.toBe(
      opcoesEnvioPush(segunda, endpoint).topic,
    )
  })

  it("preserva o envio Apple sem topic", () => {
    const endpointApple = "https://web.push.apple.com/subscription"
    const opcoes = opcoesEnvioPush("lembrete-treino:aula-1:usuario-1", endpointApple)
    const requisicao = webPush.generateRequestDetails(
      { endpoint: endpointApple, keys },
      null,
      opcoes,
    )

    expect(opcoes).not.toHaveProperty("topic")
    expect(requisicao.headers).not.toHaveProperty("Topic")
  })
})

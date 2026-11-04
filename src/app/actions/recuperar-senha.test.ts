import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({ solicitar: vi.fn(), concluir: vi.fn() }))
vi.mock("@/lib/services/recuperacao-senha.service", () => ({
  solicitarRecuperacaoSenha: mocks.solicitar,
  concluirRecuperacaoSenha: mocks.concluir,
}))

import { redefinirSenha, solicitarRecuperacao } from "./recuperar-senha"

function formulario(dados: Record<string, string>) {
  const form = new FormData()
  for (const [chave, valor] of Object.entries(dados)) form.set(chave, valor)
  return form
}

const token = "a".repeat(64)
const dadosRedefinicao = { token, senha: "nova-senha", confirmarSenha: "nova-senha" }

beforeEach(() => {
  vi.clearAllMocks()
  mocks.solicitar.mockResolvedValue(undefined)
  mocks.concluir.mockResolvedValue(true)
})

describe("solicitação de recuperação", () => {
  it("valida o e-mail antes de solicitar o envio", async () => {
    expect(await solicitarRecuperacao(undefined, formulario({ email: "inválido" }))).toEqual({
      erro: "Informe um e-mail válido.",
    })
    expect(mocks.solicitar).not.toHaveBeenCalled()
  })

  it("normaliza o e-mail para a busca", async () => {
    const resultado = await solicitarRecuperacao(
      undefined,
      formulario({ email: "ALUNO@EXAMPLE.COM" }),
    )

    expect(mocks.solicitar).toHaveBeenCalledWith("aluno@example.com")
    expect(resultado?.sucesso).toBe(true)
  })

  it("mantém a mesma resposta pública quando o envio falha e não registra dados privados", async () => {
    const consoleErro = vi.spyOn(console, "error").mockImplementation(() => {})
    try {
      const dados = formulario({ email: "aluno@example.com" })
      const sucesso = await solicitarRecuperacao(undefined, dados)
      mocks.solicitar.mockRejectedValue(new Error(`Erro privado aluno@example.com ${token}`))

      expect(await solicitarRecuperacao(undefined, dados)).toEqual(sucesso)
      expect(consoleErro).toHaveBeenCalledExactlyOnceWith(
        "Falha ao processar solicitação de recuperação de senha",
      )
    } finally {
      consoleErro.mockRestore()
    }
  })
})

describe("redefinição de senha", () => {
  it.each([
    "",
    "curto",
    "g".repeat(64),
    "a".repeat(65),
  ])("rejeita token malformado sem consultar o serviço: %s", async (valor) => {
    expect(
      await redefinirSenha(undefined, formulario({ ...dadosRedefinicao, token: valor })),
    ).toEqual({ erro: "Link inválido ou expirado. Solicite um novo link." })
    expect(mocks.concluir).not.toHaveBeenCalled()
  })

  it("rejeita confirmação divergente antes de consumir o token", async () => {
    expect(
      await redefinirSenha(
        undefined,
        formulario({ ...dadosRedefinicao, confirmarSenha: "outra-senha" }),
      ),
    ).toEqual({ erro: "As senhas não conferem" })
    expect(mocks.concluir).not.toHaveBeenCalled()
  })

  it("informa quando o token expirou ou já foi consumido", async () => {
    mocks.concluir.mockResolvedValue(false)

    expect(await redefinirSenha(undefined, formulario(dadosRedefinicao))).toEqual({
      erro: "Link inválido ou expirado. Solicite um novo link.",
    })
  })

  it("confirma a redefinição depois do consumo bem-sucedido", async () => {
    expect(await redefinirSenha(undefined, formulario(dadosRedefinicao))).toEqual({
      sucesso: true,
      mensagem: "Senha redefinida. Entre com sua nova senha.",
    })
    expect(mocks.concluir).toHaveBeenCalledExactlyOnceWith(token, "nova-senha")
  })
})

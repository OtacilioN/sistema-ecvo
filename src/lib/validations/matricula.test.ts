import { describe, expect, it } from "vitest"
import {
  assinaturaComprovanteValida,
  validarComprovanteMatricula,
} from "@/lib/comprovantes-matricula"
import { aprovacaoMatriculaSchema, solicitacaoMatriculaSchema } from "./matricula"

const solicitacaoValida = {
  nome: "Aluno ECVO",
  email: "ALUNO@EXEMPLO.COM",
  senha: "123456",
  confirmarSenha: "123456",
  cpf: "",
  telefone: "(83) 99999-9999",
  dataNascimento: "",
  endereco: "",
  contatoEmergencia: "",
  restricoesMedicas: "",
  modalidadeId: "modalidade-1",
  aceiteDados: "on",
}

describe("solicitacaoMatriculaSchema", () => {
  it("normaliza os dados do cadastro público", () => {
    const dados = solicitacaoMatriculaSchema.parse(solicitacaoValida)
    expect(dados.email).toBe("aluno@exemplo.com")
    expect(dados.cpf).toBeNull()
    expect(dados.endereco).toBeNull()
  })

  it("exige confirmação da senha e autorização de uso dos dados", () => {
    expect(
      solicitacaoMatriculaSchema.safeParse({
        ...solicitacaoValida,
        confirmarSenha: "outra-senha",
        aceiteDados: null,
      }).success,
    ).toBe(false)
  })
})

describe("aprovacaoMatriculaSchema", () => {
  it("exige plano para liberar a matrícula", () => {
    const resultado = aprovacaoMatriculaSchema.safeParse({
      solicitacaoId: "solicitacao-1",
      planoId: "",
      diaVencimento: 10,
      comprovanteConfirmado: false,
      competenciaEsperada: "2026-08",
      pagoEm: null,
    })
    expect(resultado.success).toBe(false)
  })

  it("exige data quando o comprovante for confirmado", () => {
    const resultado = aprovacaoMatriculaSchema.safeParse({
      solicitacaoId: "solicitacao-1",
      planoId: "plano-1",
      diaVencimento: 10,
      comprovanteConfirmado: true,
      competenciaEsperada: "2026-08",
      pagoEm: null,
    })
    expect(resultado.success).toBe(false)
  })
})

describe("validarComprovanteMatricula", () => {
  it("aceita ausência, imagem e PDF dentro do limite", () => {
    expect(validarComprovanteMatricula(null)).toEqual({ ok: true })
    expect(validarComprovanteMatricula({ type: "application/pdf", size: 1024 } as File)).toEqual({
      ok: true,
    })
  })

  it("rejeita formato desconhecido e arquivo acima de 3 MB", () => {
    expect(validarComprovanteMatricula({ type: "text/plain", size: 10 } as File).ok).toBe(false)
    expect(
      validarComprovanteMatricula({ type: "image/png", size: 3 * 1024 * 1024 + 1 } as File).ok,
    ).toBe(false)
  })

  it("confere a assinatura real do conteúdo declarado", () => {
    expect(
      assinaturaComprovanteValida(
        "application/pdf",
        new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]),
      ),
    ).toBe(true)
    expect(assinaturaComprovanteValida("image/png", new Uint8Array([0x25, 0x50, 0x44, 0x46]))).toBe(
      false,
    )
  })
})

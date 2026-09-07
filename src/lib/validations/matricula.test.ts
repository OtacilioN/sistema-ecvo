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
  cpf: "529.982.247-25",
  telefone: "(83) 99999-9999",
  dataNascimento: "",
  endereco: "",
  contatoEmergencia: "",
  restricoesMedicas: "",
  modalidadeIds: ["modalidade-1"],
  tipoPagamento: "MENSALISTA",
  beneficioAtivoDeclarado: null,
  aceiteDados: "on",
}

describe("solicitacaoMatriculaSchema", () => {
  it("normaliza os dados do cadastro público", () => {
    const dados = solicitacaoMatriculaSchema.parse(solicitacaoValida)
    expect(dados.email).toBe("aluno@exemplo.com")
    expect(dados.cpf).toBe("52998224725")
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

  it.each([
    ["WELLHUB", "Wellhub"],
    ["TOTALPASS", "TotalPass"],
  ] as const)("exige a declaração de benefício ativo para %s", (tipoPagamento, rotulo) => {
    const semDeclaracao = solicitacaoMatriculaSchema.safeParse({
      ...solicitacaoValida,
      tipoPagamento,
    })
    expect(semDeclaracao.success).toBe(false)
    if (!semDeclaracao.success) {
      expect(semDeclaracao.error.issues[0]?.message).toContain(rotulo)
    }

    const comDeclaracao = solicitacaoMatriculaSchema.safeParse({
      ...solicitacaoValida,
      tipoPagamento,
      beneficioAtivoDeclarado: "on",
    })
    expect(comDeclaracao.success).toBe(true)
  })

  it("rejeita declaração de benefício no fluxo mensalista", () => {
    expect(
      solicitacaoMatriculaSchema.safeParse({
        ...solicitacaoValida,
        beneficioAtivoDeclarado: "on",
      }).success,
    ).toBe(false)
  })

  it.each([1, 2, 3])("aceita mensalista com %i modalidade(s) única(s)", (quantidade) => {
    expect(
      solicitacaoMatriculaSchema.safeParse({
        ...solicitacaoValida,
        modalidadeIds: Array.from(
          { length: quantidade },
          (_, indice) => `modalidade-${indice + 1}`,
        ),
      }).success,
    ).toBe(true)
  })

  it("rejeita mensalista sem modalidade, com mais de três ou com repetição", () => {
    for (const modalidadeIds of [
      [],
      ["modalidade-1", "modalidade-2", "modalidade-3", "modalidade-4"],
      ["modalidade-1", "modalidade-1"],
    ]) {
      expect(
        solicitacaoMatriculaSchema.safeParse({ ...solicitacaoValida, modalidadeIds }).success,
      ).toBe(false)
    }
  })

  it.each([
    "AULA_AVULSA",
    "WELLHUB",
    "TOTALPASS",
  ] as const)("mantém seleção única no fluxo %s", (tipoPagamento) => {
    expect(
      solicitacaoMatriculaSchema.safeParse({
        ...solicitacaoValida,
        tipoPagamento,
        modalidadeIds: ["modalidade-1", "modalidade-2"],
        aulaAvulsaId: tipoPagamento === "AULA_AVULSA" ? "aula-1" : undefined,
        beneficioAtivoDeclarado: tipoPagamento === "AULA_AVULSA" ? false : "on",
      }).success,
    ).toBe(false)
  })

  it("exige uma ocorrência real no cadastro de aula avulsa", () => {
    expect(
      solicitacaoMatriculaSchema.safeParse({
        ...solicitacaoValida,
        tipoPagamento: "AULA_AVULSA",
      }).success,
    ).toBe(false)

    expect(
      solicitacaoMatriculaSchema.safeParse({
        ...solicitacaoValida,
        tipoPagamento: "AULA_AVULSA",
        aulaAvulsaId: "aula-1",
      }).success,
    ).toBe(true)
  })

  it("rejeita declaração de benefício no fluxo de aula avulsa", () => {
    expect(
      solicitacaoMatriculaSchema.safeParse({
        ...solicitacaoValida,
        tipoPagamento: "AULA_AVULSA",
        aulaAvulsaId: "aula-1",
        beneficioAtivoDeclarado: "on",
      }).success,
    ).toBe(false)
  })

  it("rejeita tipo de pagamento desconhecido", () => {
    expect(
      solicitacaoMatriculaSchema.safeParse({
        ...solicitacaoValida,
        tipoPagamento: "AVULSO",
      }).success,
    ).toBe(false)
  })
})

describe("aprovacaoMatriculaSchema", () => {
  it("aceita somente os dados administrativos que ainda cabem ao gestor", () => {
    const resultado = aprovacaoMatriculaSchema.safeParse({
      solicitacaoId: "solicitacao-1",
      diaVencimento: 10,
    })
    expect(resultado.success).toBe(true)
  })

  it("rejeita dia de vencimento fora do intervalo permitido", () => {
    const resultado = aprovacaoMatriculaSchema.safeParse({
      solicitacaoId: "solicitacao-1",
      diaVencimento: 29,
    })
    expect(resultado.success).toBe(false)
  })

  it("aceita aprovação sem vencimento para solicitações externas", () => {
    const resultado = aprovacaoMatriculaSchema.safeParse({
      solicitacaoId: "solicitacao-1",
      diaVencimento: undefined,
    })
    expect(resultado.success).toBe(true)
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

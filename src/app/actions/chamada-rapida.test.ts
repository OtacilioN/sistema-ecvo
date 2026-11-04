import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  chave: vi.fn(),
  localizacao: vi.fn(),
  permissao: vi.fn(),
  emitir: vi.fn(),
  limpar: vi.fn(),
  redirect: vi.fn((url: string) => {
    throw new Error(`redirect:${url}`)
  }),
}))
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }))
vi.mock("@/lib/auth/chamada-rapida", () => ({
  chaveChamadaValida: mocks.chave,
  localizacaoChamadaValida: mocks.localizacao,
  temPermissaoChamada: mocks.permissao,
  emitirPermissaoChamada: mocks.emitir,
  limparLocalizacaoChamada: mocks.limpar,
  ROTA_CHAMADA: "/gestao/checkin",
}))

import { confirmarLocalizacaoChamada, liberarChamada } from "./chamada-rapida"

const coordenadas = { latitude: -7.2, longitude: -34.8, precisao: 10, capturadaEm: 1 }
function formulario(chave = "chave-teste", senha = "combate") {
  const dados = new FormData()
  dados.set("acesso", chave)
  dados.set("contrasenha", senha)
  return dados
}

describe("etapas de acesso à chamada", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.chave.mockReturnValue(true)
    mocks.localizacao.mockReturnValue(true)
    mocks.permissao.mockResolvedValue(true)
  })

  it("valida a chave antes de verificar localização ou emitir qualquer permissão", async () => {
    mocks.chave.mockReturnValue(false)
    expect(await confirmarLocalizacaoChamada("incorreta", coordenadas)).toHaveProperty("erro")
    expect(await liberarChamada({}, formulario("incorreta"))).toHaveProperty("erro")
    expect(mocks.localizacao).not.toHaveBeenCalled()
    expect(mocks.permissao).not.toHaveBeenCalled()
    expect(mocks.emitir).not.toHaveBeenCalled()
  })

  it("rejeita coordenadas malformadas e localização fora do limite", async () => {
    expect(
      await confirmarLocalizacaoChamada("chave", { ...coordenadas, latitude: Number.NaN }),
    ).toHaveProperty("erro")
    expect(mocks.localizacao).not.toHaveBeenCalled()
    mocks.localizacao.mockReturnValue(false)
    expect(await confirmarLocalizacaoChamada("chave", coordenadas)).toHaveProperty("erro")
    expect(mocks.emitir).not.toHaveBeenCalled()
  })

  it("confirma localização sem liberar ainda a consulta", async () => {
    expect(await confirmarLocalizacaoChamada("chave", coordenadas)).toEqual({
      localizacaoConfirmada: true,
    })
    expect(mocks.emitir).toHaveBeenCalledExactlyOnceWith("localizacao")
    expect(mocks.redirect).not.toHaveBeenCalled()
  })

  it("não aceita a contra-senha sem prova recente de localização", async () => {
    mocks.permissao.mockResolvedValue(false)
    expect(await liberarChamada({}, formulario())).toMatchObject({
      localizacaoConfirmada: false,
      erro: expect.any(String),
    })
    expect(mocks.permissao).toHaveBeenCalledWith("localizacao")
    expect(mocks.emitir).not.toHaveBeenCalled()
    expect(mocks.redirect).not.toHaveBeenCalled()
  })

  it("nega contra-senha incorreta mesmo com localização confirmada", async () => {
    expect(await liberarChamada({}, formulario("chave", "incorreta"))).toMatchObject({
      localizacaoConfirmada: true,
      erro: "Contra-senha incorreta.",
    })
    expect(mocks.emitir).not.toHaveBeenCalled()
    expect(mocks.limpar).not.toHaveBeenCalled()
  })

  it("libera somente após as três verificações e preserva a chave codificada no redirecionamento", async () => {
    await expect(liberarChamada({}, formulario("chave+com/&?"))).rejects.toThrow(
      "redirect:/gestao/checkin?acesso=chave%2Bcom%2F%26%3F",
    )
    expect(mocks.chave).toHaveBeenCalledWith("chave+com/&?")
    expect(mocks.emitir).toHaveBeenCalledExactlyOnceWith("consulta")
    expect(mocks.limpar).toHaveBeenCalledOnce()
    expect(mocks.emitir.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.redirect.mock.invocationCallOrder[0],
    )
    expect(mocks.limpar.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.redirect.mock.invocationCallOrder[0],
    )
  })
})

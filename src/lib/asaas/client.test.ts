import { describe, expect, it, vi } from "vitest"
import {
  criarAutorizacaoPixAutomaticoAsaas,
  criarClienteAsaas,
  criarCobrancaAsaas,
  listarAutorizacoesPixAutomaticoAsaas,
  listarClientesAsaas,
  listarCobrancasAsaas,
  obterConfiguracaoAsaas,
  obterQrCodePixAsaas,
} from "./client"

const envSandbox = {
  ASAAS_API_KEY: "$aact_hmlg_segredo",
  ASAAS_ENVIRONMENT: "sandbox",
  ASAAS_USER_AGENT: "SistemaECVO/Teste",
}

function respostaJson(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    headers: { "Content-Type": "application/json" },
    status,
  })
}

function mockFetchCom(payload: unknown, status = 200) {
  return vi.fn<typeof fetch>().mockResolvedValue(respostaJson(payload, status))
}

describe("obterConfiguracaoAsaas", () => {
  it("resolve as URLs isoladas de Sandbox e Produção", () => {
    expect(obterConfiguracaoAsaas(envSandbox)).toMatchObject({
      ambiente: "sandbox",
      baseUrl: "https://api-sandbox.asaas.com/v3",
    })
    expect(
      obterConfiguracaoAsaas({
        ASAAS_API_KEY: "$aact_prod_segredo",
        ASAAS_ENVIRONMENT: "production",
      }),
    ).toMatchObject({
      ambiente: "production",
      baseUrl: "https://api.asaas.com/v3",
      userAgent: "SistemaECVO/1.0",
    })
  })

  it("falha sem expor credenciais quando o ambiente é inválido", () => {
    expect(() =>
      obterConfiguracaoAsaas({
        ASAAS_API_KEY: "segredo-que-nao-deve-aparecer",
        ASAAS_ENVIRONMENT: "producao",
      }),
    ).toThrow("ASAAS_ENVIRONMENT deve ser sandbox ou production")
  })

  it("impede Sandbox no runtime de produção", () => {
    expect(() => obterConfiguracaoAsaas({ ...envSandbox, NODE_ENV: "production" })).toThrow(
      "o runtime de produção não pode usar o Sandbox",
    )
  })

  it("recusa chave cujo prefixo não corresponde ao ambiente", () => {
    expect(() =>
      obterConfiguracaoAsaas({
        ...envSandbox,
        ASAAS_API_KEY: "$aact_prod_chave-real",
      }),
    ).toThrow("a chave informada não pertence ao Sandbox")
  })
})

describe("clientes", () => {
  it("lista por referência externa usando autenticação própria do Asaas", async () => {
    const fetchMock = mockFetchCom({
      object: "list",
      hasMore: false,
      totalCount: 0,
      limit: 10,
      offset: 0,
      data: [],
    })

    await listarClientesAsaas(
      { externalReference: "aluno-1", limit: 10 },
      { env: envSandbox, fetch: fetchMock },
    )

    const [url, init] = fetchMock.mock.calls[0]
    expect(String(url)).toBe(
      "https://api-sandbox.asaas.com/v3/customers?externalReference=aluno-1&limit=10",
    )
    expect(init?.headers).toMatchObject({
      Accept: "application/json",
      "User-Agent": "SistemaECVO/Teste",
      access_token: "$aact_hmlg_segredo",
    })
    expect(init?.body).toBeUndefined()
  })

  it("cria cliente preservando a referência externa", async () => {
    const fetchMock = mockFetchCom({ id: "cus_1", object: "customer" })

    await criarClienteAsaas(
      {
        name: "Ana Silva",
        cpfCnpj: "12345678901",
        externalReference: "aluno-1",
      },
      { env: envSandbox, fetch: fetchMock },
    )

    const [url, init] = fetchMock.mock.calls[0]
    expect(String(url)).toBe("https://api-sandbox.asaas.com/v3/customers")
    expect(init?.method).toBe("POST")
    expect(JSON.parse(String(init?.body))).toEqual({
      name: "Ana Silva",
      cpfCnpj: "12345678901",
      externalReference: "aluno-1",
    })
  })
})

describe("cobranças Pix", () => {
  it("lista por competência e cria uma cobrança", async () => {
    const fetchLista = mockFetchCom({ data: [], object: "list" })
    await listarCobrancasAsaas(
      {
        customer: "cus_1",
        externalReference: "mensalidade:1:2026-09",
        dueDateInicial: "2026-09-01",
        dueDateFinal: "2026-09-30",
      },
      { env: envSandbox, fetch: fetchLista },
    )
    expect(String(fetchLista.mock.calls[0][0])).toContain("dueDate%5Bge%5D=2026-09-01")
    expect(String(fetchLista.mock.calls[0][0])).toContain("dueDate%5Ble%5D=2026-09-30")

    const fetchCriacao = mockFetchCom({ id: "pay_1", object: "payment" })
    await criarCobrancaAsaas(
      {
        customer: "cus_1",
        billingType: "PIX",
        value: 150,
        dueDate: "2026-09-10",
        externalReference: "mensalidade:1:2026-09",
      },
      { env: envSandbox, fetch: fetchCriacao },
    )
    expect(JSON.parse(String(fetchCriacao.mock.calls[0][1]?.body))).toMatchObject({
      billingType: "PIX",
      externalReference: "mensalidade:1:2026-09",
    })
  })

  it("obtém o QR Code com GET sem body", async () => {
    const fetchMock = mockFetchCom({
      encodedImage: "base64",
      payload: "pix-copia-e-cola",
      expirationDate: "2026-09-10 23:59:59",
    })

    await obterQrCodePixAsaas("pay/id", { env: envSandbox, fetch: fetchMock })

    expect(String(fetchMock.mock.calls[0][0])).toBe(
      "https://api-sandbox.asaas.com/v3/payments/pay%2Fid/pixQrCode",
    )
    expect(fetchMock.mock.calls[0][1]?.method).toBe("GET")
    expect(fetchMock.mock.calls[0][1]?.body).toBeUndefined()
  })
})

describe("Pix Automático", () => {
  it("lista autorizações ativas do cliente", async () => {
    const fetchMock = mockFetchCom({ data: [], object: "list" })

    await listarAutorizacoesPixAutomaticoAsaas(
      { customerId: "cus_1", status: "ACTIVE" },
      { env: envSandbox, fetch: fetchMock },
    )

    expect(String(fetchMock.mock.calls[0][0])).toBe(
      "https://api-sandbox.asaas.com/v3/pix/automatic/authorizations?customerId=cus_1&status=ACTIVE",
    )
  })

  it("cria autorização mensal com QR imediato", async () => {
    const fetchMock = mockFetchCom({ id: "aut_1", status: "CREATED" })
    const dados = {
      frequency: "MONTHLY" as const,
      contractId: "semestre-1",
      startDate: "2026-09-10",
      finishDate: "2027-02-18",
      value: 150,
      customerId: "cus_1",
      paymentCreationMode: "MANUAL" as const,
      retryPolicy: "ALLOW_THREE_IN_SEVEN_DAYS" as const,
      immediateQrCode: {
        expirationSeconds: 3600,
        originalValue: 150,
        description: "Mensalidade 1 de 6",
      },
    }

    await criarAutorizacaoPixAutomaticoAsaas(dados, {
      env: envSandbox,
      fetch: fetchMock,
    })

    expect(String(fetchMock.mock.calls[0][0])).toBe(
      "https://api-sandbox.asaas.com/v3/pix/automatic/authorizations",
    )
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toEqual(dados)
  })
})

describe("erros", () => {
  it("retorna somente status e códigos, sem vazar descrições ou chave", async () => {
    const fetchMock = mockFetchCom(
      {
        errors: [
          {
            code: "invalid_customer",
            description: "Falha contendo segredo-que-nao-pode-vazar",
          },
        ],
      },
      400,
    )

    const chamada = criarClienteAsaas(
      { name: "Ana", cpfCnpj: "123", externalReference: "aluno-1" },
      {
        env: { ...envSandbox, ASAAS_API_KEY: "$aact_hmlg_chave-que-nao-pode-vazar" },
        fetch: fetchMock,
      },
    )

    await expect(chamada).rejects.toMatchObject({
      name: "ErroApiAsaas",
      status: 400,
      codes: ["invalid_customer"],
    })
    await expect(chamada).rejects.not.toThrow(/segredo-que-nao-pode-vazar|chave-que-nao-pode-vazar/)
  })
})

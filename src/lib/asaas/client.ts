import "server-only"

type AmbienteAsaas = "sandbox" | "production"

export type ConfiguracaoAsaas = {
  ambiente: AmbienteAsaas
  apiKey: string
  baseUrl: string
  userAgent: string
}

export type DependenciasAsaas = {
  env?: Record<string, string | undefined>
  fetch?: typeof globalThis.fetch
  wait?: (milissegundos: number) => Promise<void>
}

export type ListaPaginadaAsaas<T> = {
  object: "list"
  hasMore: boolean
  totalCount: number
  limit: number
  offset: number
  data: T[]
}

export type ClienteAsaas = {
  object: "customer"
  id: string
  name: string
  cpfCnpj: string
  email?: string | null
  phone?: string | null
  mobilePhone?: string | null
  externalReference?: string | null
  notificationDisabled?: boolean
  deleted?: boolean
}

export type DadosCriacaoClienteAsaas = {
  name: string
  cpfCnpj: string
  externalReference: string
  email?: string
  phone?: string
  mobilePhone?: string
  notificationDisabled?: boolean
}

export type FiltrosClientesAsaas = {
  offset?: number
  limit?: number
  name?: string
  email?: string
  cpfCnpj?: string
  externalReference?: string
}

export type TipoCobrancaAsaas = "BOLETO" | "PIX" | "CREDIT_CARD" | "UNDEFINED"

export type StatusCobrancaAsaas =
  | "PENDING"
  | "RECEIVED"
  | "CONFIRMED"
  | "OVERDUE"
  | "REFUNDED"
  | "PARTIALLY_REFUNDED"
  | "DELETED"
  | "RECEIVED_IN_CASH"
  | "REFUND_REQUESTED"
  | "REFUND_IN_PROGRESS"
  | "CHARGEBACK_REQUESTED"
  | "CHARGEBACK_DISPUTE"
  | "AWAITING_CHARGEBACK_REVERSAL"
  | "DUNNING_REQUESTED"
  | "DUNNING_RECEIVED"
  | "AWAITING_RISK_ANALYSIS"

export type CobrancaAsaas = {
  object: "payment"
  id: string
  customer: string
  subscription?: string | null
  billingType: TipoCobrancaAsaas
  value: number
  refundedValue?: number | null
  netValue?: number
  status: StatusCobrancaAsaas
  dueDate: string
  paymentDate?: string | null
  description?: string | null
  externalReference?: string | null
  invoiceUrl?: string
  deleted?: boolean
  pixTransaction?: string | null
  conciliationIdentifier?: string | null
  pixAutomaticAuthorizationId?: string | null
}

export type ExclusaoCobrancaAsaas = {
  deleted: boolean
  id: string
}

export type DadosCriacaoCobrancaAsaas = {
  customer: string
  billingType: TipoCobrancaAsaas
  value: number
  dueDate: string
  description?: string
  externalReference?: string
  pixAutomaticAuthorizationId?: string
}

export type FiltrosCobrancasAsaas = {
  offset?: number
  limit?: number
  customer?: string
  billingType?: TipoCobrancaAsaas
  status?: StatusCobrancaAsaas
  subscription?: string
  externalReference?: string
  dueDateInicial?: string
  dueDateFinal?: string
}

export type QrCodePixAsaas = {
  encodedImage: string
  payload: string
  expirationDate: string
}

export type FrequenciaPixAutomaticoAsaas =
  | "WEEKLY"
  | "MONTHLY"
  | "QUARTERLY"
  | "SEMIANNUALLY"
  | "ANNUALLY"

export type StatusAutorizacaoPixAutomaticoAsaas =
  | "CREATED"
  | "ACTIVE"
  | "CANCELLED"
  | "REFUSED"
  | "EXPIRED"

export type ModoCriacaoCobrancaPixAutomaticoAsaas = "MANUAL" | "SUBSCRIPTION"

export type PoliticaRetentativaPixAutomaticoAsaas = "ALLOW_THREE_IN_SEVEN_DAYS" | "NOT_ALLOWED"

export type AutorizacaoPixAutomaticoAsaas = {
  id: string
  customerId: string
  contractId: string
  description?: string | null
  startDate: string
  finishDate?: string | null
  frequency: FrequenciaPixAutomaticoAsaas
  value?: number | null
  status: StatusAutorizacaoPixAutomaticoAsaas
  payload?: string | null
  encodedImage?: string | null
  subscriptionId?: string | null
  paymentCreationMode: ModoCriacaoCobrancaPixAutomaticoAsaas
  retryPolicy: PoliticaRetentativaPixAutomaticoAsaas
  immediateQrCode: {
    conciliationIdentifier: string
    expirationDate: string
  }
}

export type DadosCriacaoAutorizacaoPixAutomaticoAsaas = {
  frequency: FrequenciaPixAutomaticoAsaas
  contractId: string
  startDate: string
  finishDate?: string
  value?: number
  description?: string
  customerId: string
  immediateQrCode: {
    pixKey?: string
    expirationSeconds: number
    originalValue: number
    description?: string
  }
  minLimitValue?: number
  paymentCreationMode?: ModoCriacaoCobrancaPixAutomaticoAsaas
  retryPolicy?: PoliticaRetentativaPixAutomaticoAsaas
}

export type FiltrosAutorizacoesPixAutomaticoAsaas = {
  offset?: number
  limit?: number
  status?: StatusAutorizacaoPixAutomaticoAsaas
  customerId?: string
}

type OpcoesRequisicao = {
  body?: unknown
  method?: "DELETE" | "GET" | "POST"
  query?: Record<string, boolean | number | string | undefined>
}

const URLS_POR_AMBIENTE: Record<AmbienteAsaas, string> = {
  sandbox: "https://api-sandbox.asaas.com/v3",
  production: "https://api.asaas.com/v3",
}

function erroConfiguracao(motivo: string) {
  const erro = new Error(`Configuração do Asaas inválida: ${motivo}.`)
  erro.name = "ErroConfiguracaoAsaas"
  return erro
}

export function obterConfiguracaoAsaas(
  env: Record<string, string | undefined> = process.env,
): ConfiguracaoAsaas {
  const apiKey = env.ASAAS_API_KEY?.trim()
  if (!apiKey) throw erroConfiguracao("ASAAS_API_KEY não foi definida")

  const ambienteInformado = env.ASAAS_ENVIRONMENT?.trim().toLowerCase()
  if (ambienteInformado !== "sandbox" && ambienteInformado !== "production") {
    throw erroConfiguracao("ASAAS_ENVIRONMENT deve ser sandbox ou production")
  }

  const execucaoNaVercel = Boolean(env.VERCEL_ENV)
  const execucaoEmProducao = execucaoNaVercel
    ? env.VERCEL_ENV === "production"
    : env.ASAAS_PRODUCTION_CONFIRMED === "ECVO_PRODUCTION"
  if (execucaoEmProducao && ambienteInformado !== "production") {
    throw erroConfiguracao("o runtime de produção não pode usar o Sandbox")
  }
  if (!execucaoEmProducao && ambienteInformado === "production") {
    throw erroConfiguracao("a conta real só pode ser usada em um deployment de produção confirmado")
  }
  if (ambienteInformado === "sandbox" && !apiKey.startsWith("$aact_hmlg_")) {
    throw erroConfiguracao("a chave informada não pertence ao Sandbox")
  }
  if (ambienteInformado === "production" && !apiKey.startsWith("$aact_prod_")) {
    throw erroConfiguracao("a chave informada não pertence ao ambiente de produção")
  }

  const userAgent = env.ASAAS_USER_AGENT?.trim() || "SistemaECVO/1.0"

  return {
    ambiente: ambienteInformado,
    apiKey,
    baseUrl: URLS_POR_AMBIENTE[ambienteInformado],
    userAgent,
  }
}

function criarErroApiAsaas(status: number, payload: unknown) {
  const codes = extrairCodigosErro(payload)
  const sufixo = codes.length > 0 ? ` (${codes.join(", ")})` : ""
  const erro = new Error(`A requisição ao Asaas falhou com status ${status}${sufixo}.`)
  erro.name = "ErroApiAsaas"
  return Object.assign(erro, { codes, status })
}

function extrairCodigosErro(payload: unknown): string[] {
  if (!payload || typeof payload !== "object" || !("errors" in payload)) return []
  const errors = Reflect.get(payload, "errors")
  if (!Array.isArray(errors)) return []

  return errors.flatMap((item) => {
    if (!item || typeof item !== "object") return []
    const code = Reflect.get(item, "code")
    return typeof code === "string" ? [code] : []
  })
}

function criarUrl(
  baseUrl: string,
  path: string,
  query?: Record<string, boolean | number | string | undefined>,
) {
  const url = new URL(`${baseUrl}${path}`)
  for (const [chave, valor] of Object.entries(query ?? {})) {
    if (valor !== undefined && valor !== "") url.searchParams.set(chave, String(valor))
  }
  return url
}

async function requisitarAsaas<T>(
  path: string,
  opcoes: OpcoesRequisicao,
  dependencias: DependenciasAsaas,
): Promise<T> {
  const configuracao = obterConfiguracaoAsaas(dependencias.env ?? process.env)
  const fetchImpl = dependencias.fetch ?? globalThis.fetch
  const method = opcoes.method ?? "GET"
  const headers: Record<string, string> = {
    Accept: "application/json",
    "User-Agent": configuracao.userAgent,
    access_token: configuracao.apiKey,
  }

  let body: string | undefined
  if (opcoes.body !== undefined) {
    headers["Content-Type"] = "application/json"
    body = JSON.stringify(opcoes.body)
  }

  let resposta: Response
  const timeoutMsInformado = Number((dependencias.env ?? process.env).ASAAS_TIMEOUT_MS ?? 8_000)
  const timeoutMs = Number.isFinite(timeoutMsInformado) ? timeoutMsInformado : 8_000
  const controlador = new AbortController()
  const temporizador = setTimeout(() => controlador.abort(), Math.max(1_000, timeoutMs))
  try {
    resposta = await fetchImpl(criarUrl(configuracao.baseUrl, path, opcoes.query), {
      body,
      headers,
      method,
      signal: controlador.signal,
    })
  } catch {
    const erro = new Error("Não foi possível comunicar com o Asaas.")
    erro.name = "ErroComunicacaoAsaas"
    throw erro
  } finally {
    clearTimeout(temporizador)
  }

  const texto = await resposta.text()
  let payload: unknown
  try {
    payload = texto ? JSON.parse(texto) : undefined
  } catch {
    const erro = new Error("O Asaas retornou uma resposta inválida.")
    erro.name = "ErroRespostaAsaas"
    throw erro
  }

  if (!resposta.ok) throw criarErroApiAsaas(resposta.status, payload)
  return payload as T
}

export function listarClientesAsaas(
  filtros: FiltrosClientesAsaas = {},
  dependencias: DependenciasAsaas = {},
) {
  return requisitarAsaas<ListaPaginadaAsaas<ClienteAsaas>>(
    "/customers",
    { query: filtros },
    dependencias,
  )
}

export function criarClienteAsaas(
  dados: DadosCriacaoClienteAsaas,
  dependencias: DependenciasAsaas = {},
) {
  return requisitarAsaas<ClienteAsaas>("/customers", { body: dados, method: "POST" }, dependencias)
}

export function listarCobrancasAsaas(
  filtros: FiltrosCobrancasAsaas = {},
  dependencias: DependenciasAsaas = {},
) {
  const { dueDateFinal, dueDateInicial, ...demaisFiltros } = filtros
  return requisitarAsaas<ListaPaginadaAsaas<CobrancaAsaas>>(
    "/payments",
    {
      query: {
        ...demaisFiltros,
        "dueDate[ge]": dueDateInicial,
        "dueDate[le]": dueDateFinal,
      },
    },
    dependencias,
  )
}

export function obterCobrancaAsaas(cobrancaId: string, dependencias: DependenciasAsaas = {}) {
  return requisitarAsaas<CobrancaAsaas>(
    `/payments/${encodeURIComponent(cobrancaId)}`,
    {},
    dependencias,
  )
}

export function criarCobrancaAsaas(
  dados: DadosCriacaoCobrancaAsaas,
  dependencias: DependenciasAsaas = {},
) {
  return requisitarAsaas<CobrancaAsaas>("/payments", { body: dados, method: "POST" }, dependencias)
}

export function excluirCobrancaAsaas(cobrancaId: string, dependencias: DependenciasAsaas = {}) {
  return requisitarAsaas<ExclusaoCobrancaAsaas>(
    `/payments/${encodeURIComponent(cobrancaId)}`,
    { method: "DELETE" },
    dependencias,
  )
}

function erroApiAsaasTemCodigo(erro: unknown, codigo: string) {
  if (!erro || typeof erro !== "object" || Reflect.get(erro, "name") !== "ErroApiAsaas") {
    return false
  }
  const codes = Reflect.get(erro, "codes")
  return Array.isArray(codes) && codes.includes(codigo)
}

export async function obterQrCodePixAsaas(
  cobrancaId: string,
  dependencias: DependenciasAsaas = {},
) {
  const wait =
    dependencias.wait ??
    ((milissegundos) => new Promise((resolve) => setTimeout(resolve, milissegundos)))
  const atrasos = [0, 500, 1_000, 2_000]

  for (const atraso of atrasos) {
    if (atraso > 0) await wait(atraso)
    try {
      return await requisitarAsaas<QrCodePixAsaas>(
        `/payments/${encodeURIComponent(cobrancaId)}/pixQrCode`,
        {},
        dependencias,
      )
    } catch (erro) {
      if (!erroApiAsaasTemCodigo(erro, "invalid_action") || atraso === atrasos.at(-1)) throw erro
    }
  }

  throw new Error("Não foi possível obter o QR Code PIX do Asaas.")
}

export function listarAutorizacoesPixAutomaticoAsaas(
  filtros: FiltrosAutorizacoesPixAutomaticoAsaas = {},
  dependencias: DependenciasAsaas = {},
) {
  return requisitarAsaas<ListaPaginadaAsaas<AutorizacaoPixAutomaticoAsaas>>(
    "/pix/automatic/authorizations",
    { query: filtros },
    dependencias,
  )
}

export function obterAutorizacaoPixAutomaticoAsaas(
  autorizacaoId: string,
  dependencias: DependenciasAsaas = {},
) {
  return requisitarAsaas<AutorizacaoPixAutomaticoAsaas>(
    `/pix/automatic/authorizations/${encodeURIComponent(autorizacaoId)}`,
    {},
    dependencias,
  )
}

export function cancelarAutorizacaoPixAutomaticoAsaas(
  autorizacaoId: string,
  dependencias: DependenciasAsaas = {},
) {
  return requisitarAsaas<AutorizacaoPixAutomaticoAsaas>(
    `/pix/automatic/authorizations/${encodeURIComponent(autorizacaoId)}`,
    { method: "DELETE" },
    dependencias,
  )
}

export function criarAutorizacaoPixAutomaticoAsaas(
  dados: DadosCriacaoAutorizacaoPixAutomaticoAsaas,
  dependencias: DependenciasAsaas = {},
) {
  return requisitarAsaas<AutorizacaoPixAutomaticoAsaas>(
    "/pix/automatic/authorizations",
    { body: dados, method: "POST" },
    dependencias,
  )
}

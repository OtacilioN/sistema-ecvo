import "server-only"
import type { Checkin, Plataforma, Prisma, StatusConciliacao } from "@prisma/client"
import { type Row, readSheet } from "read-excel-file/universal"
import { db } from "@/lib/db"
import { registrarLog } from "@/lib/services/auditoria.service"

export type LinhaImportada = {
  dadosBrutos: Record<string, string>
  cpf: string | null
  email: string | null
  nome: string | null
  telefone: string | null
  idExterno: string | null
  valorRepasse: number | null
  dataReferencia: Date | null
  horarioReferencia: string | null
}

type AlunoIdentificacao = {
  id: string
  cpf: string | null
  email: string
  nome: string
  telefone: string | null
  idExterno: string | null
}

type CheckinConciliacao = Pick<Checkin, "id" | "status"> & {
  aula: { inicio: Date }
}

type ImportarLinhasConciliacaoParams = {
  plataforma: Plataforma
  arquivo: string
  linhas: Record<string, string>[]
  autorId: string
}

export function parseCsv(texto: string): Record<string, string>[] {
  const linhas = texto
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .filter((linha) => linha.trim().length > 0)
  if (linhas.length < 2) return []

  const separador = escolherSeparador(linhas[0])
  const cabecalhos = parseLinhaCsv(linhas[0], separador).map((h) => h.trim())

  return linhas.slice(1).map((linha) => {
    const valores = parseLinhaCsv(linha, separador)
    return Object.fromEntries(
      cabecalhos.map((cabecalho, i) => [cabecalho, valores[i]?.trim() ?? ""]),
    )
  })
}

export async function parseXlsx(arquivo: Buffer): Promise<Record<string, string>[]> {
  const linhas = await readSheet(bufferParaArrayBuffer(arquivo))
  return parseLinhasPlanilha(linhas)
}

export function normalizarLinha(raw: Record<string, string>): LinhaImportada {
  const mapa = new Map(Object.entries(raw).map(([k, v]) => [normalizarChave(k), v.trim()]))
  const cpf = apenasDigitos(pegar(mapa, ["cpf", "documento"]))
  const telefone = apenasDigitos(pegar(mapa, ["telefone", "celular", "whatsapp"]))
  const email = normalizarTexto(pegar(mapa, ["email", "e-mail"]))
  const nome = normalizarTexto(pegar(mapa, ["nome", "aluno", "name"]))
  const idExterno = normalizarTexto(
    pegar(mapa, ["idexterno", "identificadorexterno", "identificador", "id"]),
  )
  const valorRepasse = parseValorMonetario(
    pegar(mapa, ["valor", "valorrepasse", "repasse", "valorliquido", "pagamento", "receita"]),
  )
  const dataReferencia = parseData(pegar(mapa, ["data", "datareferencia", "datadeacesso", "date"]))
  const horarioReferencia = normalizarHora(
    pegar(mapa, ["hora", "horario", "horarioreferencia", "time"]),
  )

  return {
    dadosBrutos: raw,
    cpf: cpf.length > 0 ? cpf : null,
    email: email?.toLowerCase() ?? null,
    nome,
    telefone: telefone.length > 0 ? telefone : null,
    idExterno,
    valorRepasse,
    dataReferencia,
    horarioReferencia,
  }
}

export function identificarAluno(
  linha: LinhaImportada,
  alunos: AlunoIdentificacao[],
): AlunoIdentificacao | null {
  if (linha.cpf) {
    const porCpf = alunos.find((a) => a.cpf?.replace(/\D/g, "") === linha.cpf)
    if (porCpf) return porCpf
  }
  if (linha.email) {
    const porEmail = alunos.find((a) => a.email.toLowerCase() === linha.email)
    if (porEmail) return porEmail
  }
  if (linha.nome) {
    const porNome = alunos.find(
      (a) => normalizarBusca(a.nome) === normalizarBusca(linha.nome ?? ""),
    )
    if (porNome) return porNome
  }
  if (linha.telefone) {
    const porTelefone = alunos.find((a) => a.telefone?.replace(/\D/g, "") === linha.telefone)
    if (porTelefone) return porTelefone
  }
  if (linha.idExterno) {
    const porIdExterno = alunos.find(
      (a) => normalizarBusca(a.idExterno ?? "") === normalizarBusca(linha.idExterno ?? ""),
    )
    if (porIdExterno) return porIdExterno
  }
  return null
}

export function classificarConciliacao(params: {
  aluno: AlunoIdentificacao | null
  checkins: CheckinConciliacao[]
  horarioReferencia: string | null
  duplicadoPlanilha: boolean
}): { status: StatusConciliacao; checkinId: string | null } {
  if (params.duplicadoPlanilha) return { status: "DUPLICADO_PLANILHA", checkinId: null }
  if (!params.aluno) return { status: "ALUNO_NAO_IDENTIFICADO", checkinId: null }
  if (params.checkins.length === 0) return { status: "NAO_ENCONTRADO", checkinId: null }

  const checkinsValidos = params.checkins.filter((c) => c.status === "VALIDO")
  if (checkinsValidos.length === 0) {
    if (params.checkins.some((c) => c.status === "PENDENTE_REVISAO")) {
      return { status: "PENDENTE", checkinId: params.checkins[0]?.id ?? null }
    }
    return { status: "CHECKIN_INVALIDADO", checkinId: params.checkins[0]?.id ?? null }
  }

  const horarioReferencia = params.horarioReferencia
  if (horarioReferencia) {
    const porHorario = checkinsValidos.find((checkin) =>
      horarioCompativel(checkin.aula.inicio, horarioReferencia),
    )
    if (!porHorario) return { status: "DIVERGENCIA_HORARIO", checkinId: null }
    return { status: "CONCILIADO", checkinId: porHorario.id }
  }

  if (checkinsValidos.length > 1) return { status: "DUPLICADO_SISTEMA", checkinId: null }
  return { status: "CONCILIADO", checkinId: checkinsValidos[0]?.id ?? null }
}

export async function importarCsvConciliacao(params: {
  plataforma: Plataforma
  arquivo: string
  conteudo: string
  autorId: string
}) {
  return importarLinhasConciliacao({
    plataforma: params.plataforma,
    arquivo: params.arquivo,
    linhas: parseCsv(params.conteudo),
    autorId: params.autorId,
  })
}

export async function importarPlanilhaConciliacao(params: {
  plataforma: Plataforma
  arquivo: string
  conteudo: string | Buffer
  tipoArquivo: "csv" | "xlsx"
  autorId: string
}) {
  const linhas =
    params.tipoArquivo === "csv"
      ? parseCsv(params.conteudo.toString())
      : await parseXlsx(params.conteudo as Buffer)

  return importarLinhasConciliacao({
    plataforma: params.plataforma,
    arquivo: params.arquivo,
    linhas,
    autorId: params.autorId,
  })
}

async function importarLinhasConciliacao(params: ImportarLinhasConciliacaoParams) {
  const linhas = params.linhas.map(normalizarLinha)
  const alunos = await db.aluno.findMany({
    where: { tipo: params.plataforma },
    select: {
      id: true,
      cpf: true,
      telefone: true,
      idExterno: true,
      usuario: { select: { nome: true, email: true } },
    },
  })
  const alunosIdentificacao = alunos.map((aluno) => ({
    id: aluno.id,
    cpf: aluno.cpf,
    telefone: aluno.telefone,
    idExterno: aluno.idExterno,
    nome: aluno.usuario.nome,
    email: aluno.usuario.email,
  }))

  const assinaturas = new Set<string>()
  const registrosPreparados: Array<{
    linha: LinhaImportada
    alunoId: string | null
    checkinVinculadoId: string | null
    statusConciliacao: StatusConciliacao
  }> = []

  for (const linha of linhas) {
    const assinatura = assinaturaLinha(linha)
    const duplicadoPlanilha = assinaturas.has(assinatura)
    assinaturas.add(assinatura)

    const aluno = identificarAluno(linha, alunosIdentificacao)
    const checkins =
      aluno && linha.dataReferencia
        ? await db.checkin.findMany({
            where: {
              alunoId: aluno.id,
              aula: intervaloDaData(linha.dataReferencia),
            },
            include: { aula: { select: { inicio: true } } },
          })
        : []
    const classificacao = classificarConciliacao({
      aluno,
      checkins,
      horarioReferencia: linha.horarioReferencia,
      duplicadoPlanilha,
    })

    registrosPreparados.push({
      linha,
      alunoId: aluno?.id ?? null,
      checkinVinculadoId: classificacao.checkinId,
      statusConciliacao: classificacao.status,
    })
  }

  const totais = resumirStatus(registrosPreparados.map((r) => r.statusConciliacao))

  return db.$transaction(async (tx) => {
    const importacao = await tx.importacao.create({
      data: {
        plataforma: params.plataforma,
        arquivo: params.arquivo,
        importadoPorId: params.autorId,
        totalLinhas: registrosPreparados.length,
        totalConciliados: totais.conciliados,
        totalNaoConciliados: totais.naoConciliados,
        totalDivergencias: totais.divergencias,
      },
    })

    for (const registro of registrosPreparados) {
      await tx.registroImportado.create({
        data: {
          importacaoId: importacao.id,
          dadosBrutos: registro.linha.dadosBrutos as Prisma.InputJsonObject,
          valorRepasse: registro.linha.valorRepasse,
          cpf: registro.linha.cpf,
          email: registro.linha.email,
          nome: registro.linha.nome,
          telefone: registro.linha.telefone,
          dataReferencia: registro.linha.dataReferencia,
          horarioReferencia: registro.linha.horarioReferencia,
          alunoId: registro.alunoId,
          checkinVinculadoId: registro.checkinVinculadoId,
          statusConciliacao: registro.statusConciliacao,
        },
      })
    }

    await registrarLog(
      {
        autorId: params.autorId,
        acao: "IMPORTACAO",
        entidade: "Importacao",
        entidadeId: importacao.id,
        valorNovo: {
          plataforma: importacao.plataforma,
          arquivo: importacao.arquivo,
          totalLinhas: importacao.totalLinhas,
          totalConciliados: importacao.totalConciliados,
          totalNaoConciliados: importacao.totalNaoConciliados,
          totalDivergencias: importacao.totalDivergencias,
        },
      },
      tx,
    )

    return importacao
  })
}

export async function resolverConciliacaoManual(params: {
  registroId: string
  alunoId?: string | null
  checkinId?: string | null
  status: StatusConciliacao
  observacao?: string | null
  autorId: string
}) {
  const anterior = await db.registroImportado.findUnique({ where: { id: params.registroId } })
  if (!anterior) return { ok: false as const, motivo: "Registro não encontrado." }

  const registro = await db.$transaction(async (tx) => {
    const atualizado = await tx.registroImportado.update({
      where: { id: params.registroId },
      data: {
        alunoId: params.alunoId ?? anterior.alunoId,
        checkinVinculadoId: params.checkinId ?? anterior.checkinVinculadoId,
        statusConciliacao: params.status,
        observacao: params.observacao ?? null,
        resolvidoPorId: params.autorId,
        resolvidoEm: new Date(),
      },
    })

    await registrarLog(
      {
        autorId: params.autorId,
        acao: "CONCILIACAO_MANUAL",
        entidade: "RegistroImportado",
        entidadeId: atualizado.id,
        valorAntigo: {
          alunoId: anterior.alunoId,
          checkinVinculadoId: anterior.checkinVinculadoId,
          statusConciliacao: anterior.statusConciliacao,
        },
        valorNovo: {
          alunoId: atualizado.alunoId,
          checkinVinculadoId: atualizado.checkinVinculadoId,
          statusConciliacao: atualizado.statusConciliacao,
        },
        justificativa: params.observacao ?? null,
      },
      tx,
    )

    return atualizado
  })

  return { ok: true as const, registro }
}

function parseLinhasPlanilha(linhas: Row[]): Record<string, string>[] {
  const primeiraLinha = linhas.findIndex((linha) => linha.some((celula) => celula !== null))
  if (primeiraLinha < 0) return []

  const cabecalhos = linhas[primeiraLinha].map((celula) => valorCelulaParaTexto(celula).trim())
  if (cabecalhos.every((cabecalho) => cabecalho.length === 0)) return []

  return linhas
    .slice(primeiraLinha + 1)
    .filter((linha) => linha.some((celula) => valorCelulaParaTexto(celula).trim().length > 0))
    .map((linha) =>
      Object.fromEntries(
        cabecalhos
          .map((cabecalho, i) => [cabecalho, valorCelulaParaTexto(linha[i], cabecalho).trim()])
          .filter(([cabecalho]) => cabecalho.length > 0),
      ),
    )
}

function bufferParaArrayBuffer(buffer: Buffer): ArrayBuffer {
  const arrayBuffer = new ArrayBuffer(buffer.byteLength)
  new Uint8Array(arrayBuffer).set(buffer)
  return arrayBuffer
}

function valorCelulaParaTexto(valor: Row[number] | undefined, cabecalho = ""): string {
  if (valor === null || valor === undefined) return ""

  const chave = normalizarChave(cabecalho)
  if (valor instanceof Date) {
    if (chave.includes("hora") || chave.includes("time") || valor.getUTCFullYear() <= 1900) {
      return formatarHora(valor)
    }
    return formatarData(valor)
  }
  if (typeof valor === "number" && valor > 0 && valor < 1 && chave.includes("hora")) {
    return formatarFracaoDia(valor)
  }

  return String(valor)
}

function formatarData(data: Date): string {
  const dia = String(data.getUTCDate()).padStart(2, "0")
  const mes = String(data.getUTCMonth() + 1).padStart(2, "0")
  const ano = data.getUTCFullYear()
  return `${dia}/${mes}/${ano}`
}

function formatarHora(data: Date): string {
  const hora = String(data.getUTCHours()).padStart(2, "0")
  const minuto = String(data.getUTCMinutes()).padStart(2, "0")
  return `${hora}:${minuto}`
}

function formatarFracaoDia(valor: number): string {
  const minutosNoDia = 24 * 60
  const totalMinutos = Math.round(valor * minutosNoDia) % minutosNoDia
  const hora = String(Math.floor(totalMinutos / 60)).padStart(2, "0")
  const minuto = String(totalMinutos % 60).padStart(2, "0")
  return `${hora}:${minuto}`
}

function escolherSeparador(linha: string): "," | ";" {
  return linha.split(";").length > linha.split(",").length ? ";" : ","
}

function parseLinhaCsv(linha: string, separador: "," | ";"): string[] {
  const valores: string[] = []
  let atual = ""
  let emAspas = false

  for (let i = 0; i < linha.length; i++) {
    const char = linha[i]
    const proximo = linha[i + 1]
    if (char === '"' && proximo === '"') {
      atual += '"'
      i++
    } else if (char === '"') {
      emAspas = !emAspas
    } else if (char === separador && !emAspas) {
      valores.push(atual)
      atual = ""
    } else {
      atual += char
    }
  }
  valores.push(atual)
  return valores
}

function normalizarChave(chave: string): string {
  return chave
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-zA-Z0-9]/g, "")
    .toLowerCase()
}

function pegar(mapa: Map<string, string>, chaves: string[]): string | undefined {
  return chaves
    .map(normalizarChave)
    .map((chave) => mapa.get(chave))
    .find((valor) => valor && valor.length > 0)
}

function normalizarTexto(valor?: string): string | null {
  const v = valor?.trim()
  return v && v.length > 0 ? v : null
}

function apenasDigitos(valor?: string): string {
  return valor?.replace(/\D/g, "") ?? ""
}

function normalizarBusca(valor: string): string {
  return valor
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase()
}

function parseData(valor?: string): Date | null {
  if (!valor) return null
  const v = valor.trim()
  const br = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(v)
  if (br) return new Date(Date.UTC(Number(br[3]), Number(br[2]) - 1, Number(br[1]), 12))
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(v)
  if (iso) return new Date(Date.UTC(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]), 12))
  return null
}

function parseValorMonetario(valor?: string): number | null {
  if (!valor) return null
  const limpo = valor.trim().replace(/\s/g, "").replace(/^R\$/i, "")
  if (!limpo) return null

  const normalizado =
    limpo.includes(",") && limpo.includes(".")
      ? limpo.replace(/\./g, "").replace(",", ".")
      : limpo.replace(",", ".")
  const numero = Number(normalizado)
  return Number.isFinite(numero) ? numero : null
}

function normalizarHora(valor?: string): string | null {
  if (!valor) return null
  const m = /^(\d{1,2}):(\d{2})/.exec(valor.trim())
  if (!m) return null
  return `${m[1].padStart(2, "0")}:${m[2]}`
}

function intervaloDaData(data: Date) {
  const inicio = new Date(data)
  inicio.setUTCHours(0, 0, 0, 0)
  const fim = new Date(inicio)
  fim.setUTCDate(fim.getUTCDate() + 1)
  return { inicio: { gte: inicio, lt: fim } }
}

function horarioCompativel(data: Date, horario: string): boolean {
  const [h, m] = horario.split(":").map(Number)
  const alvoMin = h * 60 + m
  const dataMin = data.getUTCHours() * 60 + data.getUTCMinutes()
  return Math.abs(dataMin - alvoMin) <= 60
}

function assinaturaLinha(linha: LinhaImportada): string {
  return [
    linha.cpf,
    linha.email,
    linha.nome,
    linha.telefone,
    linha.idExterno,
    linha.valorRepasse,
    linha.dataReferencia?.toISOString(),
    linha.horarioReferencia,
  ].join("|")
}

function resumirStatus(statuses: StatusConciliacao[]) {
  const conciliados = statuses.filter((s) => s === "CONCILIADO").length
  const divergencias = statuses.filter((s) =>
    [
      "DIVERGENCIA_DATA",
      "DIVERGENCIA_HORARIO",
      "CHECKIN_INVALIDADO",
      "DUPLICADO_PLANILHA",
      "DUPLICADO_SISTEMA",
    ].includes(s),
  ).length
  return {
    conciliados,
    divergencias,
    naoConciliados: statuses.length - conciliados,
  }
}

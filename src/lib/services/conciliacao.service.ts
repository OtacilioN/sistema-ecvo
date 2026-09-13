import "server-only"
import type { Importacao, Plataforma, Prisma, StatusConciliacao } from "@prisma/client"
import readXlsxFile, { type Row } from "read-excel-file/universal"
import { STATUS_ALUNO_OPERACIONAIS } from "@/lib/alunos/status"
import { db } from "@/lib/db"
import { registrarLog } from "@/lib/services/auditoria.service"
import {
  fimExclusivoDoDiaAcademia,
  formatarDataInput,
  formatarHora as formatarHoraAcademia,
  inicioDoDiaAcademia,
} from "@/lib/utils/datas"
import { cpfValido, formatarCPF } from "@/lib/utils/formato"

export type LinhaImportada = {
  dadosBrutos: Record<string, string>
  cpf: string | null
  email: string | null
  nome: string | null
  telefone: string | null
  idExterno: string | null
  totalCheckins: number | null
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

type CheckinConciliacao = {
  id: string
  status: "VALIDO" | "PENDENTE_REVISAO" | "INVALIDADO" | "EXCLUIDO"
  realizadoEm?: Date
  associadoAutomaticamente?: boolean
  aula: { inicio: Date }
}

type ImportarLinhasConciliacaoParams = {
  plataforma: Plataforma
  arquivo: string
  linhas: Record<string, string>[]
  autorId: string
  competencia?: string
}

export function parseCsv(texto: string): Record<string, string>[] {
  const conteudo = texto.replace(/^\uFEFF/, "")
  const separador = escolherSeparador(conteudo.split(/\r?\n/, 1)[0])
  const linhas = parseRegistrosCsv(conteudo, separador)
  if (linhas.length < 2) return []
  const cabecalhos = linhas[0].map((h) => h.trim())
  if (new Set(cabecalhos.map(normalizarChave)).size !== cabecalhos.length)
    throw new ErroImportacaoConciliacao("O CSV contém colunas duplicadas.")
  return linhas.slice(1).map((valores) => {
    if (valores.length !== cabecalhos.length)
      throw new ErroImportacaoConciliacao(
        "Linha CSV inválida: quantidade de colunas diferente do cabeçalho.",
      )
    return Object.fromEntries(cabecalhos.map((cabecalho, i) => [cabecalho, valores[i].trim()]))
  })
}

export async function parseXlsx(arquivo: Buffer): Promise<Record<string, string>[]> {
  const abas = await readXlsxFile(bufferParaArrayBuffer(arquivo))
  const aba = abas.find((item) => normalizarBusca(item.sheet) === "dados de visitantes") ?? abas[0]
  return aba ? parseLinhasPlanilha(aba.data) : []
}

export function normalizarLinha(raw: Record<string, string>): LinhaImportada {
  const mapa = new Map(Object.entries(raw).map(([k, v]) => [normalizarChave(k), v.trim()]))
  const cpf = apenasDigitos(pegar(mapa, ["cpf", "documento"]))
  const telefone = apenasDigitos(pegar(mapa, ["telefone", "celular", "whatsapp"]))
  const email = normalizarTexto(pegar(mapa, ["email", "e-mail"]))
  const nome = normalizarTexto(pegar(mapa, ["nome", "aluno", "name", "visitante"]))
  const idExterno = normalizarTexto(
    pegar(mapa, ["iddowellhub", "idexterno", "identificadorexterno", "identificador", "id"]),
  )
  const valorRepasse = parseValorMonetario(
    pegar(mapa, [
      "pagamentototal",
      "valor",
      "valorrepasse",
      "repasse",
      "valorliquido",
      "valorliquidototal",
      "pagamento",
      "receita",
    ]),
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
    totalCheckins: pegar(mapa, ["totaldecheckins"])
      ? Number(pegar(mapa, ["totaldecheckins"]))
      : null,
    valorRepasse,
    dataReferencia,
    horarioReferencia,
  }
}

export function identificarAluno(
  linha: LinhaImportada,
  alunos: AlunoIdentificacao[],
): AlunoIdentificacao | null {
  // O identificador da plataforma é estável entre contas; nunca substituir por nome.
  if (linha.idExterno) {
    const matches = alunos.filter((aluno) => aluno.idExterno === linha.idExterno)
    if (matches.length > 0) return matches.length === 1 ? matches[0] : null
  }
  const criterios = [
    (aluno: AlunoIdentificacao) =>
      Boolean(linha.cpf && aluno.cpf?.replace(/\D/g, "") === linha.cpf),
    (aluno: AlunoIdentificacao) =>
      Boolean(linha.email && aluno.email.toLowerCase() === linha.email),
    (aluno: AlunoIdentificacao) =>
      Boolean(linha.nome && normalizarBusca(aluno.nome) === normalizarBusca(linha.nome)),
    (aluno: AlunoIdentificacao) =>
      Boolean(linha.telefone && aluno.telefone?.replace(/\D/g, "") === linha.telefone),
  ]
  for (const criterio of criterios) {
    const matches = alunos.filter(criterio)
    if (matches.length > 1) return null
    if (matches.length === 1) {
      const aluno = matches[0]
      if (linha.idExterno && aluno.idExterno && aluno.idExterno !== linha.idExterno) return null
      return aluno
    }
  }
  return null
}

// O relatório TotalPass identifica pessoas pelo CPF, nunca pelo ID da plataforma.
export function identificarAlunoTotalpass(
  linha: LinhaImportada,
  alunos: AlunoIdentificacao[],
): AlunoIdentificacao | null {
  const porCpf = alunos.filter(
    (aluno) => linha.cpf && apenasDigitos(aluno.cpf ?? undefined) === linha.cpf,
  )
  if (porCpf.length) return porCpf.length === 1 ? porCpf[0] : null
  const criterios = [
    (aluno: AlunoIdentificacao) =>
      Boolean(linha.email && aluno.email.toLowerCase() === linha.email),
    (aluno: AlunoIdentificacao) =>
      Boolean(linha.nome && normalizarBusca(aluno.nome) === normalizarBusca(linha.nome)),
  ]
  for (const criterio of criterios) {
    const matches = alunos.filter(criterio)
    if (matches.length > 1) return null
    if (matches.length === 1) {
      const aluno = matches[0]
      if (aluno.cpf && apenasDigitos(aluno.cpf) !== linha.cpf) return null
      if (
        linha.nome &&
        alunos.some(
          (outro) =>
            outro.id !== aluno.id &&
            normalizarBusca(outro.nome) === normalizarBusca(linha.nome ?? ""),
        )
      )
        return null
      return aluno
    }
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
      horarioCompativel(
        checkin.associadoAutomaticamente && checkin.realizadoEm
          ? checkin.realizadoEm
          : checkin.aula.inicio,
        horarioReferencia,
      ),
    )
    if (!porHorario) return { status: "DIVERGENCIA_HORARIO", checkinId: null }
    return { status: "CONCILIADO", checkinId: porHorario.id }
  }

  if (checkinsValidos.length > 1) return { status: "DUPLICADO_SISTEMA", checkinId: null }
  return { status: "CONCILIADO", checkinId: checkinsValidos[0]?.id ?? null }
}

export async function importarCsvConciliacao(params: {
  competencia?: string
  plataforma: Plataforma
  arquivo: string
  conteudo: string
  autorId: string
}) {
  return importarLinhasConciliacao({
    plataforma: params.plataforma,
    arquivo: params.arquivo,
    linhas: parseCsv(params.conteudo),
    competencia: params.competencia,
    autorId: params.autorId,
  })
}

export class ErroImportacaoConciliacao extends Error {}

type ArquivoConciliacao = {
  arquivo: string
  conteudo: string | Buffer
  tipoArquivo: "csv" | "xlsx"
}

export async function importarPlanilhaConciliacao(
  params: ArquivoConciliacao & {
    plataforma: Plataforma
    competencia?: string
    autorId: string
  },
) {
  const linhas =
    params.tipoArquivo === "csv"
      ? parseCsv(params.conteudo.toString())
      : await parseXlsx(params.conteudo as Buffer)
  return importarLinhasConciliacao({ ...params, linhas })
}

export async function importarPlanilhasConciliacao(params: {
  plataforma: Plataforma
  competencia: string
  arquivos: ArquivoConciliacao[]
  autorId: string
}) {
  validarCompetencia(params.competencia)
  if (params.arquivos.length < 1 || params.arquivos.length > 2) {
    throw new ErroImportacaoConciliacao("Selecione um ou dois arquivos para a competência.")
  }
  // Todos os arquivos são interpretados e validados antes de qualquer gravação.
  const preparados = await Promise.all(
    params.arquivos.map(async (arquivo) => {
      const linhas =
        arquivo.tipoArquivo === "csv"
          ? parseCsv(arquivo.conteudo.toString())
          : await parseXlsx(arquivo.conteudo as Buffer)
      validarLinhasImportacao(linhas, params.plataforma, params.competencia)
      return { ...arquivo, linhas }
    }),
  )
  return db.$transaction(
    async (tx) => {
      const importacoes = []
      for (const preparado of preparados) {
        importacoes.push(
          await importarLinhasConciliacao(
            {
              ...preparado,
              plataforma: params.plataforma,
              competencia: params.competencia,
              autorId: params.autorId,
            },
            tx,
          ),
        )
      }
      return importacoes
    },
    { timeout: 30_000 },
  )
}

const CABECALHOS_RESUMO_WELLHUB = [
  "id da unidade",
  "unidade",
  "visitante",
  "id do wellhub",
  "total de check-ins",
  "pagamento total",
].map(normalizarChave)

const CABECALHOS_RESUMO_TOTALPASS = ["nome", "documento", "email", "valorliquidototal"]

function validarCompetencia(competencia?: string): asserts competencia is string {
  if (!competencia || !/^(?!0000)\d{4}-(0[1-9]|1[0-2])$/.test(competencia)) {
    throw new ErroImportacaoConciliacao("Informe o mês de referência no formato AAAA-MM.")
  }
}

function validarLinhasImportacao(
  raw: Record<string, string>[],
  plataforma: Plataforma,
  competencia?: string,
) {
  if (raw.length === 0)
    throw new ErroImportacaoConciliacao("A planilha não contém registros para importar.")
  const chaves = Object.keys(raw[0]).map(normalizarChave)
  const resumoTotalpass = CABECALHOS_RESUMO_TOTALPASS.every((chave) => chaves.includes(chave))
  if (chaves.includes("valorliquidototal")) {
    if (!resumoTotalpass)
      throw new ErroImportacaoConciliacao(
        "O resumo TotalPass não contém todas as colunas obrigatórias.",
      )
    if (plataforma !== "TOTALPASS")
      throw new ErroImportacaoConciliacao("O resumo de receita líquida pertence ao TotalPass.")
    validarCompetencia(competencia)
    const cpfs = new Set<string>()
    raw.forEach((item, indice) => {
      const linha = normalizarLinha(item)
      if (
        !linha.nome ||
        !linha.cpf ||
        !cpfValido(linha.cpf) ||
        !linha.email ||
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(linha.email) ||
        linha.valorRepasse === null ||
        linha.valorRepasse < 0 ||
        linha.valorRepasse > 99999999.99 ||
        Math.abs(linha.valorRepasse * 100 - Math.round(linha.valorRepasse * 100)) > 0.0001
      )
        throw new ErroImportacaoConciliacao(
          `Linha TotalPass ${indice + 1} inválida: confira nome, CPF, email e valor líquido total.`,
        )
      if (cpfs.has(linha.cpf))
        throw new ErroImportacaoConciliacao(
          "O mesmo CPF aparece mais de uma vez no resumo TotalPass. Corrija a planilha antes de importar.",
        )
      cpfs.add(linha.cpf)
    })
    return {
      unidadeExternaId: "TOTALPASS_MENSAL",
      unidadeExternaNome: "Relatório mensal TotalPass",
    }
  }
  const resumoMensal = CABECALHOS_RESUMO_WELLHUB.every((chave) => chaves.includes(chave))
  if (chaves.includes("iddowellhub") || chaves.includes("pagamentototal")) {
    if (!resumoMensal)
      throw new ErroImportacaoConciliacao(
        "O resumo Wellhub não contém todas as colunas obrigatórias.",
      )
  }
  if (!resumoMensal) {
    if (
      !raw.every((item) => {
        const linha = normalizarLinha(item)
        return (
          linha.dataReferencia &&
          (linha.cpf || linha.email || linha.nome || linha.telefone || linha.idExterno)
        )
      })
    )
      throw new ErroImportacaoConciliacao(
        "Planilha de acessos inválida: informe um identificador do aluno e a data em cada linha.",
      )
    return null
  }
  if (plataforma !== "WELLHUB")
    throw new ErroImportacaoConciliacao("O resumo de visitantes pertence ao Wellhub.")
  validarCompetencia(competencia)
  let unidadeExternaId = ""
  let unidadeExternaNome = ""
  const ids = new Set<string>()
  raw.forEach((item, indice) => {
    const linha = normalizarLinha(item)
    const mapa = new Map(
      Object.entries(item).map(([chave, valor]) => [normalizarChave(chave), valor.trim()]),
    )
    const unidadeId = pegar(mapa, ["iddaunidade"])
    const unidadeNome = pegar(mapa, ["unidade"])
    if (
      !unidadeId ||
      !unidadeNome ||
      !linha.nome ||
      !linha.idExterno ||
      !/^\d+$/.test(linha.idExterno) ||
      linha.totalCheckins === null ||
      !Number.isSafeInteger(linha.totalCheckins) ||
      linha.totalCheckins < 0 ||
      linha.totalCheckins > 2147483647 ||
      linha.valorRepasse === null ||
      linha.valorRepasse < 0 ||
      linha.valorRepasse > 99999999.99 ||
      Math.abs(linha.valorRepasse * 100 - Math.round(linha.valorRepasse * 100)) > 0.0001
    ) {
      throw new ErroImportacaoConciliacao(
        `Linha de visitante ${indice + 1} inválida: confira unidade, ID Wellhub, check-ins e pagamento total.`,
      )
    }
    if (
      unidadeExternaId &&
      (unidadeExternaId !== unidadeId || unidadeExternaNome !== unidadeNome)
    ) {
      throw new ErroImportacaoConciliacao("Cada arquivo deve conter somente uma unidade Wellhub.")
    }
    if (ids.has(linha.idExterno))
      throw new ErroImportacaoConciliacao(
        "O mesmo ID Wellhub aparece mais de uma vez na unidade. Corrija a planilha antes de importar.",
      )
    ids.add(linha.idExterno)
    unidadeExternaId = unidadeId
    unidadeExternaNome = unidadeNome
  })
  return { unidadeExternaId, unidadeExternaNome }
}

async function importarLinhasConciliacao(
  params: ImportarLinhasConciliacaoParams,
  transacao?: Prisma.TransactionClient,
): Promise<Importacao> {
  const resumo = validarLinhasImportacao(params.linhas, params.plataforma, params.competencia)
  if (!transacao)
    return db.$transaction((tx) => importarLinhasConciliacao(params, tx), { timeout: 30_000 })
  const tx = transacao
  const mensalTotalpass = Boolean(resumo && params.plataforma === "TOTALPASS")
  const linhas = params.linhas.map((raw) => {
    const linha = normalizarLinha(raw)
    return mensalTotalpass
      ? {
          ...linha,
          idExterno: null,
          totalCheckins: null,
          dataReferencia: null,
          horarioReferencia: null,
        }
      : linha
  })
  if (params.plataforma === "WELLHUB" || params.plataforma === "TOTALPASS") {
    // Ambos os formatos usam o mesmo lock: a checagem e a gravação são indivisíveis.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`conciliacao:${params.plataforma}`}))`
    let formatoConflitante: { id: string } | null
    if (resumo) {
      const referencia = new Date(`${params.competencia}-01T12:00:00Z`)
      const inicio = inicioDoDiaAcademia(referencia)
      referencia.setUTCMonth(referencia.getUTCMonth() + 1)
      const fim = inicioDoDiaAcademia(referencia)
      formatoConflitante = await tx.importacao.findFirst({
        where: {
          plataforma: params.plataforma,
          resumoMensal: false,
          registros: { some: { dataReferencia: { gte: inicio, lt: fim } } },
        },
        select: { id: true },
      })
    } else {
      // Um CSV pode atravessar meses, e importações antigas não têm competência.
      // A data real de cada acesso define as competências, mesmo com mês informado.
      const competencias = [
        ...new Set(
          linhas.flatMap((linha) =>
            linha.dataReferencia ? [formatarDataInput(linha.dataReferencia).slice(0, 7)] : [],
          ),
        ),
      ]
      formatoConflitante = await tx.importacao.findFirst({
        where: {
          plataforma: params.plataforma,
          resumoMensal: true,
          competencia: { in: competencias },
        },
        select: { id: true },
      })
    }
    if (formatoConflitante)
      throw new ErroImportacaoConciliacao(
        `Não misture resumo mensal e registros diários ${params.plataforma === "WELLHUB" ? "Wellhub" : "TotalPass"} na mesma competência.`,
      )
  }
  if (resumo) {
    const existente = await tx.importacao.findFirst({
      where: {
        plataforma: params.plataforma,
        competencia: params.competencia,
        unidadeExternaId: resumo.unidadeExternaId,
      },
    })
    if (existente)
      throw new ErroImportacaoConciliacao(
        mensalTotalpass
          ? `O relatório mensal TotalPass já foi importado em ${params.competencia}. Este formato permite um arquivo por mês.`
          : `A unidade ${resumo.unidadeExternaNome} já foi importada em ${params.competencia}. Nenhum arquivo foi adicionado.`,
      )
  }
  const alunos = await tx.aluno.findMany({
    where: {
      tipo: params.plataforma,
      ...(resumo ? {} : { status: { in: [...STATUS_ALUNO_OPERACIONAIS] } }),
    },
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

    let aluno = mensalTotalpass
      ? identificarAlunoTotalpass(linha, alunosIdentificacao)
      : identificarAluno(linha, alunosIdentificacao)
    if (
      mensalTotalpass &&
      linha.cpf &&
      !alunosIdentificacao.some(
        (candidato) => apenasDigitos(candidato.cpf ?? undefined) === linha.cpf,
      )
    ) {
      // Uma resolução manual anterior é uma associação estável do CPF, sem alterar cadastro.
      const historicos = await tx.registroImportado.findMany({
        where: {
          cpf: linha.cpf,
          alunoId: { not: null },
          importacao: { plataforma: "TOTALPASS", resumoMensal: true },
        },
        select: { alunoId: true },
        distinct: ["alunoId"],
      })
      const idsHistoricos = [...new Set(historicos.map((registro) => registro.alunoId))]
      if (idsHistoricos.length > 0) {
        const historico =
          idsHistoricos.length === 1
            ? alunosIdentificacao.find((candidato) => candidato.id === idsHistoricos[0])
            : null
        aluno =
          historico && (!historico.cpf || apenasDigitos(historico.cpf) === linha.cpf)
            ? historico
            : null
      }
    }
    if (mensalTotalpass && aluno && linha.cpf) {
      const donoCpf = await tx.aluno.findFirst({
        where: { cpf: { in: [linha.cpf, formatarCPF(linha.cpf)] }, id: { not: aluno.id } },
        select: { id: true },
      })
      const conflito = await tx.registroImportado.findFirst({
        where: {
          OR: [
            { alunoId: aluno.id, cpf: { not: linha.cpf } },
            { cpf: linha.cpf, alunoId: { not: aluno.id } },
          ],
          importacao: { plataforma: "TOTALPASS", resumoMensal: true },
        },
        select: { id: true },
      })
      const conflitoNoArquivo = registrosPreparados.some(
        (registro) => registro.alunoId === aluno?.id && registro.linha.cpf !== linha.cpf,
      )
      if (donoCpf || conflito || conflitoNoArquivo) aluno = null
    }
    if (resumo && aluno && linha.idExterno) {
      const conflito = await tx.registroImportado.findFirst({
        where: {
          OR: [
            { alunoId: aluno.id, idExterno: { not: linha.idExterno } },
            { idExterno: linha.idExterno, alunoId: { not: aluno.id } },
          ],
          importacao: { plataforma: params.plataforma, resumoMensal: true },
        },
        select: { id: true },
      })
      const conflitoNoArquivo = registrosPreparados.some(
        (registro) =>
          registro.alunoId === aluno?.id && registro.linha.idExterno !== linha.idExterno,
      )
      if (conflito || conflitoNoArquivo) aluno = null
    }
    const checkins =
      !resumo && aluno && linha.dataReferencia
        ? await tx.checkin.findMany({
            where: {
              alunoId: aluno.id,
              OR: [
                {
                  associadoAutomaticamente: true,
                  realizadoEm: intervaloDaData(linha.dataReferencia).inicio,
                },
                {
                  associadoAutomaticamente: false,
                  aula: intervaloDaData(linha.dataReferencia),
                },
              ],
            },
            select: {
              id: true,
              status: true,
              realizadoEm: true,
              associadoAutomaticamente: true,
              aula: { select: { inicio: true } },
            },
          })
        : []
    const classificacao = resumo
      ? {
          status: aluno ? ("CONCILIADO" as const) : ("ALUNO_NAO_IDENTIFICADO" as const),
          checkinId: null,
        }
      : classificarConciliacao({
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

  {
    const importacao = await tx.importacao.create({
      data: {
        plataforma: params.plataforma,
        arquivo: params.arquivo,
        competencia: params.competencia ?? null,
        resumoMensal: Boolean(resumo),
        unidadeExternaId: resumo?.unidadeExternaId ?? null,
        unidadeExternaNome: resumo?.unidadeExternaNome ?? null,
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
          idExterno: registro.linha.idExterno,
          totalCheckins: registro.linha.totalCheckins,
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
          competencia: importacao.competencia,
          resumoMensal: importacao.resumoMensal,
          unidadeExternaId: importacao.unidadeExternaId,
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
  }
}

export async function resolverConciliacaoManual(params: {
  registroId: string
  alunoId?: string | null
  checkinId?: string | null
  status: StatusConciliacao
  observacao?: string | null
  autorId: string
}) {
  return db.$transaction(
    async (tx) => {
      const plataformaRegistro = await tx.registroImportado.findUnique({
        where: { id: params.registroId },
        select: { importacao: { select: { plataforma: true } } },
      })
      if (!plataformaRegistro) return { ok: false as const, motivo: "Registro não encontrado." }
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`conciliacao:${plataformaRegistro.importacao.plataforma}`}))`
      const anterior = await tx.registroImportado.findUnique({
        where: { id: params.registroId },
        include: { importacao: true },
      })
      if (!anterior) return { ok: false as const, motivo: "Registro não encontrado." }
      const alunoId = params.alunoId === undefined ? anterior.alunoId : params.alunoId
      const resumoMensal = anterior.importacao.resumoMensal
      if (
        resumoMensal &&
        !["CONCILIADO", "ALUNO_NAO_IDENTIFICADO", "PENDENTE"].includes(params.status)
      ) {
        return { ok: false as const, motivo: "Status inválido para um resumo financeiro mensal." }
      }
      if (resumoMensal && params.status === "CONCILIADO" && !alunoId) {
        return { ok: false as const, motivo: "Selecione o aluno para conciliar o resumo mensal." }
      }
      if (alunoId) {
        const aluno = await tx.aluno.findUnique({ where: { id: alunoId } })
        if (!aluno || aluno.tipo !== anterior.importacao.plataforma) {
          return {
            ok: false as const,
            motivo: "O aluno deve pertencer à plataforma da importação.",
          }
        }
        if (resumoMensal && anterior.importacao.plataforma === "TOTALPASS") {
          if (
            !anterior.cpf ||
            !cpfValido(anterior.cpf) ||
            (aluno.cpf && apenasDigitos(aluno.cpf) !== anterior.cpf)
          )
            return {
              ok: false as const,
              motivo: "O CPF TotalPass conflita com o cadastro do aluno.",
            }
          const outro = await tx.aluno.findFirst({
            where: { cpf: { in: [anterior.cpf, formatarCPF(anterior.cpf)] }, id: { not: alunoId } },
            select: { id: true },
          })
          const conflito = await tx.registroImportado.findFirst({
            where: {
              OR: [
                { cpf: anterior.cpf, alunoId: { not: alunoId } },
                { alunoId, cpf: { not: anterior.cpf } },
              ],
              importacao: { plataforma: "TOTALPASS", resumoMensal: true },
            },
            select: { id: true },
          })
          if (outro || conflito)
            return {
              ok: false as const,
              motivo:
                "O CPF TotalPass conflita com um vínculo existente. Confira o cadastro do aluno.",
            }
        }
        if (resumoMensal && anterior.importacao.plataforma === "WELLHUB" && anterior.idExterno) {
          const outro = await tx.aluno.findFirst({
            where: {
              tipo: anterior.importacao.plataforma,
              idExterno: anterior.idExterno,
              id: { not: alunoId },
            },
          })
          const conflitoHistorico = await tx.registroImportado.findFirst({
            where: {
              idExterno: anterior.idExterno,
              alunoId: { not: alunoId },
              importacao: { plataforma: anterior.importacao.plataforma, resumoMensal: true },
            },
            select: { id: true },
          })
          const outroIdHistorico = await tx.registroImportado.findFirst({
            where: {
              alunoId,
              idExterno: { not: anterior.idExterno },
              importacao: { plataforma: anterior.importacao.plataforma, resumoMensal: true },
            },
            select: { id: true },
          })
          if (
            outro ||
            conflitoHistorico ||
            outroIdHistorico ||
            (aluno.idExterno && aluno.idExterno !== anterior.idExterno)
          ) {
            return {
              ok: false as const,
              motivo:
                "O ID Wellhub conflita com um vínculo existente. Confira o cadastro do aluno.",
            }
          }
          if (!aluno.idExterno) {
            await tx.aluno.update({
              where: { id: alunoId },
              data: { idExterno: anterior.idExterno },
            })
            await registrarLog(
              {
                autorId: params.autorId,
                acao: "CONCILIACAO_MANUAL",
                entidade: "Aluno",
                entidadeId: alunoId,
                valorAntigo: { idExterno: null },
                valorNovo: { idExterno: anterior.idExterno },
                justificativa: "Vinculação do ID Wellhub na resolução do resumo mensal.",
              },
              tx,
            )
          }
        }
      }
      const checkinId = resumoMensal
        ? null
        : params.checkinId === undefined
          ? anterior.checkinVinculadoId
          : params.checkinId
      if (checkinId) {
        const checkin = await tx.checkin.findUnique({ where: { id: checkinId } })
        if (!checkin || checkin.alunoId !== alunoId)
          return { ok: false as const, motivo: "O check-in deve pertencer ao aluno selecionado." }
      }
      const identidadeMensal =
        anterior.importacao.plataforma === "TOTALPASS"
          ? anterior.cpf
            ? { cpf: anterior.cpf }
            : null
          : anterior.idExterno
            ? { idExterno: anterior.idExterno }
            : null
      const outrasLinhas =
        resumoMensal && params.status === "CONCILIADO" && identidadeMensal
          ? await tx.registroImportado.findMany({
              where: {
                id: { not: anterior.id },
                ...identidadeMensal,
                OR: [{ alunoId: null }, { alunoId }],
                statusConciliacao: { in: ["ALUNO_NAO_IDENTIFICADO", "PENDENTE"] },
                importacao: {
                  plataforma: anterior.importacao.plataforma,
                  resumoMensal: true,
                  competencia: anterior.importacao.competencia,
                },
              },
            })
          : []
      const importacoesAfetadas = new Set<string>()
      let atualizado: Awaited<ReturnType<typeof tx.registroImportado.update>> | null = null
      for (const linhaAnterior of [anterior, ...outrasLinhas]) {
        const registro = await tx.registroImportado.update({
          where: { id: linhaAnterior.id },
          data: {
            alunoId,
            checkinVinculadoId: checkinId,
            statusConciliacao: params.status,
            observacao: params.observacao ?? null,
            resolvidoPorId: params.autorId,
            resolvidoEm: new Date(),
          },
        })
        if (linhaAnterior.id === anterior.id) atualizado = registro
        importacoesAfetadas.add(linhaAnterior.importacaoId)
        await registrarLog(
          {
            autorId: params.autorId,
            acao: "CONCILIACAO_MANUAL",
            entidade: "RegistroImportado",
            entidadeId: registro.id,
            valorAntigo: {
              alunoId: linhaAnterior.alunoId,
              checkinVinculadoId: linhaAnterior.checkinVinculadoId,
              statusConciliacao: linhaAnterior.statusConciliacao,
            },
            valorNovo: {
              alunoId: registro.alunoId,
              checkinVinculadoId: registro.checkinVinculadoId,
              statusConciliacao: registro.statusConciliacao,
            },
            justificativa:
              params.observacao ??
              (linhaAnterior.id !== anterior.id
                ? "Vínculo mensal aplicado à mesma identidade na competência."
                : null),
          },
          tx,
        )
      }
      for (const importacaoId of importacoesAfetadas) {
        const statuses = await tx.registroImportado.findMany({
          where: { importacaoId },
          select: { statusConciliacao: true },
        })
        const totais = resumirStatus(statuses.map((item) => item.statusConciliacao))
        await tx.importacao.update({
          where: { id: importacaoId },
          data: {
            totalConciliados: totais.conciliados,
            totalNaoConciliados: totais.naoConciliados,
            totalDivergencias: totais.divergencias,
          },
        })
      }
      return { ok: true as const, registro: atualizado }
    },
    { timeout: 30_000 },
  )
}

function parseLinhasPlanilha(linhas: Row[]): Record<string, string>[] {
  const linhaWellhub = linhas.findIndex((linha) => {
    const chaves = linha.map((celula) => normalizarChave(valorCelulaParaTexto(celula)))
    return CABECALHOS_RESUMO_WELLHUB.every((chave) => chaves.includes(chave))
  })
  const primeiraLinha =
    linhaWellhub >= 0
      ? linhaWellhub
      : linhas.findIndex((linha) => linha.some((celula) => celula !== null))
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

function parseRegistrosCsv(texto: string, separador: "," | ";"): string[][] {
  const registros: string[][] = []
  let valores: string[] = []
  let atual = ""
  let emAspas = false
  const finalizar = () => {
    valores.push(atual)
    if (valores.some((valor) => valor.trim().length > 0)) registros.push(valores)
    valores = []
    atual = ""
  }
  for (let i = 0; i < texto.length; i++) {
    const char = texto[i]
    if (char === '"' && emAspas && texto[i + 1] === '"') {
      atual += '"'
      i++
    } else if (char === '"') {
      emAspas = !emAspas
    } else if (char === separador && !emAspas) {
      valores.push(atual)
      atual = ""
    } else if ((char === "\n" || char === "\r") && !emAspas) {
      finalizar()
      if (char === "\r" && texto[i + 1] === "\n") i++
    } else {
      atual += char
    }
  }
  if (emAspas) throw new ErroImportacaoConciliacao("CSV inválido: campo com aspas não encerradas.")
  finalizar()
  return registros
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
  const inicio = inicioDoDiaAcademia(data)
  const fim = fimExclusivoDoDiaAcademia(data)
  return { inicio: { gte: inicio, lt: fim } }
}

function horarioCompativel(data: Date, horario: string): boolean {
  const [h, m] = horario.split(":").map(Number)
  const alvoMin = h * 60 + m
  const [horaData, minutoData] = formatarHoraAcademia(data).split(":").map(Number)
  const dataMin = horaData * 60 + minutoData
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

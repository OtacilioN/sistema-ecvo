import "server-only"
import { Prisma, type StatusMensalidade } from "@prisma/client"
import { db } from "@/lib/db"

export type SituacaoMensalidadePagante = StatusMensalidade | "SEM_MENSALIDADE"

export type RegistroMensalidadePagante = {
  alunoId: string
  nome: string
  competencia: string
  status: StatusMensalidade
}

export type AlunoEvolucaoPagantes = {
  id: string
  nome: string
  situacaoAnterior: SituacaoMensalidadePagante
  situacaoAtual: SituacaoMensalidadePagante
  primeiraCompetenciaPaga: string | null
}

export type ResumoEvolucaoPagantes = {
  pagantesAnterior: number
  pagantesAtual: number
  saidas: number
  recorrentes: number
  novos: number
  retornos: number
  entradas: number
  saldo: number
  /** Percentual entre 0 e 100; null quando não há pagantes na base anterior. */
  retencao: number | null
}

export type ListasEvolucaoPagantes = {
  saidas: AlunoEvolucaoPagantes[]
  recorrentes: AlunoEvolucaoPagantes[]
  novos: AlunoEvolucaoPagantes[]
  retornos: AlunoEvolucaoPagantes[]
}

export type ResumoEvolucaoMensal = ResumoEvolucaoPagantes & {
  competencia: string
  competenciaAnterior: string
  temBaseComparacao: boolean
}

export function validarCompetencia(competencia: string): boolean {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(competencia) && competencia >= "1901-01"
}

/** Aritmética civil: não depende do fuso do servidor ou de horário de verão. */
export function deslocarCompetencia(competencia: string, meses: number): string {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(competencia) || !Number.isInteger(meses)) {
    throw new Error("Competência inválida.")
  }
  const [ano, mes] = competencia.split("-").map(Number)
  const indice = ano * 12 + mes - 1 + meses
  const resultado = `${Math.floor(indice / 12)}-${String((indice % 12) + 1).padStart(2, "0")}`
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(resultado)) {
    throw new Error("Competência fora do intervalo permitido.")
  }
  return resultado
}

export function competenciaAtualPagantes(agora = new Date()): string {
  const partes = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Fortaleza",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(agora)
  return `${partes.find((parte) => parte.type === "year")!.value}-${partes.find((parte) => parte.type === "month")!.value}`
}

export function competenciaPadraoPagantes(agora = new Date()): string {
  return deslocarCompetencia(competenciaAtualPagantes(agora), -1)
}

export function rotularCompetencia(competencia: string): string {
  if (!validarCompetencia(competencia)) throw new Error("Competência inválida.")
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "UTC",
    month: "long",
    year: "numeric",
  }).format(new Date(`${competencia}-01T12:00:00Z`))
}

/**
 * Classifica por aluno e competência, independentemente de situação cadastral,
 * modalidade ou data do recebimento. Só PAGA compõe a base pagante.
 * primeirasPagas permite considerar pagamentos anteriores à janela exibida.
 */
export function classificarEvolucaoPagantes(
  registros: readonly RegistroMensalidadePagante[],
  competencia: string,
  primeirasPagas: ReadonlyMap<string, string> = new Map(),
): { resumo: ResumoEvolucaoPagantes; listas: ListasEvolucaoPagantes } {
  const anterior = deslocarCompetencia(competencia, -1)
  const primeiras = new Map(primeirasPagas)
  const alunos = new Map<string, AlunoEvolucaoPagantes>()

  for (const registro of registros) {
    if (registro.status === "PAGA" && registro.competencia <= competencia) {
      const primeira = primeiras.get(registro.alunoId)
      if (!primeira || registro.competencia < primeira) {
        primeiras.set(registro.alunoId, registro.competencia)
      }
    }
    if (registro.competencia !== anterior && registro.competencia !== competencia) continue
    const aluno = alunos.get(registro.alunoId) ?? {
      id: registro.alunoId,
      nome: registro.nome,
      situacaoAnterior: "SEM_MENSALIDADE",
      situacaoAtual: "SEM_MENSALIDADE",
      primeiraCompetenciaPaga: null,
    }
    if (registro.competencia === anterior) aluno.situacaoAnterior = registro.status
    else aluno.situacaoAtual = registro.status
    alunos.set(aluno.id, aluno)
  }

  const listas: ListasEvolucaoPagantes = { saidas: [], recorrentes: [], novos: [], retornos: [] }
  for (const aluno of alunos.values()) {
    aluno.primeiraCompetenciaPaga = primeiras.get(aluno.id) ?? null
    const pagouAnterior = aluno.situacaoAnterior === "PAGA"
    const pagouAtual = aluno.situacaoAtual === "PAGA"
    if (pagouAnterior && pagouAtual) listas.recorrentes.push(aluno)
    else if (pagouAnterior) listas.saidas.push(aluno)
    else if (pagouAtual) {
      if (aluno.primeiraCompetenciaPaga === competencia) listas.novos.push(aluno)
      else listas.retornos.push(aluno)
    }
  }

  for (const lista of Object.values(listas)) {
    lista.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR") || a.id.localeCompare(b.id))
  }
  const recorrentes = listas.recorrentes.length
  const saidas = listas.saidas.length
  const novos = listas.novos.length
  const retornos = listas.retornos.length
  const pagantesAnterior = recorrentes + saidas
  const entradas = novos + retornos
  return {
    listas,
    resumo: {
      pagantesAnterior,
      pagantesAtual: recorrentes + entradas,
      saidas,
      recorrentes,
      novos,
      retornos,
      entradas,
      saldo: entradas - saidas,
      retencao: pagantesAnterior ? (recorrentes / pagantesAnterior) * 100 : null,
    },
  }
}

export async function consultarEvolucaoPagantes(competencia?: string, agora = new Date()) {
  const competenciaAtual = competenciaAtualPagantes(agora)
  const selecionada = competencia ?? competenciaPadraoPagantes(agora)
  if (!validarCompetencia(selecionada) || selecionada > competenciaAtual) {
    throw new Error("Selecione uma competência válida até o mês atual.")
  }
  const inicioJanela = deslocarCompetencia(selecionada, -12)

  // Uma única fotografia dos dados: o recebimento de uma mensalidade durante a
  // consulta não pode deixar os totais, as listas e o histórico divergentes.
  const [mensalidades, primeirasPagas, inicioHistorico] = await db.$transaction(
    [
      db.mensalidade.findMany({
        where: { competencia: { gte: inicioJanela, lte: selecionada } },
        select: {
          alunoId: true,
          competencia: true,
          status: true,
          aluno: { select: { usuario: { select: { nome: true } } } },
        },
      }),
      db.mensalidade.groupBy({
        by: ["alunoId"],
        orderBy: { alunoId: "asc" },
        where: { status: "PAGA", competencia: { lte: selecionada } },
        _min: { competencia: true },
      }),
      db.mensalidade.aggregate({
        where: { competencia: { lte: competenciaAtual } },
        _min: { competencia: true },
      }),
    ],
    { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
  )

  const registros = mensalidades.map((mensalidade) => ({
    alunoId: mensalidade.alunoId,
    nome: mensalidade.aluno.usuario.nome,
    competencia: mensalidade.competencia,
    status: mensalidade.status,
  }))
  const primeiras = new Map<string, string>()
  for (const registro of primeirasPagas) {
    const primeira = registro._min?.competencia
    if (primeira) primeiras.set(registro.alunoId, primeira)
  }
  const primeiraCompetenciaDisponivel = inicioHistorico._min.competencia
  const temBaseComparacao = (mes: string) =>
    primeiraCompetenciaDisponivel !== null &&
    deslocarCompetencia(mes, -1) >= primeiraCompetenciaDisponivel
  const resultado = classificarEvolucaoPagantes(registros, selecionada, primeiras)
  const inicioTendencia = deslocarCompetencia(selecionada, -11)
  const primeiroMes =
    primeiraCompetenciaDisponivel && primeiraCompetenciaDisponivel > inicioTendencia
      ? primeiraCompetenciaDisponivel
      : inicioTendencia
  const historico: ResumoEvolucaoMensal[] = []
  for (
    let mes = primeiroMes;
    primeiraCompetenciaDisponivel && mes <= selecionada;
    mes = deslocarCompetencia(mes, 1)
  ) {
    historico.push({
      competencia: mes,
      competenciaAnterior: deslocarCompetencia(mes, -1),
      temBaseComparacao: temBaseComparacao(mes),
      ...classificarEvolucaoPagantes(registros, mes, primeiras).resumo,
    })
  }
  const competenciasDisponiveis: string[] = []
  const inicioOpcoes =
    primeiraCompetenciaDisponivel && primeiraCompetenciaDisponivel < selecionada
      ? primeiraCompetenciaDisponivel
      : selecionada
  for (let mes = competenciaAtual; mes >= inicioOpcoes; mes = deslocarCompetencia(mes, -1)) {
    competenciasDisponiveis.push(mes)
  }

  return {
    competencia: selecionada,
    competenciaAnterior: deslocarCompetencia(selecionada, -1),
    competenciaAtual,
    primeiraCompetenciaDisponivel,
    competenciasDisponiveis,
    mesEmAndamento: selecionada === competenciaAtual,
    temBaseComparacao: temBaseComparacao(selecionada),
    ...resultado,
    historico,
  }
}

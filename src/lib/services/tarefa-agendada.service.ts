import "server-only"
import { randomUUID } from "node:crypto"
import type { Prisma } from "@prisma/client"
import { db } from "@/lib/db"

// Maior que maxDuration=300 das rotas; uma instância encerrada pode ser retomada.
export const TEMPO_LEASE_TAREFA_SEGUNDOS = 360
const RETENCAO_HISTORICO_DIAS = 30
const ERRO_EXECUCAO = "A tarefa falhou. Consulte os diagnósticos do serviço responsável."
const ERRO_PARCIAL = "Uma ou mais etapas da tarefa não foram concluídas."
const ERRO_INFRAESTRUTURA = "Não foi possível registrar a execução da tarefa."
const ERRO_INTERRUPCAO = "A execução anterior não concluiu antes do término da reserva."

const NOMES_CONTADORES = new Set([
  "total",
  "analisadas",
  "analisados",
  "criadas",
  "criados",
  "atualizadas",
  "atualizados",
  "canceladas",
  "cancelados",
  "trancados",
  "trancadas",
  "removidas",
  "removidos",
  "excluidas",
  "excluidos",
  "enviados",
  "enviadas",
  "tentativas",
  "pagamentosAnalisados",
  "pagamentosAtualizados",
  "autorizacoesAtualizadas",
  "autorizacoesAnalisadas",
  "aulasCriadas",
  "turmasProcessadas",
  "modalidadesAtualizadas",
  "ofensivasAtualizadas",
  "semanas",
  "aulasEncontradas",
  "alunosNotificados",
  "modalidades",
  "alunos",
  "processadas",
  "processados",
  "falhas",
  "count",
  "expurgadas",
  "expurgados",
  "atrasadas",
  "notificacoesExpurgadas",
  "alunosProcessados",
  "existentes",
  "modalidadesAtualizadas",
  "ofensivasAtualizadas",
  "mensalidadesVencidas",
  "mensalidadesVencidasAtualizadas",
  "lembretesCriados",
  "lembretesPagamentoCriados",
  "inadimplenciasCriadas",
  "avisosAdimplenciaCriados",
  "alunosInadimplentesNotificados",
  "totalCriado",
])
const NOMES_ETAPAS = new Set([
  "financeiro",
  "aniversarios",
  "aluguel",
  "avulsos",
  "mensalidades",
  "precosAdimplencia",
  "adimplencia",
  "criacao",
  "reconciliacao",
  "treino",
  "expurgoNotificacoes",
  "execucoes",
  "ofensivas",
  "aulas",
  "pendencias",
  "limpeza",
  "notificacoes",
  "vencimentos",
])

/** Extrai só métricas conhecidas; não persiste IDs, mensagens, arrays nem payloads. */
export function contadoresSegurosTarefa(valor: unknown, profundidade = 0): Prisma.InputJsonObject {
  const contadores: Record<string, Prisma.InputJsonValue> = {}
  if (!valor || typeof valor !== "object" || Array.isArray(valor) || profundidade > 3)
    return contadores
  for (const [nome, item] of Object.entries(valor)) {
    if (
      NOMES_CONTADORES.has(nome) &&
      typeof item === "number" &&
      Number.isFinite(item) &&
      item >= 0
    ) {
      contadores[nome] = item
    } else if (NOMES_ETAPAS.has(nome)) {
      const filhos = contadoresSegurosTarefa(item, profundidade + 1)
      if (Object.keys(filhos).length) contadores[nome] = filhos
    }
  }
  return contadores
}

type ResultadoTarefa<T> =
  | { status: "CONCLUIDA"; execucaoId: string; resultado: T }
  | { status: "FALHOU"; execucaoId?: string; resultado?: T; erro: string }
  | { status: "IGNORADA"; motivo: "EM_EXECUCAO" }

function duracaoMs(inicio: Date, fim: Date) {
  return Math.min(2_147_483_647, Math.max(0, fim.getTime() - inicio.getTime()))
}

export async function executarTarefaAgendada<T>(params: {
  tarefa: string
  executar: () => Promise<T>
  avaliarResultado?: (resultado: T) => boolean
  agora?: () => Date
}): Promise<ResultadoTarefa<T>> {
  if (!/^[a-z][a-z0-9-]{0,79}$/.test(params.tarefa)) {
    return { status: "FALHOU", erro: "Nome de tarefa inválido." }
  }
  const agora = params.agora ?? (() => new Date())
  const inicio = agora()
  const execucaoId = randomUUID()
  let adquirida: boolean
  try {
    adquirida = await db.$transaction(async (tx) => {
      await tx.$executeRaw`
        INSERT INTO "ControleTarefaAgendada" ("tarefa") VALUES (${params.tarefa})
        ON CONFLICT ("tarefa") DO NOTHING
      `
      const anterior = await tx.controleTarefaAgendada.findUniqueOrThrow({
        where: { tarefa: params.tarefa },
      })
      const reserva = await tx.controleTarefaAgendada.updateMany({
        where: {
          tarefa: params.tarefa,
          OR: [{ leaseAte: null }, { leaseAte: { lte: inicio } }],
        },
        data: {
          execucaoAtualId: execucaoId,
          leaseAte: new Date(inicio.getTime() + TEMPO_LEASE_TAREFA_SEGUNDOS * 1000),
          ultimaExecucaoEm: inicio,
        },
      })
      if (reserva.count !== 1) return false
      if (anterior.execucaoAtualId) {
        await tx.execucaoTarefaAgendada.updateMany({
          where: { id: anterior.execucaoAtualId, status: "EM_EXECUCAO" },
          data: {
            status: "INTERROMPIDA",
            concluidoEm: inicio,
            duracaoMs: duracaoMs(anterior.ultimaExecucaoEm ?? inicio, inicio),
            erroSeguro: ERRO_INTERRUPCAO,
          },
        })
        await tx.controleTarefaAgendada.update({
          where: { tarefa: params.tarefa },
          data: { ultimaFalhaEm: inicio },
        })
      }
      await tx.execucaoTarefaAgendada.create({
        data: { id: execucaoId, tarefa: params.tarefa, iniciadoEm: inicio },
      })
      return true
    })
  } catch {
    // Sem reserva/histórico duráveis não executamos mutações de domínio.
    return { status: "FALHOU", erro: ERRO_INFRAESTRUTURA }
  }
  if (!adquirida) return { status: "IGNORADA", motivo: "EM_EXECUCAO" }

  let resultado: T | undefined
  let falhou = false
  let erro: string | undefined
  try {
    resultado = await params.executar()
    const sucesso = params.avaliarResultado
      ? params.avaliarResultado(resultado)
      : !(resultado && typeof resultado === "object" && "ok" in resultado && resultado.ok === false)
    if (!sucesso) {
      falhou = true
      erro = ERRO_PARCIAL
    }
  } catch {
    falhou = true
    erro = ERRO_EXECUCAO
  }

  const fim = agora()
  const expirou = fim.getTime() >= inicio.getTime() + TEMPO_LEASE_TAREFA_SEGUNDOS * 1000
  if (expirou) {
    falhou = true
    erro = ERRO_INTERRUPCAO
  }
  try {
    await db.$transaction(async (tx) => {
      // Fencing: uma execução antiga nunca libera ou sobrescreve a reserva nova.
      const liberada = await tx.controleTarefaAgendada.updateMany({
        where: { tarefa: params.tarefa, execucaoAtualId: execucaoId },
        data: {
          execucaoAtualId: null,
          leaseAte: null,
          ultimaConclusaoEm: fim,
          ...(falhou ? { ultimaFalhaEm: fim } : { ultimoSucessoEm: fim }),
        },
      })
      if (liberada.count !== 1) {
        falhou = true
        erro = ERRO_INTERRUPCAO
        return
      }
      await tx.execucaoTarefaAgendada.updateMany({
        where: { id: execucaoId, status: "EM_EXECUCAO" },
        data: {
          status: expirou ? "INTERROMPIDA" : falhou ? "FALHOU" : "CONCLUIDA",
          concluidoEm: fim,
          duracaoMs: duracaoMs(inicio, fim),
          contadores: contadoresSegurosTarefa(resultado),
          erroSeguro: erro ?? null,
        },
      })
    })
  } catch {
    return { status: "FALHOU", execucaoId, erro: ERRO_INFRAESTRUTURA }
  }
  if (falhou) return { status: "FALHOU", execucaoId, resultado, erro: erro ?? ERRO_EXECUCAO }
  return { status: "CONCLUIDA", execucaoId, resultado: resultado as T }
}

export async function expurgarExecucoesTarefasAntigas(agora = new Date()) {
  const limite = new Date(agora.getTime() - RETENCAO_HISTORICO_DIAS * 86_400_000)
  const { count } = await db.execucaoTarefaAgendada.deleteMany({
    where: { status: { not: "EM_EXECUCAO" }, concluidoEm: { lt: limite } },
  })
  return { ok: true as const, excluidas: count }
}

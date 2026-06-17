import "server-only"
import {
  type LinhaMonitoramentoAula,
  PRIORIDADE_STATUS_LINHA,
  type StatusLinha,
  type TentativaInadimplenteAula,
} from "@/lib/aula-monitoramento"
import { db } from "@/lib/db"

export async function carregarMonitoramentoAula(aulaId: string) {
  const aula = await db.aula.findUnique({
    where: { id: aulaId },
    include: {
      turma: { select: { modalidadeId: true, nome: true, modalidade: { select: { nome: true } } } },
      comparecimentos: { select: { alunoId: true, status: true } },
      checkins: {
        select: {
          id: true,
          alunoId: true,
          status: true,
          aluno: { select: { usuario: { select: { nome: true } } } },
        },
      },
      tentativasCheckinInadimplente: {
        orderBy: { criadoEm: "desc" },
        include: { aluno: { select: { usuario: { select: { nome: true } } } } },
      },
    },
  })
  if (!aula) return null

  const matriculados = await db.aluno.findMany({
    where: { status: "ATIVO", modalidades: { some: { id: aula.turma.modalidadeId } } },
    select: { id: true, observacoesTecnicas: true, usuario: { select: { nome: true } } },
  })

  const linhas = new Map<string, LinhaMonitoramentoAula>()
  for (const matriculado of matriculados) {
    linhas.set(matriculado.id, {
      alunoId: matriculado.id,
      nome: matriculado.usuario.nome,
      observacoesTecnicas: matriculado.observacoesTecnicas,
      status: "AUSENTE",
      checkinId: null,
      temComparecimento: false,
    })
  }

  for (const comparecimento of aula.comparecimentos) {
    const linha = linhas.get(comparecimento.alunoId)
    if (
      linha &&
      (comparecimento.status === "CONFIRMADO" || comparecimento.status === "CONVERTIDO_CHECKIN")
    ) {
      linha.status = "COMPARECEU"
      linha.temComparecimento = true
    } else if (linha && comparecimento.status === "LISTA_ESPERA") {
      linha.status = "LISTA_ESPERA"
    } else if (linha && comparecimento.status === "NO_SHOW") {
      linha.status = "NO_SHOW"
    }
  }

  for (const checkin of aula.checkins) {
    const nome = checkin.aluno.usuario.nome
    const linha = linhas.get(checkin.alunoId) ?? {
      alunoId: checkin.alunoId,
      nome,
      observacoesTecnicas: null,
      status: "AUSENTE" as StatusLinha,
      checkinId: null,
      temComparecimento: false,
    }
    if (checkin.status === "VALIDO") {
      linha.status = "PRESENTE"
      linha.checkinId = checkin.id
    } else if (checkin.status === "PENDENTE_REVISAO") {
      linha.status = "PENDENTE_REVISAO"
      linha.checkinId = checkin.id
    } else if (linha.status !== "PRESENTE") {
      linha.status = checkin.status === "EXCLUIDO" ? "EXCLUIDO" : "INVALIDADO"
    }
    linhas.set(checkin.alunoId, linha)
  }

  const tentativasPorAluno = new Map<string, TentativaInadimplenteAula>()
  for (const tentativa of aula.tentativasCheckinInadimplente) {
    const atual = tentativasPorAluno.get(tentativa.alunoId)
    if (atual) {
      atual.totalTentativas++
      continue
    }
    tentativasPorAluno.set(tentativa.alunoId, {
      alunoId: tentativa.alunoId,
      nome: tentativa.aluno.usuario.nome,
      motivo: tentativa.motivo,
      ultimaTentativaEm: tentativa.criadoEm,
      totalTentativas: 1,
    })
  }

  const lista = [...linhas.values()].sort(
    (a, b) =>
      PRIORIDADE_STATUS_LINHA[a.status] - PRIORIDADE_STATUS_LINHA[b.status] ||
      a.nome.localeCompare(b.nome),
  )

  return {
    aula,
    lista,
    presentes: lista.filter((linha) => linha.status === "PRESENTE").length,
    noShows: lista.filter((linha) => linha.status === "NO_SHOW").length,
    tentativasInadimplentes: [...tentativasPorAluno.values()].sort(
      (a, b) => b.ultimaTentativaEm.getTime() - a.ultimaTentativaEm.getTime(),
    ),
  }
}

import "server-only"
import { STATUS_ALUNO_OPERACIONAIS } from "@/lib/alunos/status"
import type { LinhaMonitoramentoAula, TentativaInadimplenteAula } from "@/lib/aula-monitoramento"
import { db } from "@/lib/db"
import { fimExclusivoDoDiaAcademia, inicioDoDiaAcademia } from "@/lib/utils/datas"

/** Consulta mínima da chamada: nunca carrega financeiro, fotos ou observações. */
export async function carregarChamadaRapida(aulaId: string) {
  const agora = new Date()
  const aula = await db.aula.findFirst({
    where: {
      id: aulaId,
      inicio: { gte: inicioDoDiaAcademia(agora), lt: fimExclusivoDoDiaAcademia(agora) },
      turma: { ativa: true, modalidade: { ativa: true } },
    },
    select: {
      turma: { select: { modalidadeId: true } },
      comparecimentos: { select: { alunoId: true, status: true } },
      checkins: {
        where: { aluno: { status: { in: [...STATUS_ALUNO_OPERACIONAIS] } } },
        select: {
          alunoId: true,
          status: true,
          aluno: { select: { usuario: { select: { nome: true } } } },
        },
      },
    },
  })
  if (!aula) return null
  const alunos = await db.aluno.findMany({
    where: {
      status: { in: [...STATUS_ALUNO_OPERACIONAIS] },
      modalidades: { some: { id: aula.turma.modalidadeId } },
    },
    select: { id: true, usuario: { select: { nome: true } } },
  })
  const novaLinha = (alunoId: string, nome: string): LinhaMonitoramentoAula => ({
    alunoId,
    nome,
    status: "AUSENTE",
    temComparecimento: false,
    observacoesTecnicas: null,
    historicoObservacoesTecnicas: [],
    checkinId: null,
    checkinRealizadoEm: null,
    checkinAssociadoAutomaticamente: false,
  })
  const linhas = new Map(alunos.map((aluno) => [aluno.id, novaLinha(aluno.id, aluno.usuario.nome)]))
  for (const comparecimento of aula.comparecimentos) {
    const linha = linhas.get(comparecimento.alunoId)
    if (!linha) continue
    if (["CONFIRMADO", "CONVERTIDO_CHECKIN"].includes(comparecimento.status)) {
      linha.status = "COMPARECEU"
      linha.temComparecimento = true
    } else if (comparecimento.status === "LISTA_ESPERA") linha.status = "LISTA_ESPERA"
  }
  for (const checkin of aula.checkins) {
    const linha =
      linhas.get(checkin.alunoId) ?? novaLinha(checkin.alunoId, checkin.aluno.usuario.nome)
    if (checkin.status === "VALIDO") linha.status = "PRESENTE"
    else if (checkin.status === "PENDENTE_REVISAO") linha.status = "PENDENTE_REVISAO"
    else linha.status = checkin.status === "EXCLUIDO" ? "EXCLUIDO" : "INVALIDADO"
    linhas.set(checkin.alunoId, linha)
  }
  return {
    lista: [...linhas.values()],
    tentativasInadimplentes: [] as TentativaInadimplenteAula[],
  }
}

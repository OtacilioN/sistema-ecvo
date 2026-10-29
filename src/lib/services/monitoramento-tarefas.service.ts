import "server-only"
import type { ControleTarefaAgendada } from "@prisma/client"
import { db } from "@/lib/db"
import { enviarPushParaNotificacoes } from "@/lib/services/notificacao.service"
import { TAREFAS_AGENDADAS } from "@/lib/tarefas-agendadas"

export function avaliarSaudeTarefa(
  controle: ControleTarefaAgendada | undefined,
  toleranciaMinutos: number,
  agora: Date,
) {
  if (!controle) return "AGUARDANDO" as const
  const referencia = controle.ultimoSucessoEm ?? controle.criadoEm
  // Uma tarefa travada pode ter lease; o prazo de sucesso continua valendo.
  if (agora.getTime() - referencia.getTime() > toleranciaMinutos * 60_000) {
    return "ATRASADA" as const
  }
  if (controle.leaseAte && controle.leaseAte > agora) return "EM_EXECUCAO" as const
  if (
    controle.ultimaFalhaEm &&
    (!controle.ultimoSucessoEm || controle.ultimaFalhaEm > controle.ultimoSucessoEm)
  ) {
    return "FALHA_RECENTE" as const
  }
  if (!controle.ultimoSucessoEm) return "AGUARDANDO" as const
  return "EM_DIA" as const
}

export async function listarSaudeTarefas(agora = new Date()) {
  const controles = await db.controleTarefaAgendada.findMany()
  const porTarefa = new Map(controles.map((controle) => [controle.tarefa, controle]))
  return TAREFAS_AGENDADAS.map((tarefa) => {
    const controle = porTarefa.get(tarefa.tarefa)
    return {
      ...tarefa,
      controle,
      saude: avaliarSaudeTarefa(controle, tarefa.toleranciaMinutos, agora),
    }
  })
}

export async function monitorarTarefasAgendadas() {
  // Também inicializa tarefas que nunca chegaram a executar: o período de tolerância
  // começa nesta implantação, evitando alarmes falsos e ausência silenciosa de jobs.
  await db.controleTarefaAgendada.createMany({
    data: TAREFAS_AGENDADAS.map(({ tarefa }) => ({ tarefa })),
    skipDuplicates: true,
  })
  const tarefas = await listarSaudeTarefas()
  const atrasadas = tarefas.filter((tarefa) => tarefa.saude === "ATRASADA")
  const gestores = atrasadas.length
    ? await db.usuario.findMany({ where: { papel: "GESTOR", ativo: true }, select: { id: true } })
    : []
  let total = 0
  for (const tarefa of atrasadas) {
    const referencia = tarefa.controle?.ultimoSucessoEm ?? tarefa.controle?.criadoEm
    if (!referencia) continue
    for (const gestor of gestores) {
      // Um aviso por incidente e gestor, mesmo com execuções repetidas do monitor.
      const chave = `tarefa-atrasada:${tarefa.tarefa}:${referencia.toISOString()}:${gestor.id}`
      const notificacao = {
        id: chave,
        usuarioId: gestor.id,
        tipo: "TAREFA_AGENDADA" as const,
        titulo: "Tarefa automática atrasada",
        mensagem: `${tarefa.nome} está sem conclusão no prazo esperado. Consulte Configurações > Tarefas automáticas.`,
        chaveDeduplicacao: chave,
      }
      const criada = await db.notificacao.createMany({ data: [notificacao], skipDuplicates: true })
      if (!criada.count) continue
      total++
      await enviarPushParaNotificacoes([notificacao])
    }
  }
  return { ok: true, analisadas: tarefas.length, atrasadas: atrasadas.length, total }
}

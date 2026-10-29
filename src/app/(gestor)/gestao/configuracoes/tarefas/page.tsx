import Link from "next/link"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { CabecalhoPagina } from "@/components/ui/cabecalho-pagina"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { exigirPapel } from "@/lib/auth/dal"
import { db } from "@/lib/db"
import { listarSaudeTarefas } from "@/lib/services/monitoramento-tarefas.service"
import { formatarDataHora } from "@/lib/utils/datas"

export const dynamic = "force-dynamic"

const ROTULOS = {
  AGUARDANDO: "Aguardando primeira conclusão",
  ATRASADA: "Conclusão atrasada",
  EM_EXECUCAO: "Em execução",
  FALHA_RECENTE: "Falha recente",
  EM_DIA: "Em dia",
} as const
const STATUS_EXECUCAO = {
  EM_EXECUCAO: "Em execução",
  CONCLUIDA: "Concluída",
  FALHOU: "Falhou",
  INTERROMPIDA: "Interrompida",
} as const

const NOMES_CONTADORES: Record<string, string> = {
  total: "Total",
  notificacoesExpurgadas: "Notificações removidas",
  alunosProcessados: "Alunos processados",
  existentes: "Já existentes",
  modalidadesAtualizadas: "Modalidades atualizadas",
  ofensivasAtualizadas: "Ofensivas atualizadas",
  analisadas: "Analisadas",
  analisados: "Analisados",
  criadas: "Criadas",
  criados: "Criados",
  atualizadas: "Atualizadas",
  atualizados: "Atualizados",
  canceladas: "Canceladas",
  cancelados: "Cancelados",
  trancados: "Trancados",
  trancadas: "Trancadas",
  removidas: "Removidas",
  removidos: "Removidos",
  excluidas: "Excluídas",
  excluidos: "Excluídos",
  enviados: "Enviados",
  enviadas: "Enviadas",
  tentativas: "Tentativas",
  falhas: "Falhas",
  pagamentosAnalisados: "Pagamentos analisados",
  pagamentosAtualizados: "Pagamentos atualizados",
  autorizacoesAnalisadas: "Autorizações analisadas",
  autorizacoesAtualizadas: "Autorizações atualizadas",
  aulasEncontradas: "Aulas encontradas",
  alunosNotificados: "Alunos notificados",
  alunos: "Alunos",
  modalidades: "Modalidades",
  processadas: "Processadas",
  processados: "Processados",
  count: "Quantidade",
  expurgadas: "Removidas",
  expurgados: "Removidos",
  atrasadas: "Atrasadas",
  mensalidadesVencidas: "Mensalidades vencidas",
  mensalidadesVencidasAtualizadas: "Vencimentos atualizados",
  lembretesCriados: "Lembretes criados",
  lembretesPagamentoCriados: "Lembretes de pagamento",
  inadimplenciasCriadas: "Avisos de atraso",
  avisosAdimplenciaCriados: "Avisos de adimplência",
  alunosInadimplentesNotificados: "Alunos avisados sobre atraso",
  totalCriado: "Total de avisos",
  financeiro: "Financeiro",
  aniversarios: "Aniversários",
  aluguel: "Aluguel",
  avulsos: "Avulsos",
  mensalidades: "Mensalidades",
  precosAdimplencia: "Preços de adimplência",
  adimplencia: "Adimplência",
  criacao: "Criação",
  reconciliacao: "Conciliação",
  notificacoes: "Notificações",
  execucoes: "Execuções",
  vencimentos: "Vencimentos",
  treino: "Treino",
  aulas: "Aulas",
  limpeza: "Limpeza",
  pendencias: "Pendências",
}

function resumirContadores(valor: unknown): string {
  if (!valor || typeof valor !== "object" || Array.isArray(valor)) return ""
  return Object.entries(valor)
    .flatMap(([nome, contador]) => {
      const rotulo = NOMES_CONTADORES[nome]
      if (!rotulo) return []
      if (typeof contador === "number") return [`${rotulo}: ${contador}`]
      const resumo = resumirContadores(contador)
      return resumo ? [`${rotulo} (${resumo})`] : []
    })
    .join(" · ")
}

export default async function TarefasAutomaticasPage() {
  await exigirPapel("GESTOR")
  const [tarefas, historico] = await Promise.all([
    listarSaudeTarefas(),
    db.execucaoTarefaAgendada.findMany({ orderBy: { iniciadoEm: "desc" }, take: 50 }),
  ])
  const nomes = new Map<string, string>(tarefas.map(({ tarefa, nome }) => [tarefa, nome]))

  return (
    <div className="space-y-6">
      <CabecalhoPagina
        titulo="Tarefas automáticas"
        descricao="Horários da academia e últimas conclusões. O histórico é mantido por 30 dias."
      >
        <Button asChild variant="outline">
          <Link href="/gestao/configuracoes">Voltar às configurações</Link>
        </Button>
      </CabecalhoPagina>
      <p className="text-sm text-muted-foreground">
        Atualize esta página para consultar o andamento. Um alerta é enviado aos gestores quando uma
        tarefa ultrapassa o prazo esperado sem concluir.
      </p>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {tarefas.map((tarefa) => (
          <Card key={tarefa.tarefa}>
            <CardHeader>
              <CardTitle>{tarefa.nome}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <Badge
                variant={
                  tarefa.saude === "ATRASADA"
                    ? "destructive"
                    : tarefa.saude === "FALHA_RECENTE"
                      ? "warning"
                      : tarefa.saude === "EM_DIA"
                        ? "success"
                        : "secondary"
                }
              >
                {ROTULOS[tarefa.saude]}
              </Badge>
              <p>{tarefa.frequencia}</p>
              <p>
                Última conclusão com sucesso:{" "}
                {tarefa.controle?.ultimoSucessoEm
                  ? formatarDataHora(tarefa.controle.ultimoSucessoEm)
                  : "Ainda não registrada"}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Últimas 50 execuções</CardTitle>
        </CardHeader>
        <CardContent>
          {historico.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma execução registrada.</p>
          ) : (
            <ul className="divide-y">
              {historico.map((execucao) => (
                <li key={execucao.id} className="space-y-1 py-3 text-sm">
                  <p className="font-medium">
                    {nomes.get(execucao.tarefa) ?? execucao.tarefa} ·{" "}
                    {STATUS_EXECUCAO[execucao.status]}
                  </p>
                  <p>
                    {formatarDataHora(execucao.iniciadoEm)} ·{" "}
                    {execucao.duracaoMs === null
                      ? "Duração pendente"
                      : `${(execucao.duracaoMs / 1000).toFixed(1)} s`}
                  </p>
                  {execucao.erroSeguro ? (
                    <p className="text-destructive">{execucao.erroSeguro}</p>
                  ) : null}
                  {execucao.contadores && Object.keys(execucao.contadores).length > 0 ? (
                    <p className="break-words text-muted-foreground">
                      {resumirContadores(execucao.contadores)}
                    </p>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

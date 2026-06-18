import { CalendarX } from "lucide-react"
import { LembreteAtivarNotificacoes } from "@/components/lembrete-ativar-notificacoes"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { alunoContaOperacionalmente } from "@/lib/alunos/status"
import { exigirAluno } from "@/lib/auth/dal"
import { db } from "@/lib/db"
import { podeMarcarComparecimento } from "@/lib/services/comparecimento.service"
import { formatarDataExtenso, formatarHora } from "@/lib/utils/datas"
import { AcoesAula } from "./acoes-aula"

export const dynamic = "force-dynamic"

export default async function AlunoAgenda() {
  const { alunoId, usuario } = await exigirAluno()

  const [aluno, config] = await Promise.all([
    db.aluno.findUnique({
      where: { id: alunoId },
      select: { status: true, modalidades: { select: { id: true } } },
    }),
    db.configuracaoAcademia.findUnique({
      where: { id: "default" },
      select: { janelaComparecimentoHoras: true },
    }),
  ])
  const alunoOperacional = Boolean(aluno && alunoContaOperacionalmente(aluno.status))
  const modalidadeIds = alunoOperacional ? (aluno?.modalidades.map((m) => m.id) ?? []) : []
  const agora = new Date()
  const janelaHoras = config?.janelaComparecimentoHoras ?? 24

  const aulas = await db.aula.findMany({
    where: {
      cancelada: false,
      fim: { gte: agora },
      turma: { modalidadeId: { in: modalidadeIds } },
    },
    orderBy: { inicio: "asc" },
    take: 12,
    include: {
      turma: { select: { nome: true, local: true, modalidade: { select: { nome: true } } } },
      comparecimentos: { where: { alunoId }, select: { status: true } },
      checkins: { where: { alunoId }, select: { status: true } },
    },
  })

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold tracking-tight">Olá, {usuario.nome.split(" ")[0]}!</h1>
        <p className="text-sm text-muted-foreground">Suas próximas aulas.</p>
      </div>

      <LembreteAtivarNotificacoes />

      {aulas.length === 0 && (
        <Card>
          <CardContent className="flex items-center gap-3 py-8 text-muted-foreground">
            <CalendarX className="size-5 shrink-0" />
            <span className="text-sm">
              {alunoOperacional
                ? "Nenhuma aula disponível nas suas modalidades."
                : "Matrícula trancada. Procure a gestão para retomar os treinos."}
            </span>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {aulas.map((aula) => {
          const comp = aula.comparecimentos[0]
          const temComparecimento = comp?.status === "CONFIRMADO"
          const emListaEspera = comp?.status === "LISTA_ESPERA"
          const presente = aula.checkins.some((c) => c.status === "VALIDO")
          const pendenteRevisao = aula.checkins.some((c) => c.status === "PENDENTE_REVISAO")
          const janelaAberta = podeMarcarComparecimento({
            agora,
            inicioAula: aula.inicio,
            janelaHoras,
          })
          return (
            <Card key={aula.id} className="flex flex-col">
              <CardContent className="flex flex-1 flex-col gap-3 py-4">
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline">{aula.turma.modalidade.nome}</Badge>
                    {temComparecimento && !presente && (
                      <Badge variant="secondary">Agendamento marcado</Badge>
                    )}
                    {emListaEspera && !presente && <Badge variant="warning">Lista de espera</Badge>}
                    {pendenteRevisao && !presente && (
                      <Badge variant="warning">Pendente de revisão</Badge>
                    )}
                  </div>
                  <p className="font-medium capitalize">{formatarDataExtenso(aula.inicio)}</p>
                  <p className="text-sm text-muted-foreground">
                    {formatarHora(aula.inicio)}–{formatarHora(aula.fim)}
                    {aula.turma.local ? ` · ${aula.turma.local}` : ""}
                  </p>
                </div>
                <div className="mt-auto pt-1">
                  <AcoesAula
                    aulaId={aula.id}
                    temComparecimento={temComparecimento}
                    emListaEspera={emListaEspera}
                    presente={presente}
                    pendenteRevisao={pendenteRevisao}
                    janelaAberta={janelaAberta}
                  />
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>
    </div>
  )
}

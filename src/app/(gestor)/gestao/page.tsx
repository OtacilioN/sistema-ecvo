import { CalendarDays, GraduationCap, UserRound, Users } from "lucide-react"
import { LembreteAtivarNotificacoes } from "@/components/lembrete-ativar-notificacoes"
import { CabecalhoPagina } from "@/components/ui/cabecalho-pagina"
import { Card, CardContent } from "@/components/ui/card"
import { db } from "@/lib/db"

export const dynamic = "force-dynamic"

export default async function GestaoInicio() {
  const [alunosAtivos, professores, modalidades, turmas] = await Promise.all([
    db.aluno.count({ where: { status: "ATIVO" } }),
    db.professor.count({ where: { ativo: true } }),
    db.modalidade.count({ where: { ativa: true } }),
    db.turma.count({ where: { ativa: true } }),
  ])

  const cards = [
    { rotulo: "Alunos ativos", valor: alunosAtivos, icone: Users },
    { rotulo: "Professores", valor: professores, icone: UserRound },
    { rotulo: "Modalidades", valor: modalidades, icone: GraduationCap },
    { rotulo: "Turmas ativas", valor: turmas, icone: CalendarDays },
  ]

  return (
    <div className="space-y-6">
      <CabecalhoPagina titulo="Painel da gestão" descricao="Visão geral da operação da academia." />
      <LembreteAtivarNotificacoes />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {cards.map(({ rotulo, valor, icone: Icone }) => (
          <Card key={rotulo}>
            <CardContent className="flex items-center gap-4 px-4 pb-5 pt-5 sm:px-5 sm:pb-6 sm:pt-6">
              <div className="flex size-11 items-center justify-center rounded-md bg-accent text-accent-foreground">
                <Icone className="size-5" />
              </div>
              <div>
                <div className="text-2xl font-bold">{valor}</div>
                <div className="text-xs text-muted-foreground">{rotulo}</div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}

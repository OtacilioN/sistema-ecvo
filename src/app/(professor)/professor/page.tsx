import { LembreteAtivarNotificacoes } from "@/components/lembrete-ativar-notificacoes"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { exigirProfessor } from "@/lib/auth/dal"
import { db } from "@/lib/db"

export const dynamic = "force-dynamic"

export default async function ProfessorInicio() {
  const { usuario, professorId } = await exigirProfessor()

  const inicioDia = new Date()
  inicioDia.setHours(0, 0, 0, 0)
  const fimDia = new Date()
  fimDia.setHours(23, 59, 59, 999)

  const aulasHoje = await db.aula.count({
    where: {
      inicio: { gte: inicioDia, lte: fimDia },
      cancelada: false,
      OR: [{ professorId }, { turma: { professorId } }],
    },
  })

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Olá, {usuario.nome}</h1>
        <p className="text-muted-foreground">Suas aulas e graduações.</p>
      </div>
      <LembreteAtivarNotificacoes />
      <Card>
        <CardHeader>
          <CardTitle>Aulas de hoje</CardTitle>
          <CardDescription>Quantidade de aulas sob sua responsabilidade hoje.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-4xl font-bold">{aulasHoje}</div>
        </CardContent>
      </Card>
    </div>
  )
}

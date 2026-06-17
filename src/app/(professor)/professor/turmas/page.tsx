import { ChevronRight } from "lucide-react"
import Link from "next/link"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { exigirProfessor } from "@/lib/auth/dal"
import { db } from "@/lib/db"
import { formatarDataExtenso, formatarHora } from "@/lib/utils/datas"

export const dynamic = "force-dynamic"

export default async function ProfessorAulas() {
  const { professorId } = await exigirProfessor()

  const desde = new Date()
  desde.setDate(desde.getDate() - 7)

  const aulas = await db.aula.findMany({
    where: {
      inicio: { gte: desde },
      cancelada: false,
      OR: [{ professorId }, { turma: { professorId } }],
    },
    orderBy: { inicio: "asc" },
    take: 30,
    include: {
      turma: { select: { nome: true, modalidade: { select: { nome: true } } } },
      _count: { select: { comparecimentos: true, checkins: true } },
    },
  })

  const agora = Date.now()

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Minhas aulas</h1>
        <p className="text-muted-foreground">
          Abra uma aula para conferir a lista e validar a presença.
        </p>
      </div>

      <div className="space-y-3">
        {aulas.map((aula) => {
          const passada = aula.fim.getTime() < agora
          return (
            <Link key={aula.id} href={`/professor/aula/${aula.id}`} className="block">
              <Card className="transition-colors hover:bg-muted">
                <CardContent className="flex items-center justify-between gap-4 py-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">{aula.turma.modalidade.nome}</Badge>
                      {passada && <Badge variant="secondary">Encerrada</Badge>}
                    </div>
                    <p className="font-medium capitalize">{formatarDataExtenso(aula.inicio)}</p>
                    <p className="text-sm text-muted-foreground">
                      {formatarHora(aula.inicio)}–{formatarHora(aula.fim)} ·{" "}
                      {aula._count.comparecimentos} agendamentos · {aula._count.checkins} check-ins
                    </p>
                  </div>
                  <ChevronRight className="size-5 shrink-0 text-muted-foreground" />
                </CardContent>
              </Card>
            </Link>
          )
        })}
        {aulas.length === 0 && (
          <Card>
            <CardContent className="py-8 text-center text-sm text-muted-foreground">
              Nenhuma aula no período.
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}

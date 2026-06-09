import { addMonths, format } from "date-fns"
import { fromZonedTime } from "date-fns-tz"
import { CheckCircle2, Clock3, Dumbbell, TicketCheck } from "lucide-react"
import Link from "next/link"
import { notFound } from "next/navigation"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { exigirAluno } from "@/lib/auth/dal"
import { db } from "@/lib/db"
import {
  formatarDataExtenso,
  formatarHora,
  formatarMinutos,
  paraFusoAcademia,
  TIMEZONE,
} from "@/lib/utils/datas"

export const dynamic = "force-dynamic"

function intervaloMesAcademia(data: Date) {
  const local = paraFusoAcademia(data)
  const inicioLocal = new Date(local.getFullYear(), local.getMonth(), 1)
  const fimLocal = addMonths(inicioLocal, 1)

  return {
    inicio: fromZonedTime(format(inicioLocal, "yyyy-MM-dd'T'HH:mm:ss"), TIMEZONE),
    fim: fromZonedTime(format(fimLocal, "yyyy-MM-dd'T'HH:mm:ss"), TIMEZONE),
  }
}

export default async function PasseCheckinPage({
  params,
}: {
  params: Promise<{ checkinId: string }>
}) {
  const { alunoId } = await exigirAluno()
  const { checkinId } = await params

  const checkin = await db.checkin.findFirst({
    where: { id: checkinId, alunoId, status: "VALIDO" },
    include: {
      aula: {
        include: {
          turma: {
            select: {
              nome: true,
              local: true,
              modalidadeId: true,
              modalidade: { select: { nome: true } },
            },
          },
        },
      },
      movimentos: { select: { minutos: true } },
      aluno: { select: { usuario: { select: { nome: true } } } },
    },
  })
  if (!checkin) notFound()

  const { inicio, fim } = intervaloMesAcademia(checkin.aula.inicio)
  const [totalGeral, totalModalidade, aulasMes] = await Promise.all([
    db.movimentoHoras.aggregate({
      where: { alunoId },
      _sum: { minutos: true },
    }),
    db.movimentoHoras.aggregate({
      where: { alunoId, modalidadeId: checkin.aula.turma.modalidadeId },
      _sum: { minutos: true },
    }),
    db.checkin.count({
      where: {
        alunoId,
        status: "VALIDO",
        aula: { inicio: { gte: inicio, lt: fim } },
      },
    }),
  ])

  const minutosCheckin = checkin.movimentos.reduce(
    (total, movimento) => total + movimento.minutos,
    0,
  )
  const metricas = [
    {
      rotulo: "Crédito desta aula",
      valor: formatarMinutos(minutosCheckin),
      icone: Clock3,
    },
    {
      rotulo: "Aulas no mês",
      valor: String(aulasMes),
      icone: TicketCheck,
    },
    {
      rotulo: "Total na modalidade",
      valor: formatarMinutos(totalModalidade._sum.minutos ?? 0),
      icone: Dumbbell,
    },
    {
      rotulo: "Total geral",
      valor: formatarMinutos(totalGeral._sum.minutos ?? 0),
      icone: CheckCircle2,
    },
  ]

  return (
    <div className="space-y-5">
      <Card className="overflow-hidden border-success/40">
        <div className="bg-success px-5 py-4 text-success-foreground">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="size-5" />
            <span className="text-sm font-semibold uppercase tracking-[0.14em]">
              Passe liberado
            </span>
          </div>
          <h1 className="mt-3 text-2xl font-black tracking-tight">Bom treino!</h1>
        </div>
        <CardContent className="space-y-5 py-5">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline">{checkin.aula.turma.modalidade.nome}</Badge>
              <Badge variant="success">Check-in válido</Badge>
            </div>
            <p className="text-lg font-semibold capitalize">
              {formatarDataExtenso(checkin.aula.inicio)}
            </p>
            <p className="text-sm text-muted-foreground">
              {formatarHora(checkin.aula.inicio)}-{formatarHora(checkin.aula.fim)}
              {checkin.aula.turma.local ? ` · ${checkin.aula.turma.local}` : ""}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {metricas.map(({ rotulo, valor, icone: Icone }) => (
              <div key={rotulo} className="rounded-md border border-border bg-muted/30 p-3">
                <div className="mb-2 flex size-8 items-center justify-center rounded-md bg-card text-primary">
                  <Icone className="size-4" />
                </div>
                <div className="text-xl font-bold tabular-nums">{valor}</div>
                <div className="text-xs text-muted-foreground">{rotulo}</div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Aluno</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="font-medium">{checkin.aluno.usuario.nome}</p>
            <p className="text-xs text-muted-foreground">
              Check-in registrado às {formatarHora(checkin.criadoEm)}
            </p>
          </div>
          <Button asChild variant="outline">
            <Link href="/aluno">Voltar à agenda</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}

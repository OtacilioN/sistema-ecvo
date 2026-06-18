import { notFound } from "next/navigation"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { alunoContaOperacionalmente } from "@/lib/alunos/status"
import { exigirAluno } from "@/lib/auth/dal"
import { db } from "@/lib/db"
import { formatarDataExtenso, formatarHora } from "@/lib/utils/datas"
import { FormCheckinQr } from "./form-checkin-qr"

export const dynamic = "force-dynamic"

export default async function CheckinQrPage({
  params,
  searchParams,
}: {
  params: Promise<{ aulaId: string }>
  searchParams: Promise<{ token?: string | string[] }>
}) {
  const { alunoId } = await exigirAluno()
  const { aulaId } = await params
  const query = await searchParams
  const token = Array.isArray(query.token) ? query.token[0] : query.token

  const aluno = await db.aluno.findUnique({
    where: { id: alunoId },
    select: { status: true },
  })
  const alunoOperacional = Boolean(aluno && alunoContaOperacionalmente(aluno.status))

  const aula = await db.aula.findUnique({
    where: { id: aulaId },
    select: {
      id: true,
      inicio: true,
      fim: true,
      cancelada: true,
      turma: {
        select: {
          local: true,
          modalidade: { select: { nome: true } },
        },
      },
      checkins: { where: { alunoId }, select: { id: true, status: true } },
    },
  })
  if (!aula) notFound()

  const jaPresente = aula.checkins.some((checkin) => checkin.status === "VALIDO")
  const pendenteRevisao = aula.checkins.some((checkin) => checkin.status === "PENDENTE_REVISAO")

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold tracking-tight">Check-in por QR Code</h1>
        <p className="text-sm text-muted-foreground">Confirme sua participação nesta aula.</p>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">{aula.turma.modalidade.nome}</Badge>
            {aula.cancelada && <Badge variant="destructive">Cancelada</Badge>}
          </div>
          <CardTitle className="capitalize">{formatarDataExtenso(aula.inicio)}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            {formatarHora(aula.inicio)}-{formatarHora(aula.fim)}
            {aula.turma.local ? ` · ${aula.turma.local}` : ""}
          </p>

          {!alunoOperacional ? (
            <p className="rounded-md border border-border bg-muted p-4 text-sm text-muted-foreground">
              Matrícula trancada. Procure a gestão para retomar os treinos.
            </p>
          ) : aula.cancelada ? (
            <p className="rounded-md border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
              Esta aula foi cancelada.
            </p>
          ) : (
            <FormCheckinQr
              aulaId={aula.id}
              token={token ?? ""}
              jaPresente={jaPresente}
              pendenteRevisao={pendenteRevisao}
            />
          )}
        </CardContent>
      </Card>
    </div>
  )
}

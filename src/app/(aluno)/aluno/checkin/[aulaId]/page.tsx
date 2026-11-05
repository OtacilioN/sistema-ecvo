import { notFound } from "next/navigation"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { alunoContaOperacionalmente } from "@/lib/alunos/status"
import { exigirAluno } from "@/lib/auth/dal"
import {
  filtroCheckinNaModalidadeNoDia,
  mensagemLimiteDiarioCheckin,
} from "@/lib/checkin-limite-diario"
import { plataformaCheckinDoTipo } from "@/lib/checkin-plataforma"
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
    select: { status: true, tipo: true },
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
          nome: true,
          modalidadeId: true,
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
  const outroCheckinNoDia =
    alunoOperacional && !jaPresente && !pendenteRevisao
      ? await db.checkin.findFirst({
          where: filtroCheckinNaModalidadeNoDia({
            alunoId,
            modalidadeId: aula.turma.modalidadeId,
            inicioAula: aula.inicio,
            aulaIdIgnorada: aula.id,
          }),
          select: { id: true },
        })
      : null

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
          <CardTitle>{aula.turma.nome ?? aula.turma.modalidade.nome}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm capitalize text-muted-foreground">
            {formatarDataExtenso(aula.inicio)}
          </p>
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
          ) : outroCheckinNoDia ? (
            <p className="rounded-md border border-border bg-muted/40 p-4 text-sm text-muted-foreground">
              {mensagemLimiteDiarioCheckin(aula.turma.modalidade.nome)}
            </p>
          ) : (
            <FormCheckinQr
              aulaId={aula.id}
              token={token ?? ""}
              jaPresente={jaPresente}
              pendenteRevisao={pendenteRevisao}
              plataforma={plataformaCheckinDoTipo(aluno?.tipo)}
            />
          )}
        </CardContent>
      </Card>
    </div>
  )
}

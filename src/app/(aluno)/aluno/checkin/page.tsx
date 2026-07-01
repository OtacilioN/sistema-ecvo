import { AlertTriangle, Check, Clock, QrCode } from "lucide-react"
import Link from "next/link"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { alunoContaOperacionalmente } from "@/lib/alunos/status"
import { exigirAluno } from "@/lib/auth/dal"
import { db } from "@/lib/db"
import { tokenCheckinValido } from "@/lib/services/checkin-token.service"
import { formatarDataExtenso, formatarHora } from "@/lib/utils/datas"
import { MinhasHorasAluno } from "../minhas-horas-aluno"
import { FormCheckinGlobal } from "./form-checkin-global"
import { LeitorQRCodeAluno } from "./leitor-qrcode-aluno"

export const dynamic = "force-dynamic"

const JANELA_CHECKIN_MS = 30 * 60_000

export default async function CheckinGlobalPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string | string[] }>
}) {
  const { alunoId } = await exigirAluno()
  const query = await searchParams
  const token = Array.isArray(query.token) ? query.token[0] : query.token
  const tokenInformado = Boolean(token)
  const tokenAtual = token ? await tokenCheckinValido(token) : false

  const aluno = await db.aluno.findUnique({
    where: { id: alunoId },
    select: { status: true, modalidades: { select: { id: true } } },
  })
  const alunoOperacional = Boolean(aluno && alunoContaOperacionalmente(aluno.status))
  const modalidadeIds = alunoOperacional
    ? (aluno?.modalidades.map((modalidade) => modalidade.id) ?? [])
    : []
  const agora = new Date()
  const proximoInicioLiberado = new Date(agora.getTime() + JANELA_CHECKIN_MS)

  const aulas = tokenAtual
    ? await db.aula.findMany({
        where: {
          cancelada: false,
          inicio: { lte: proximoInicioLiberado },
          fim: { gte: agora },
          turma: { modalidadeId: { in: modalidadeIds } },
        },
        orderBy: { inicio: "asc" },
        take: 8,
        include: {
          turma: {
            select: {
              nome: true,
              local: true,
              modalidade: { select: { nome: true } },
            },
          },
          checkins: {
            where: { alunoId },
            select: { id: true, status: true },
          },
        },
      })
    : []

  return (
    <div className="space-y-5">
      <div className="flex items-start gap-3">
        <div className="flex size-11 shrink-0 items-center justify-center rounded-md bg-accent text-accent-foreground">
          <QrCode className="size-5" />
        </div>
        <div>
          <h1 className="text-xl font-bold tracking-tight">Check-in da aula</h1>
          <p className="text-sm text-muted-foreground">
            Escolha uma aula liberada para confirmar sua entrada.
          </p>
        </div>
      </div>

      {tokenInformado && !tokenAtual && (
        <Card className="border-destructive/40 bg-destructive/5">
          <CardContent className="flex gap-3 py-5 text-sm text-destructive">
            <AlertTriangle className="mt-0.5 size-5 shrink-0" />
            <div>
              <p className="font-medium">QR Code expirado ou inválido.</p>
              <p className="mt-1 text-destructive/80">
                Leia o QR Code atual na entrada da academia para liberar o check-in.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {!tokenAtual && <LeitorQRCodeAluno />}

      {!alunoOperacional && (
        <Card>
          <CardContent className="flex gap-3 py-6 text-sm text-muted-foreground">
            <AlertTriangle className="mt-0.5 size-5 shrink-0" />
            <div>
              <p className="font-medium text-foreground">Matrícula trancada.</p>
              <p className="mt-1">Procure a gestão para retomar os treinos.</p>
            </div>
          </CardContent>
        </Card>
      )}

      {alunoOperacional && tokenAtual && aulas.length === 0 && (
        <Card>
          <CardContent className="flex gap-3 py-6 text-sm text-muted-foreground">
            <Clock className="mt-0.5 size-5 shrink-0" />
            <div>
              <p className="font-medium text-foreground">Nenhuma aula liberada agora.</p>
              <p className="mt-1">
                O check-in abre 30 minutos antes e fecha no fim do horário da aula.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-3">
        {aulas.map((aula) => {
          const checkinValido = aula.checkins.find((checkin) => checkin.status === "VALIDO")
          const pendenteRevisao = aula.checkins.some(
            (checkin) => checkin.status === "PENDENTE_REVISAO",
          )

          return (
            <Card key={aula.id}>
              <CardHeader>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline">{aula.turma.modalidade.nome}</Badge>
                  {checkinValido && (
                    <Badge variant="success" className="gap-1">
                      <Check className="size-3.5" /> Presente
                    </Badge>
                  )}
                  {pendenteRevisao && <Badge variant="warning">Pendente de revisão</Badge>}
                </div>
                <CardTitle className="capitalize">{formatarDataExtenso(aula.inicio)}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  {formatarHora(aula.inicio)}-{formatarHora(aula.fim)}
                  {aula.turma.local ? ` · ${aula.turma.local}` : ""}
                </p>

                {checkinValido ? (
                  <Button asChild className="w-full">
                    <Link href={`/aluno/checkin/passe/${checkinValido.id}`}>Ver passe</Link>
                  </Button>
                ) : pendenteRevisao ? (
                  <p className="rounded-md border border-warning/30 bg-warning/10 p-3 text-sm text-warning">
                    Check-in pendente de revisão.
                  </p>
                ) : (
                  <FormCheckinGlobal aulaId={aula.id} token={token ?? ""} />
                )}
              </CardContent>
            </Card>
          )
        })}
      </div>

      <div className="border-t border-border pt-5">
        <MinhasHorasAluno alunoId={alunoId} />
      </div>
    </div>
  )
}

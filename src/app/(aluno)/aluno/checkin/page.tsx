import { AlertTriangle, Check, Clock, QrCode } from "lucide-react"
import Link from "next/link"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { alunoContaOperacionalmente } from "@/lib/alunos/status"
import { exigirAluno } from "@/lib/auth/dal"
import {
  podeRealizarCheckinNaJanela,
  selecionarAulaReferenciaCheckinLivre,
  TOLERANCIA_PADRAO_CHECKIN_MINUTOS,
} from "@/lib/checkin-horario"
import { plataformaCheckinDoTipo } from "@/lib/checkin-plataforma"
import { db } from "@/lib/db"
import { montarCandidataCheckinLivre } from "@/lib/services/checkin.service"
import { tokenCheckinValido } from "@/lib/services/checkin-token.service"
import {
  fimExclusivoDoDiaAcademia,
  formatarDataExtenso,
  formatarHora,
  inicioDoDiaAcademia,
} from "@/lib/utils/datas"
import { MinhasHorasAluno } from "../minhas-horas-aluno"
import { FormCheckinGeolocalizacao } from "./form-checkin-geolocalizacao"
import { FormCheckinGlobal } from "./form-checkin-global"
import { LeitorQRCodeAluno } from "./leitor-qrcode-aluno"

export const dynamic = "force-dynamic"

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
    select: {
      status: true,
      tipo: true,
      planoId: true,
      modalidades: {
        where: { ativa: true },
        select: { id: true, checkinSemRestricaoHorario: true },
      },
      modalidadesPlano: {
        select: { modalidadeId: true, plataformaExterna: true },
      },
    },
  })
  const alunoOperacional = Boolean(aluno && alunoContaOperacionalmente(aluno.status))
  const modalidadesInternas = new Set(
    aluno?.modalidadesPlano
      .filter((modalidade) => !modalidade.plataformaExterna)
      .map((modalidade) => modalidade.modalidadeId) ?? [],
  )
  const matriculaLiberada = Boolean(
    alunoOperacional &&
      aluno &&
      (aluno.tipo !== "MENSALISTA" || (aluno.planoId && modalidadesInternas.size > 0)),
  )
  const plataformaCheckin = plataformaCheckinDoTipo(aluno?.tipo)
  const modalidadeIds = matriculaLiberada
    ? (aluno?.modalidades
        .filter(
          (modalidade) => aluno.tipo !== "MENSALISTA" || modalidadesInternas.has(modalidade.id),
        )
        .map((modalidade) => modalidade.id) ?? [])
    : []
  const agora = new Date()
  const fimMinimoLiberado = new Date(agora.getTime() - TOLERANCIA_PADRAO_CHECKIN_MINUTOS * 60_000)
  const inicioDia = inicioDoDiaAcademia(agora)
  const fimDia = fimExclusivoDoDiaAcademia(agora)

  const aulasCandidatas = matriculaLiberada
    ? await db.aula.findMany({
        where: {
          cancelada: false,
          OR: [
            { inicio: { gte: inicioDia, lt: fimDia } },
            { inicio: { lt: inicioDia }, fim: { gte: fimMinimoLiberado } },
          ],
          turma: {
            ativa: true,
            modalidadeId: { in: modalidadeIds },
            modalidade: { ativa: true },
          },
        },
        orderBy: [{ inicio: "asc" }, { id: "asc" }],
        include: {
          turma: {
            select: {
              capacidade: true,
              nome: true,
              local: true,
              ehEvento: true,
              modalidade: {
                select: { id: true, nome: true, checkinSemRestricaoHorario: true },
              },
            },
          },
          comparecimentos: { select: { alunoId: true, status: true } },
          checkins: {
            select: {
              id: true,
              alunoId: true,
              status: true,
              realizadoEm: true,
              associadoAutomaticamente: true,
            },
          },
        },
      })
    : []

  const referenciasLivres = new Set<string>()
  const aulasLivresPorModalidade = new Map<string, typeof aulasCandidatas>()
  for (const aula of aulasCandidatas) {
    if (!aula.turma.modalidade.checkinSemRestricaoHorario || aula.turma.ehEvento) continue
    const modalidadeId = aula.turma.modalidade.id
    aulasLivresPorModalidade.set(modalidadeId, [
      ...(aulasLivresPorModalidade.get(modalidadeId) ?? []),
      aula,
    ])
  }
  for (const candidatas of aulasLivresPorModalidade.values()) {
    const referencia = selecionarAulaReferenciaCheckinLivre(
      candidatas.map((aula) => montarCandidataCheckinLivre(aula, alunoId)),
      agora,
    )
    if (referencia) referenciasLivres.add(referencia.id)
  }

  const aulas = aulasCandidatas
    .filter((aula) =>
      aula.turma.modalidade.checkinSemRestricaoHorario
        ? referenciasLivres.has(aula.id)
        : podeRealizarCheckinNaJanela({
            inicioAula: aula.inicio,
            fimAula: aula.fim,
            agora,
          }),
    )
    .slice(0, 8)

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
              <p className="mt-1 text-destructive/80">Leia o QR Code atual ou use a localização.</p>
            </div>
          </CardContent>
        </Card>
      )}

      {matriculaLiberada && !tokenAtual && <LeitorQRCodeAluno />}

      {!matriculaLiberada && (
        <Card>
          <CardContent className="flex gap-3 py-6 text-sm text-muted-foreground">
            <AlertTriangle className="mt-0.5 size-5 shrink-0" />
            <div>
              <p className="font-medium text-foreground">Check-in ainda não liberado.</p>
              <p className="mt-1">
                Sua matrícula precisa estar ativa e vinculada a um plano de pagamento.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {matriculaLiberada && aulas.length === 0 && (
        <Card>
          <CardContent className="flex gap-3 py-6 text-sm text-muted-foreground">
            <Clock className="mt-0.5 size-5 shrink-0" />
            <div>
              <p className="font-medium text-foreground">Nenhuma aula liberada agora.</p>
              <p className="mt-1">
                Nas modalidades com horário livre, é necessário haver uma aula oficial no dia. Nas
                demais, o check-in abre 30 minutos antes e fecha 30 minutos após o fim da aula.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-3">
        {aulas.map((aula) => {
          const checkinValido = aula.checkins.find(
            (checkin) => checkin.alunoId === alunoId && checkin.status === "VALIDO",
          )
          const pendenteRevisao = aula.checkins.some(
            (checkin) => checkin.alunoId === alunoId && checkin.status === "PENDENTE_REVISAO",
          )
          const checkinPendente = aula.checkins.find(
            (checkin) => checkin.alunoId === alunoId && checkin.status === "PENDENTE_REVISAO",
          )
          const registro = checkinValido ?? checkinPendente
          const horarioLivre = aula.turma.modalidade.checkinSemRestricaoHorario

          return (
            <Card key={aula.id}>
              <CardHeader>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline">{aula.turma.modalidade.nome}</Badge>
                  {horarioLivre && <Badge variant="secondary">Check-in livre</Badge>}
                  {checkinValido && (
                    <Badge variant="success" className="gap-1">
                      <Check className="size-3.5" /> Presente
                    </Badge>
                  )}
                  {pendenteRevisao && <Badge variant="warning">Pendente de revisão</Badge>}
                  {registro?.associadoAutomaticamente && (
                    <Badge variant="outline">
                      Check-in às {formatarHora(registro.realizadoEm)}
                    </Badge>
                  )}
                </div>
                <CardTitle className="capitalize">{formatarDataExtenso(aula.inicio)}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  {formatarHora(aula.inicio)}-{formatarHora(aula.fim)}
                  {aula.turma.local ? ` · ${aula.turma.local}` : ""}
                </p>
                {horarioLivre && !registro && (
                  <p className="rounded-md border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
                    Seu check-in será associado à aula das {formatarHora(aula.inicio)}. O horário
                    exato será registrado.
                  </p>
                )}

                {checkinValido ? (
                  <Button asChild className="w-full">
                    <Link href={`/aluno/checkin/passe/${checkinValido.id}`}>Ver passe</Link>
                  </Button>
                ) : pendenteRevisao ? (
                  <p className="rounded-md border border-warning/30 bg-warning/10 p-3 text-sm text-warning">
                    Check-in pendente de revisão.
                  </p>
                ) : tokenAtual ? (
                  <FormCheckinGlobal
                    aulaId={aula.id}
                    token={token ?? ""}
                    plataforma={plataformaCheckin}
                  />
                ) : (
                  <FormCheckinGeolocalizacao aulaId={aula.id} plataforma={plataformaCheckin} />
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

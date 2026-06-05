import { notFound } from "next/navigation"
import { FormNoShows } from "@/app/(professor)/professor/aula/[id]/form-no-shows"
import {
  LinhaPresenca,
  type StatusLinha,
} from "@/app/(professor)/professor/aula/[id]/linha-presenca"
import { QrCheckin } from "@/app/(professor)/professor/aula/[id]/qr-checkin"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { exigirPapel } from "@/lib/auth/dal"
import { db } from "@/lib/db"
import { formatarDataExtenso, formatarHora } from "@/lib/utils/datas"

export const dynamic = "force-dynamic"

const PRIORIDADE: Record<StatusLinha, number> = {
  PRESENTE: 0,
  COMPARECEU: 1,
  LISTA_ESPERA: 2,
  PENDENTE_REVISAO: 3,
  INVALIDADO: 4,
  EXCLUIDO: 5,
  NO_SHOW: 6,
  AUSENTE: 7,
}

export default async function AulaGestaoDetalhe({ params }: { params: Promise<{ id: string }> }) {
  await exigirPapel("GESTOR")
  const { id } = await params
  const agora = new Date()

  const aula = await db.aula.findUnique({
    where: { id },
    include: {
      turma: { select: { modalidadeId: true, nome: true, modalidade: { select: { nome: true } } } },
      comparecimentos: { select: { alunoId: true, status: true } },
      checkins: {
        select: {
          id: true,
          alunoId: true,
          status: true,
          aluno: { select: { usuario: { select: { nome: true } } } },
        },
      },
    },
  })
  if (!aula) notFound()

  const matriculados = await db.aluno.findMany({
    where: { status: "ATIVO", modalidades: { some: { id: aula.turma.modalidadeId } } },
    select: { id: true, observacoesTecnicas: true, usuario: { select: { nome: true } } },
  })

  const linhas = new Map<
    string,
    {
      alunoId: string
      nome: string
      observacoesTecnicas: string | null
      status: StatusLinha
      checkinId: string | null
    }
  >()
  for (const matriculado of matriculados) {
    linhas.set(matriculado.id, {
      alunoId: matriculado.id,
      nome: matriculado.usuario.nome,
      observacoesTecnicas: matriculado.observacoesTecnicas,
      status: "AUSENTE",
      checkinId: null,
    })
  }
  for (const comparecimento of aula.comparecimentos) {
    const linha = linhas.get(comparecimento.alunoId)
    if (
      linha &&
      (comparecimento.status === "CONFIRMADO" || comparecimento.status === "CONVERTIDO_CHECKIN")
    ) {
      linha.status = "COMPARECEU"
    } else if (linha && comparecimento.status === "LISTA_ESPERA") {
      linha.status = "LISTA_ESPERA"
    } else if (linha && comparecimento.status === "NO_SHOW") {
      linha.status = "NO_SHOW"
    }
  }
  for (const checkin of aula.checkins) {
    const nome = checkin.aluno.usuario.nome
    const linha = linhas.get(checkin.alunoId) ?? {
      alunoId: checkin.alunoId,
      nome,
      observacoesTecnicas: null,
      status: "AUSENTE" as StatusLinha,
      checkinId: null,
    }
    if (checkin.status === "VALIDO") {
      linha.status = "PRESENTE"
      linha.checkinId = checkin.id
    } else if (checkin.status === "PENDENTE_REVISAO") {
      linha.status = "PENDENTE_REVISAO"
      linha.checkinId = checkin.id
    } else if (linha.status !== "PRESENTE") {
      linha.status = checkin.status === "EXCLUIDO" ? "EXCLUIDO" : "INVALIDADO"
    }
    linhas.set(checkin.alunoId, linha)
  }

  const lista = [...linhas.values()].sort(
    (a, b) => PRIORIDADE[a.status] - PRIORIDADE[b.status] || a.nome.localeCompare(b.nome),
  )
  const presentes = lista.filter((linha) => linha.status === "PRESENTE").length
  const noShows = lista.filter((linha) => linha.status === "NO_SHOW").length
  const podeProcessarNoShow = !aula.cancelada && aula.fim.getTime() <= agora.getTime()

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-2">
          <Badge variant="outline">{aula.turma.modalidade.nome}</Badge>
          {aula.cancelada && <Badge variant="destructive">Cancelada</Badge>}
        </div>
        <h1 className="mt-1 text-2xl font-bold capitalize tracking-tight">
          {formatarDataExtenso(aula.inicio)}
        </h1>
        <p className="text-muted-foreground">
          {formatarHora(aula.inicio)}-{formatarHora(aula.fim)} · {presentes} presente(s)
          {noShows > 0 ? ` · ${noShows} no-show(s)` : ""}
        </p>
      </div>

      {!aula.cancelada && <QrCheckin aulaId={aula.id} />}

      {podeProcessarNoShow && <FormNoShows aulaId={aula.id} />}

      <Card>
        <CardContent className="p-0">
          <table className="tabela-responsiva w-full text-sm">
            <thead className="border-b border-border text-left text-muted-foreground">
              <tr>
                <th className="p-4 font-medium">Aluno</th>
                <th className="p-4 font-medium">Situação</th>
                <th className="p-4 font-medium">Ação</th>
              </tr>
            </thead>
            <tbody>
              {lista.map((linha) => (
                <LinhaPresenca
                  key={linha.alunoId}
                  aulaId={aula.id}
                  alunoId={linha.alunoId}
                  nome={linha.nome}
                  observacoesTecnicas={linha.observacoesTecnicas}
                  status={linha.status}
                  checkinId={linha.checkinId}
                />
              ))}
              {lista.length === 0 && (
                <tr>
                  <td colSpan={3} className="p-8 text-center text-muted-foreground">
                    Nenhum aluno matriculado nesta modalidade.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  )
}

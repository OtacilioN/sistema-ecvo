import { notFound } from "next/navigation"
import { AtualizacaoAula } from "@/app/(professor)/professor/aula/[id]/atualizacao-aula"
import { FormNoShows } from "@/app/(professor)/professor/aula/[id]/form-no-shows"
import { LinhaPresenca } from "@/app/(professor)/professor/aula/[id]/linha-presenca"
import { TentativasInadimplencia } from "@/app/(professor)/professor/aula/[id]/tentativas-inadimplencia"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { exigirPapel } from "@/lib/auth/dal"
import { carregarMonitoramentoAula } from "@/lib/services/aula-monitoramento.service"
import { formatarDataExtenso, formatarHora } from "@/lib/utils/datas"

export const dynamic = "force-dynamic"

export default async function AulaGestaoDetalhe({ params }: { params: Promise<{ id: string }> }) {
  await exigirPapel("GESTOR")
  const { id } = await params
  const agora = new Date()

  const monitoramento = await carregarMonitoramentoAula(id)
  if (!monitoramento) notFound()

  const { aula, lista, presentes, noShows, tentativasInadimplentes } = monitoramento
  const podeProcessarNoShow = !aula.cancelada && aula.fim.getTime() <= agora.getTime()

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
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
        <AtualizacaoAula />
      </div>

      {podeProcessarNoShow && <FormNoShows aulaId={aula.id} />}

      <TentativasInadimplencia tentativas={tentativasInadimplentes} />

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

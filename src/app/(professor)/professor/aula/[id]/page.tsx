import { notFound } from "next/navigation"
import { montarLinhasPainelAula, PainelAulaCheckin } from "@/components/checkin/painel-aula-checkin"
import { Badge } from "@/components/ui/badge"
import { exigirPapel } from "@/lib/auth/dal"
import { carregarMonitoramentoAula } from "@/lib/services/aula-monitoramento.service"
import { formatarDataExtenso, formatarHora } from "@/lib/utils/datas"
import { AtualizacaoAula } from "./atualizacao-aula"
import { FormNoShows } from "./form-no-shows"

export const dynamic = "force-dynamic"

export default async function AulaDetalhe({ params }: { params: Promise<{ id: string }> }) {
  await exigirPapel("PROFESSOR", "GESTOR")
  const { id } = await params
  const agora = new Date()

  const monitoramento = await carregarMonitoramentoAula(id)
  if (!monitoramento) notFound()

  const { aula, lista, presentes, noShows, tentativasInadimplentes } = monitoramento
  const podeProcessarNoShow = !aula.cancelada && aula.fim.getTime() <= agora.getTime()
  const linhasPainel = montarLinhasPainelAula({ lista, tentativasInadimplentes })

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
            {formatarHora(aula.inicio)}–{formatarHora(aula.fim)} · {presentes} presente(s)
            {noShows > 0 ? ` · ${noShows} no-show(s)` : ""}
          </p>
        </div>
        <AtualizacaoAula />
      </div>

      {podeProcessarNoShow && <FormNoShows aulaId={aula.id} />}

      <PainelAulaCheckin
        aulaId={aula.id}
        linhas={linhasPainel}
        tentativasInadimplentes={tentativasInadimplentes}
        podeEditar
      />
    </div>
  )
}

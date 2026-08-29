import { ClipboardList } from "lucide-react"
import { CabecalhoPagina } from "@/components/ui/cabecalho-pagina"
import { exigirPapel } from "@/lib/auth/dal"
import { db } from "@/lib/db"
import { listarMatriculasPendentes } from "@/lib/services/matricula.service"
import { chaveCompetencia, formatarDataInput } from "@/lib/utils/datas"
import { ListaMatriculasPendentes } from "./lista-matriculas-pendentes"

export const dynamic = "force-dynamic"

export default async function MatriculasPendentesPage() {
  await exigirPapel("GESTOR")
  const [solicitacoes, planos] = await Promise.all([
    listarMatriculasPendentes(),
    db.plano.findMany({
      where: { ativo: true },
      orderBy: { nome: "asc" },
      select: { id: true, nome: true, valor: true, periodicidade: true },
    }),
  ])
  const agora = new Date()

  return (
    <div className="space-y-6">
      <CabecalhoPagina
        titulo="Matrículas pendentes"
        descricao="Analise os cadastros recebidos, confira o comprovante e vincule um plano para liberar o aluno."
      >
        <div className="inline-flex items-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-sm">
          <ClipboardList className="size-4 text-primary" />
          <span className="font-semibold tabular-nums">{solicitacoes.length}</span>
          <span className="text-muted-foreground">pendente(s)</span>
        </div>
      </CabecalhoPagina>

      <ListaMatriculasPendentes
        solicitacoes={solicitacoes.map((item) => ({
          ...item,
          criadoEm: item.criadoEm.toISOString(),
          dataNascimento: item.dataNascimento?.toISOString() ?? null,
        }))}
        planos={planos.map((plano) => ({ ...plano, valor: Number(plano.valor) }))}
        competenciaAtual={chaveCompetencia(agora)}
        dataHoje={formatarDataInput(agora)}
      />
    </div>
  )
}

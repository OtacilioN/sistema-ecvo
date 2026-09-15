import { ClipboardList } from "lucide-react"
import { CabecalhoPagina } from "@/components/ui/cabecalho-pagina"
import { exigirPapel } from "@/lib/auth/dal"
import { listarMatriculasPendentes } from "@/lib/services/matricula.service"
import { ListaMatriculasPendentes } from "./lista-matriculas-pendentes"

export const dynamic = "force-dynamic"

export default async function MatriculasPendentesPage() {
  await exigirPapel("GESTOR")
  const solicitacoes = await listarMatriculasPendentes()
  return (
    <div className="space-y-6">
      <CabecalhoPagina
        titulo="Matrículas pendentes"
        descricao="Analise e aprove somente as solicitações Wellhub e TotalPass com benefício declarado."
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
          modalidades:
            item.modalidades.length > 0
              ? item.modalidades.map((vinculo) => vinculo.modalidade)
              : [item.modalidadePrincipal],
          criadoEm: item.criadoEm.toISOString(),
          dataNascimento: item.dataNascimento?.toISOString() ?? null,
          aulaAvulsa: item.aulaAvulsa
            ? {
                ...item.aulaAvulsa,
                inicio: item.aulaAvulsa.inicio.toISOString(),
                fim: item.aulaAvulsa.fim.toISOString(),
              }
            : null,
          plano: item.plano ? { ...item.plano, valor: Number(item.plano.valor) } : null,
          cobrancasAsaas: item.cobrancasAsaas.map((cobranca) => ({
            ...cobranca,
            valor: Number(cobranca.valor),
          })),
        }))}
      />
    </div>
  )
}

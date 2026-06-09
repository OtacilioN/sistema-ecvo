import { CabecalhoPagina } from "@/components/ui/cabecalho-pagina"
import { exigirGestao } from "@/lib/auth/dal"
import { db } from "@/lib/db"
import { TabelaAuditoria } from "./tabela-auditoria"

export const dynamic = "force-dynamic"

export default async function Page() {
  await exigirGestao()
  const logs = await db.logAuditoria.findMany({
    orderBy: { criadoEm: "desc" },
    take: 100,
    include: { autor: { select: { nome: true, papel: true, email: true } } },
  })

  return (
    <div className="space-y-6">
      <CabecalhoPagina
        titulo="Auditoria"
        descricao="Logs de ações críticas com autor, data, entidade e valores."
      />

      <TabelaAuditoria
        logs={logs.map((log) => ({
          id: log.id,
          criadoEm: log.criadoEm,
          acao: log.acao,
          autorNome: log.autor.nome,
          autorPapel: log.autor.papel,
          entidade: log.entidade,
          entidadeId: log.entidadeId,
          justificativa: log.justificativa,
          valorAntigo: log.valorAntigo,
          valorNovo: log.valorNovo,
        }))}
      />
    </div>
  )
}

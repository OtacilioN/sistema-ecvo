import { CabecalhoPagina } from "@/components/ui/cabecalho-pagina"
import { exigirPapel } from "@/lib/auth/dal"
import { listarModalidades } from "@/lib/services/modalidade.service"
import { BotaoNovaModalidade } from "./acoes-modalidade"
import { TabelaModalidades } from "./tabela-modalidades"

export const dynamic = "force-dynamic"

export default async function ModalidadesPage() {
  await exigirPapel("GESTOR")
  const modalidades = await listarModalidades()

  return (
    <div className="space-y-6">
      <CabecalhoPagina titulo="Modalidades" descricao="Modalidades oferecidas pela academia.">
        <BotaoNovaModalidade />
      </CabecalhoPagina>

      <TabelaModalidades
        modalidades={modalidades.map((m) => ({
          id: m.id,
          nome: m.nome,
          descricao: m.descricao,
          duracaoPadraoMin: m.duracaoPadraoMin,
          ativa: m.ativa,
          janelaComparecimentoHoras: m.janelaComparecimentoHoras,
          prazoCancelamentoHoras: m.prazoCancelamentoHoras,
          exigirComparecimentoParaCheckin: m.exigirComparecimentoParaCheckin,
          politicaCheckinSemComparecimento: m.politicaCheckinSemComparecimento,
          listaEsperaAtiva: m.listaEsperaAtiva,
          graduacoes: m.graduacoes.map((g) => ({
            id: g.id,
            nome: g.nome,
            ordem: g.ordem,
            minHoras: g.minHoras,
            minFrequencia: g.minFrequencia,
            minTempoNoGrauDias: g.minTempoNoGrauDias,
          })),
          professorNomes: m.professores.map((p) => p.usuario.nome),
          turmas: m._count.turmas,
          alunos: m._count.alunos,
        }))}
      />
    </div>
  )
}

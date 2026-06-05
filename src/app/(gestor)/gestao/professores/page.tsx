import { CabecalhoPagina } from "@/components/ui/cabecalho-pagina"
import { exigirPapel } from "@/lib/auth/dal"
import { listarModalidades } from "@/lib/services/modalidade.service"
import { listarProfessores } from "@/lib/services/professor.service"
import { BotaoNovoProfessor } from "./acoes-professor"
import { TabelaProfessores } from "./tabela-professores"

export const dynamic = "force-dynamic"

export default async function ProfessoresPage() {
  await exigirPapel("GESTOR")
  const [professores, modalidades] = await Promise.all([
    listarProfessores(),
    listarModalidades({ apenasAtivas: true }),
  ])
  const opcoesModalidades = modalidades.map((m) => ({ id: m.id, nome: m.nome }))

  return (
    <div className="space-y-6">
      <CabecalhoPagina titulo="Professores" descricao="Equipe técnica e modalidades habilitadas.">
        <BotaoNovoProfessor modalidades={opcoesModalidades} />
      </CabecalhoPagina>

      <TabelaProfessores
        modalidades={opcoesModalidades}
        professores={professores.map((p) => ({
          id: p.id,
          nome: p.usuario.nome,
          email: p.usuario.email,
          ativo: p.ativo && p.usuario.ativo,
          cpf: p.cpf,
          telefone: p.telefone,
          fotoUrl: p.fotoUrl,
          observacoes: p.observacoes,
          modalidades: p.modalidades.map((m) => m.id),
          modalidadeNomes: p.modalidades.map((m) => m.nome),
          turmas: p._count.turmas,
        }))}
      />
    </div>
  )
}

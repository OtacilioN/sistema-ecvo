import { CabecalhoPagina } from "@/components/ui/cabecalho-pagina"
import { exigirPapel } from "@/lib/auth/dal"
import { listarAlunos } from "@/lib/services/aluno.service"
import { listarModalidades } from "@/lib/services/modalidade.service"
import { BotaoNovoAluno } from "./acoes-aluno"
import { TabelaAlunos } from "./tabela-alunos"

export const dynamic = "force-dynamic"

export default async function AlunosPage() {
  await exigirPapel("GESTOR")
  const [alunos, modalidades] = await Promise.all([
    listarAlunos(),
    listarModalidades({ apenasAtivas: true }),
  ])
  const opcoesModalidades = modalidades.map((m) => ({ id: m.id, nome: m.nome }))

  return (
    <div className="space-y-6">
      <CabecalhoPagina titulo="Alunos" descricao="Cadastro e gestão de alunos (RF-001..004).">
        <BotaoNovoAluno modalidades={opcoesModalidades} />
      </CabecalhoPagina>

      <TabelaAlunos
        modalidades={opcoesModalidades}
        alunos={alunos.map((a) => ({
          id: a.id,
          nome: a.usuario.nome,
          email: a.usuario.email,
          tipo: a.tipo,
          status: a.status,
          cpf: a.cpf,
          telefone: a.telefone,
          fotoUrl: a.fotoUrl,
          dataNascimento: a.dataNascimento,
          dataInicio: a.dataInicio,
          endereco: a.endereco,
          contatoEmergencia: a.contatoEmergencia,
          restricoesMedicas: a.restricoesMedicas,
          observacoesTecnicas: a.observacoesTecnicas,
          observacoesAdmin: a.observacoesAdmin,
          idExterno: a.idExterno,
          modalidades: a.modalidades.map((m) => m.id),
          responsavel: a.responsavel,
          modalidadeNomes: a.modalidades.map((m) => m.nome),
          documentos: a._count.documentos,
        }))}
      />
    </div>
  )
}

import { CabecalhoPagina } from "@/components/ui/cabecalho-pagina"
import { exigirGestao } from "@/lib/auth/dal"
import { db } from "@/lib/db"
import { listarAlunos } from "@/lib/services/aluno.service"
import { listarModalidades } from "@/lib/services/modalidade.service"
import { chaveCompetencia } from "@/lib/utils/datas"
import { BotaoNovoAluno } from "./acoes-aluno"
import { TabelaAlunos } from "./tabela-alunos"

export const dynamic = "force-dynamic"

export default async function AlunosPage() {
  const usuario = await exigirGestao()
  const podeAdministrarAluno = usuario.papel === "GESTOR"
  const [alunos, modalidades, planos] = await Promise.all([
    listarAlunos(),
    listarModalidades({ apenasAtivas: true }),
    db.plano.findMany({ orderBy: [{ ativo: "desc" }, { nome: "asc" }] }),
  ])
  const opcoesModalidades = modalidades.map((m) => ({ id: m.id, nome: m.nome }))
  const competenciaAtual = chaveCompetencia()
  const opcoesPlanos = planos.map((plano) => ({
    id: plano.id,
    nome: plano.nome,
    valor: Number(plano.valor),
    periodicidade: plano.periodicidade,
    ativo: plano.ativo,
  }))

  return (
    <div className="space-y-6">
      <CabecalhoPagina titulo="Alunos" descricao="Cadastro e gestão de alunos.">
        <BotaoNovoAluno modalidades={opcoesModalidades} planos={opcoesPlanos} />
      </CabecalhoPagina>

      <TabelaAlunos
        modalidades={opcoesModalidades}
        planos={opcoesPlanos}
        competenciaAtual={competenciaAtual}
        podeAdministrar={podeAdministrarAluno}
        alunos={alunos.map((a) => ({
          id: a.id,
          usuarioId: a.usuario.id,
          nome: a.usuario.nome,
          email: a.usuario.email,
          tipo: a.tipo,
          status: a.status,
          cpf: a.cpf,
          telefone: a.telefone,
          fotoUrl: a.usuario.fotoUrl ?? a.fotoUrl,
          dataNascimento: a.dataNascimento,
          dataInicio: a.dataInicio,
          endereco: a.endereco,
          contatoEmergencia: a.contatoEmergencia,
          restricoesMedicas: a.restricoesMedicas,
          observacoesTecnicas: a.observacoesTecnicas,
          observacoesAdmin: a.observacoesAdmin,
          idExterno: a.idExterno,
          planoId: a.planoId,
          planoNome: a.plano?.nome ?? null,
          planoValor: a.plano ? Number(a.plano.valor) : null,
          diaVencimento: a.diaVencimento,
          modalidades: a.modalidades.map((m) => m.id),
          cobrancasModalidades: a.modalidadesPlano.map((modalidade) => ({
            modalidadeId: modalidade.modalidadeId,
            plataformaExterna: modalidade.plataformaExterna,
          })),
          responsavel: a.responsavel,
          modalidadeNomes: a.modalidades.map((m) => m.nome),
          documentos: a._count.documentos,
        }))}
      />
    </div>
  )
}

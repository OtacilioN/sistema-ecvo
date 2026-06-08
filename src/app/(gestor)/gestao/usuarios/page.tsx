import { CabecalhoPagina } from "@/components/ui/cabecalho-pagina"
import { exigirPapel } from "@/lib/auth/dal"
import { listarUsuariosAcesso } from "@/lib/services/usuario.service"
import { TabelaUsuarios } from "./tabela-usuarios"

export const dynamic = "force-dynamic"

export default async function UsuariosPage() {
  await exigirPapel("GESTOR")
  const usuarios = await listarUsuariosAcesso()

  return (
    <div className="space-y-6">
      <CabecalhoPagina
        titulo="Usuários"
        descricao="Contas de acesso dos gestores, professores e alunos."
      />

      <TabelaUsuarios
        usuarios={usuarios.map((usuario) => ({
          id: usuario.id,
          nome: usuario.nome,
          email: usuario.email,
          papel: usuario.papel,
          ativo: usuario.ativo,
          criadoEm: usuario.criadoEm,
          alunoStatus: usuario.aluno?.status ?? null,
          professorAtivo: usuario.professor?.ativo ?? null,
        }))}
      />
    </div>
  )
}

import { AlunoShell } from "@/components/layout/aluno-shell"
import { NAV_ALUNO } from "@/components/layout/navs"
import { exigirPapel } from "@/lib/auth/dal"
import { db } from "@/lib/db"
import { termoResponsabilidadeAtualAceito } from "@/lib/services/termo-responsabilidade.service"
import { TermoResponsabilidadeAluno } from "./termo-responsabilidade"

export default async function AlunoLayout({ children }: { children: React.ReactNode }) {
  const usuario = await exigirPapel("ALUNO")
  const alunoId = usuario.aluno?.id
  const aluno = alunoId
    ? await db.aluno.findUnique({
        where: { id: alunoId },
        select: {
          cpf: true,
          dataNascimento: true,
          usuario: { select: { dataNascimento: true, nome: true } },
        },
      })
    : null
  const termoAceito = alunoId ? await termoResponsabilidadeAtualAceito(alunoId) : false

  return (
    <AlunoShell itens={NAV_ALUNO} usuarioNome={usuario.nome}>
      {aluno && !termoAceito ? <TermoResponsabilidadeAluno aluno={aluno} /> : children}
    </AlunoShell>
  )
}

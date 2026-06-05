import { AlunoShell } from "@/components/layout/aluno-shell"
import { NAV_ALUNO } from "@/components/layout/navs"
import { exigirPapel } from "@/lib/auth/dal"

export default async function AlunoLayout({ children }: { children: React.ReactNode }) {
  await exigirPapel("ALUNO")
  return <AlunoShell itens={NAV_ALUNO}>{children}</AlunoShell>
}

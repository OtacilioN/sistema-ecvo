import { NAV_PROFESSOR } from "@/components/layout/navs"
import { PainelShell } from "@/components/layout/painel-shell"
import { exigirPapel } from "@/lib/auth/dal"

export default async function ProfessorLayout({ children }: { children: React.ReactNode }) {
  const usuario = await exigirPapel("PROFESSOR")
  return (
    <PainelShell itens={NAV_PROFESSOR} usuarioNome={usuario.nome} papelRotulo="Professor">
      {children}
    </PainelShell>
  )
}

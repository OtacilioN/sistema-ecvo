import { NAV_GESTOR } from "@/components/layout/navs"
import { PainelShell } from "@/components/layout/painel-shell"
import { exigirPapel } from "@/lib/auth/dal"

export default async function GestaoLayout({ children }: { children: React.ReactNode }) {
  const usuario = await exigirPapel("GESTOR")
  return (
    <PainelShell itens={NAV_GESTOR} usuarioNome={usuario.nome} papelRotulo="Gestor">
      {children}
    </PainelShell>
  )
}

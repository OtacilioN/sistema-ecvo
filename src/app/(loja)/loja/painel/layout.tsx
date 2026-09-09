import { NAV_LOJA } from "@/components/layout/navs"
import { PainelShell } from "@/components/layout/painel-shell"
import { exigirLoja } from "@/lib/auth/dal"

export default async function LojaLayout({ children }: { children: React.ReactNode }) {
  const usuario = await exigirLoja()
  return (
    <PainelShell
      itens={NAV_LOJA}
      usuarioNome={usuario.nome}
      papelRotulo={usuario.papel === "GESTOR" ? "Gestor · Loja" : "Loja"}
    >
      {children}
    </PainelShell>
  )
}

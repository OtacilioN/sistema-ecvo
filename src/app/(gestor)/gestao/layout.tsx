import { NAV_GESTOR, NAV_SECRETARIA } from "@/components/layout/navs"
import { PainelShell } from "@/components/layout/painel-shell"
import { exigirGestao } from "@/lib/auth/dal"

export default async function GestaoLayout({ children }: { children: React.ReactNode }) {
  const usuario = await exigirGestao()
  const ehSecretaria = usuario.papel === "SECRETARIA"
  return (
    <PainelShell
      itens={ehSecretaria ? NAV_SECRETARIA : NAV_GESTOR}
      usuarioNome={usuario.nome}
      papelRotulo={ehSecretaria ? "Secretaria" : "Gestor"}
    >
      {children}
    </PainelShell>
  )
}

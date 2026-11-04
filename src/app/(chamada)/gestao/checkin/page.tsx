import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { AcessoChamada } from "@/components/checkin/acesso-chamada"
import { PainelChamada, type SearchParams } from "@/components/checkin/painel-chamada"
import { NAV_GESTOR, NAV_PROFESSOR, NAV_SECRETARIA } from "@/components/layout/navs"
import { PainelShell } from "@/components/layout/painel-shell"
import { Marca } from "@/components/marca"
import { chaveChamadaValida, temPermissaoChamada } from "@/lib/auth/chamada-rapida"
import { exigirPapel, sessaoOpcional } from "@/lib/auth/dal"

export const dynamic = "force-dynamic"
export const metadata: Metadata = {
  title: "Chamada da aula",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
}

export default async function CheckinPage({ searchParams }: { searchParams: SearchParams }) {
  const sessao = await sessaoOpcional()
  if (sessao) {
    const usuario = await exigirPapel("GESTOR", "SECRETARIA", "PROFESSOR")
    const professor = usuario.papel === "PROFESSOR"
    const secretaria = usuario.papel === "SECRETARIA"
    return (
      <PainelShell
        itens={professor ? NAV_PROFESSOR : secretaria ? NAV_SECRETARIA : NAV_GESTOR}
        usuarioNome={usuario.nome}
        papelRotulo={professor ? "Professor" : secretaria ? "Secretaria" : "Gestor"}
      >
        <PainelChamada
          searchParams={searchParams}
          podeEditar={usuario.papel === "GESTOR"}
          mostrarQrCode={!professor}
        />
      </PainelShell>
    )
  }
  const params = await searchParams
  if (!chaveChamadaValida(params.acesso)) redirect("/login")
  const liberado = await temPermissaoChamada("consulta")
  return (
    <div className="min-h-dvh bg-background">
      <header className="flex h-16 items-center justify-between border-b bg-card px-4">
        <Marca tamanho={32} />
        <span className="text-xs font-semibold text-muted-foreground">
          Chamada · somente consulta
        </span>
      </header>
      <main className="mx-auto max-w-screen-2xl p-3 sm:p-6">
        {liberado ? (
          <PainelChamada searchParams={searchParams} podeEditar={false} acessoRapido />
        ) : (
          <AcessoChamada chave={params.acesso} />
        )}
      </main>
    </div>
  )
}

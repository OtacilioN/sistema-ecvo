import { normalizarFiltroNotificacoes, PaginaNotificacoes } from "@/components/notificacoes-page"

export const dynamic = "force-dynamic"

type SearchParams = Promise<{ filtro?: string | string[] }>

export default async function Page({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams
  return <PaginaNotificacoes filtro={normalizarFiltroNotificacoes(params.filtro)} />
}

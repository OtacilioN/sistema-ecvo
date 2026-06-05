import { redirect } from "next/navigation"
import { HOME_POR_PAPEL } from "@/lib/auth/dal"
import { lerSessao } from "@/lib/auth/session"

// Raiz: encaminha para a área do papel (ou login). O proxy.ts cobre o caso comum;
// esta página é uma rede de segurança caso o proxy não rode.
export default async function Home() {
  const sessao = await lerSessao()
  redirect(sessao ? HOME_POR_PAPEL[sessao.papel] : "/login")
}

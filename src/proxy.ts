import { type NextRequest, NextResponse } from "next/server"
import { COOKIE_SESSAO, descriptografar } from "@/lib/auth/session"

// Proxy (antigo "middleware" — renomeado no Next.js 16). Runtime nodejs.
// Faz APENAS verificações otimistas de redirecionamento a partir do cookie.
// A autorização real (que protege os dados) acontece na DAL (src/lib/auth/dal.ts),
// chamada por cada página, Server Action e Route Handler.

const PREFIXO_POR_PAPEL: Record<string, string> = {
  GESTOR: "/gestao",
  SECRETARIA: "/gestao",
  PROFESSOR: "/professor",
  ALUNO: "/aluno",
}

const PAPEIS_POR_PREFIXO: Record<string, string[]> = {
  "/gestao": ["GESTOR", "SECRETARIA"],
  "/professor": ["PROFESSOR"],
  "/aluno": ["ALUNO"],
}

const ROTAS_PUBLICAS = ["/login"]
const ROTAS_PWA = ["/manifest.webmanifest", "/offline", "/sw.js"]

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl
  if (ROTAS_PWA.includes(pathname)) return NextResponse.next()

  const token = req.cookies.get(COOKIE_SESSAO)?.value
  const sessao = await descriptografar(token)
  const ehPublica = ROTAS_PUBLICAS.some((r) => pathname.startsWith(r))

  // Não autenticado tentando acessar rota protegida → login.
  if (!sessao) {
    if (ehPublica || pathname === "/") return NextResponse.next()
    return NextResponse.redirect(new URL("/login", req.nextUrl))
  }

  const home = PREFIXO_POR_PAPEL[sessao.papel] ?? "/login"

  // Autenticado em rota pública ou raiz → manda para a home do papel.
  if (ehPublica || pathname === "/") {
    return NextResponse.redirect(new URL(home, req.nextUrl))
  }

  // Autenticado tentando acessar a área de outro papel → home do próprio papel.
  for (const [prefixo, papeisPermitidos] of Object.entries(PAPEIS_POR_PREFIXO)) {
    if (pathname.startsWith(prefixo) && !papeisPermitidos.includes(sessao.papel)) {
      return NextResponse.redirect(new URL(home, req.nextUrl))
    }
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
}

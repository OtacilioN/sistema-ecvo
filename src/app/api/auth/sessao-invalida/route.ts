import { type NextRequest, NextResponse } from "next/server"
import { COOKIE_SESSAO } from "@/lib/auth/session"

export function GET(req: NextRequest) {
  const resposta = NextResponse.redirect(new URL("/login", req.url))
  resposta.cookies.delete(COOKIE_SESSAO)
  return resposta
}

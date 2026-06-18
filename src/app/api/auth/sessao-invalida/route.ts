import { type NextRequest, NextResponse } from "next/server"
import { COOKIE_SESSAO } from "@/lib/auth/session"

export function GET(req: NextRequest) {
  const destino = new URL("/login", req.url)
  if (req.nextUrl.searchParams.get("motivo") === "matricula-cancelada") {
    destino.searchParams.set("motivo", "matricula-cancelada")
  }
  const resposta = NextResponse.redirect(destino)
  resposta.cookies.delete(COOKIE_SESSAO)
  return resposta
}

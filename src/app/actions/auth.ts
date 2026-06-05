"use server"

import { redirect } from "next/navigation"
import { HOME_POR_PAPEL } from "@/lib/auth/dal"
import { verificarSenha } from "@/lib/auth/senha"
import { criarSessao, destruirSessao } from "@/lib/auth/session"
import { db } from "@/lib/db"
import { loginSchema } from "@/lib/validations/auth"

export type EstadoLogin = { erro?: string } | undefined

export async function entrar(_anterior: EstadoLogin, formData: FormData): Promise<EstadoLogin> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    senha: formData.get("senha"),
  })
  if (!parsed.success) return { erro: "Informe e-mail e senha válidos." }

  const { email, senha } = parsed.data
  const usuario = await db.usuario.findUnique({ where: { email } })

  // Mensagem genérica para não revelar se o e-mail existe (segurança).
  const credenciaisInvalidas = { erro: "E-mail ou senha incorretos." }
  if (!usuario?.ativo) return credenciaisInvalidas

  const ok = await verificarSenha(senha, usuario.senhaHash)
  if (!ok) return credenciaisInvalidas

  await criarSessao({ sub: usuario.id, papel: usuario.papel, nome: usuario.nome })
  redirect(HOME_POR_PAPEL[usuario.papel])
}

export async function sair() {
  await destruirSessao()
  redirect("/login")
}

"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { exigirPapel, getUsuarioAtual, HOME_POR_PAPEL } from "@/lib/auth/dal"
import { verificarSenha } from "@/lib/auth/senha"
import { criarSessao, destruirSessao } from "@/lib/auth/session"
import { db } from "@/lib/db"
import {
  alterarSenhaPropria,
  atualizarFotoUsuario,
  redefinirSenhaUsuario,
} from "@/lib/services/usuario.service"
import {
  alterarMinhaSenhaSchema,
  atualizarFotoUsuarioSchema,
  atualizarMinhaFotoSchema,
  loginSchema,
  redefinirSenhaUsuarioSchema,
} from "@/lib/validations/auth"

export type EstadoLogin = { erro?: string } | undefined
export type EstadoSenha = { erro?: string; ok?: boolean } | undefined
export type EstadoFoto = { erro?: string; ok?: boolean } | undefined

function primeiroErro(issues: { message: string }[]): string {
  return issues[0]?.message ?? "Dados inválidos."
}

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

export async function acaoAlterarMinhaSenha(
  _: EstadoSenha,
  formData: FormData,
): Promise<EstadoSenha> {
  const usuario = await getUsuarioAtual()
  const parsed = alterarMinhaSenhaSchema.safeParse({
    senhaAtual: formData.get("senhaAtual"),
    novaSenha: formData.get("novaSenha"),
    confirmarSenha: formData.get("confirmarSenha"),
  })
  if (!parsed.success) return { erro: primeiroErro(parsed.error.issues) }

  const resultado = await alterarSenhaPropria({
    usuarioId: usuario.id,
    senhaAtual: parsed.data.senhaAtual,
    novaSenha: parsed.data.novaSenha,
  })
  if (!resultado.ok) return { erro: resultado.motivo }

  revalidatePath("/gestao/auditoria")
  return { ok: true }
}

export async function acaoRedefinirSenhaUsuario(
  _: EstadoSenha,
  formData: FormData,
): Promise<EstadoSenha> {
  const gestor = await exigirPapel("GESTOR")
  const parsed = redefinirSenhaUsuarioSchema.safeParse({
    usuarioId: formData.get("usuarioId"),
    novaSenha: formData.get("novaSenha"),
    confirmarSenha: formData.get("confirmarSenha"),
  })
  if (!parsed.success) return { erro: primeiroErro(parsed.error.issues) }

  const resultado = await redefinirSenhaUsuario({
    usuarioId: parsed.data.usuarioId,
    novaSenha: parsed.data.novaSenha,
    autorId: gestor.id,
  })
  if (!resultado.ok) return { erro: resultado.motivo }

  revalidatePath("/gestao/usuarios")
  revalidatePath("/gestao/auditoria")
  return { ok: true }
}

export async function acaoAtualizarMinhaFoto(
  _: EstadoFoto,
  formData: FormData,
): Promise<EstadoFoto> {
  const usuario = await getUsuarioAtual()
  const parsed = atualizarMinhaFotoSchema.safeParse({
    fotoUrl: formData.get("fotoUrl"),
  })
  if (!parsed.success) return { erro: primeiroErro(parsed.error.issues) }

  const resultado = await atualizarFotoUsuario({
    usuarioId: usuario.id,
    fotoUrl: parsed.data.fotoUrl,
    autorId: usuario.id,
  })
  if (!resultado.ok) return { erro: resultado.motivo }

  revalidarFotoUsuario(usuario.papel)
  return { ok: true }
}

export async function acaoAtualizarFotoUsuario(
  _: EstadoFoto,
  formData: FormData,
): Promise<EstadoFoto> {
  const gestor = await exigirPapel("GESTOR")
  const parsed = atualizarFotoUsuarioSchema.safeParse({
    usuarioId: formData.get("usuarioId"),
    fotoUrl: formData.get("fotoUrl"),
  })
  if (!parsed.success) return { erro: primeiroErro(parsed.error.issues) }

  const resultado = await atualizarFotoUsuario({
    usuarioId: parsed.data.usuarioId,
    fotoUrl: parsed.data.fotoUrl,
    autorId: gestor.id,
  })
  if (!resultado.ok) return { erro: resultado.motivo }

  revalidarFotoUsuario()
  return { ok: true }
}

function revalidarFotoUsuario(papel?: "GESTOR" | "SECRETARIA" | "PROFESSOR" | "ALUNO") {
  revalidatePath("/gestao/auditoria")
  revalidatePath("/gestao/usuarios")

  if (!papel || papel === "GESTOR" || papel === "SECRETARIA") revalidatePath("/gestao/perfil")
  if (!papel || papel === "PROFESSOR") {
    revalidatePath("/professor/perfil")
    revalidatePath("/gestao/professores")
  }
  if (!papel || papel === "ALUNO") {
    revalidatePath("/aluno/perfil")
    revalidatePath("/gestao/alunos")
  }
}

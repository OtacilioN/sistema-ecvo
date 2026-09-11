import "server-only"
import type { Papel } from "@prisma/client"
import { redirect } from "next/navigation"
import { cache } from "react"
import { alunoComMatriculaCancelada } from "@/lib/alunos/status"
import { lerSessao, type SessaoPayload } from "@/lib/auth/session"
import { db } from "@/lib/db"

// Data Access Layer (DAL): camada central de autenticação/autorização.
// Toda página, Server Action e Route Handler que toca dados protegidos DEVE
// passar por aqui (o proxy.ts faz apenas verificações otimistas de redirecionamento).
// Padrão recomendado pelo guia oficial de autenticação do Next.js 16.

/** Página inicial de cada papel. */
export const HOME_POR_PAPEL: Record<Papel, string> = {
  GESTOR: "/gestao",
  SECRETARIA: "/gestao",
  PROFESSOR: "/professor",
  ALUNO: "/aluno",
}

const ROTA_SESSAO_INVALIDA = "/api/auth/sessao-invalida"
const ROTA_MATRICULA_CANCELADA = `${ROTA_SESSAO_INVALIDA}?motivo=matricula-cancelada`

/** Verifica a sessão; redireciona para /login se ausente/inválida. Memoizado por render. */
export const verificarSessao = cache(async (): Promise<SessaoPayload> => {
  const sessao = await lerSessao()
  if (!sessao?.sub) redirect("/login")
  return sessao
})

/** Retorna a sessão sem redirecionar (para checagens condicionais). */
export const sessaoOpcional = cache(async (): Promise<SessaoPayload | null> => {
  return lerSessao()
})

/** Carrega o usuário atual do banco (DTO enxuto — sem senha). */
export const getUsuarioAtual = cache(async () => {
  const sessao = await verificarSessao()
  const usuario = await db.usuario.findUnique({
    where: { id: sessao.sub },
    select: {
      id: true,
      nome: true,
      email: true,
      fotoUrl: true,
      papel: true,
      ativo: true,
      aluno: { select: { id: true, status: true } },
      professor: { select: { id: true } },
    },
  })
  if (!usuario?.ativo) redirect(ROTA_SESSAO_INVALIDA)
  if (
    usuario.papel === "ALUNO" &&
    usuario.aluno &&
    alunoComMatriculaCancelada(usuario.aluno.status)
  ) {
    redirect(ROTA_MATRICULA_CANCELADA)
  }
  return usuario
})

/**
 * Exige que o usuário tenha um dos papéis informados.
 * Redireciona para a home do próprio papel se não autorizado (evita vazar rotas).
 */
export async function exigirPapel(...papeis: Papel[]) {
  const usuario = await getUsuarioAtual()
  if (!papeis.includes(usuario.papel)) {
    redirect(HOME_POR_PAPEL[usuario.papel])
  }
  return usuario
}

/** Atalho: área administrativa compartilhada entre Gestor e Secretaria. */
export async function exigirGestao() {
  return exigirPapel("GESTOR", "SECRETARIA")
}

/** Atalho: exige que o usuário seja um Aluno e retorna o id do Aluno. */
export async function exigirAluno() {
  const usuario = await exigirPapel("ALUNO")
  if (!usuario.aluno) redirect(ROTA_SESSAO_INVALIDA)
  return { usuario, alunoId: usuario.aluno.id }
}

/** Atalho: exige Professor e retorna o id do Professor. */
export async function exigirProfessor() {
  const usuario = await exigirPapel("PROFESSOR")
  if (!usuario.professor) redirect(ROTA_SESSAO_INVALIDA)
  return { usuario, professorId: usuario.professor.id }
}

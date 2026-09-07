import type { Prisma } from "@prisma/client"
import { db } from "@/lib/db"
import { fotoPathnameDeUrl } from "@/lib/fotos"

function filtroPublicacao(alunoId?: string): Prisma.AlunoWhereInput {
  return {
    ...(alunoId ? { id: alunoId } : {}),
    status: { in: ["ATIVO", "INADIMPLENTE"] },
    usuario: { ativo: true },
    graduacoes: { some: {} },
  }
}

export async function listarAlunosGraduadosPublicos(origem: string) {
  const alunos = await db.aluno.findMany({
    where: filtroPublicacao(),
    orderBy: { usuario: { nome: "asc" } },
    select: {
      id: true,
      fotoUrl: true,
      usuario: { select: { nome: true, fotoUrl: true } },
      graduacoes: {
        orderBy: [{ concedidaEm: "asc" }, { id: "asc" }],
        select: {
          concedidaEm: true,
          graduacao: {
            select: {
              nome: true,
              modalidade: { select: { nome: true } },
            },
          },
        },
      },
    },
  })

  return alunos.map((aluno) => {
    const fotoUrl = aluno.usuario.fotoUrl ?? aluno.fotoUrl

    return {
      nome: aluno.usuario.nome,
      fotoUrl: urlFotoPublica(origem, aluno.id, fotoUrl),
      graduacoes: aluno.graduacoes.map((registro) => ({
        modalidade: registro.graduacao.modalidade.nome,
        faixa: registro.graduacao.nome,
        dataGraduacao: registro.concedidaEm.toISOString(),
      })),
    }
  })
}

export async function obterPathnameFotoAlunoGraduadoPublico(alunoId: string) {
  const aluno = await db.aluno.findFirst({
    where: filtroPublicacao(alunoId),
    select: {
      fotoUrl: true,
      usuario: { select: { fotoUrl: true } },
    },
  })

  return fotoPathnameDeUrl(aluno?.usuario.fotoUrl ?? aluno?.fotoUrl)
}

function urlFotoPublica(origem: string, alunoId: string, fotoUrl: string | null) {
  if (!fotoUrl) return null
  if (!fotoPathnameDeUrl(fotoUrl)) return fotoUrl

  return new URL(
    `/api/publico/alunos-graduados/${encodeURIComponent(alunoId)}/foto`,
    origem,
  ).toString()
}

import "server-only"
import { gerarHashSenha } from "@/lib/auth/senha"
import { db } from "@/lib/db"
import { registrarLog } from "@/lib/services/auditoria.service"
import { excluirFotosInternasAntigas } from "@/lib/storage/blob-fotos"

// Serviço de PROFESSORES (RF-005/006). Criar um professor cria o Usuario (papel PROFESSOR)
// e o Professor vinculado, conectando as modalidades habilitadas.

export function listarProfessores() {
  return db.professor.findMany({
    orderBy: { usuario: { nome: "asc" } },
    include: {
      usuario: { select: { id: true, nome: true, email: true, fotoUrl: true, ativo: true } },
      modalidades: { select: { id: true, nome: true } },
      _count: { select: { turmas: true } },
    },
  })
}

export async function criarProfessor(params: {
  nome: string
  email: string
  senha: string
  cpf?: string | null
  telefone?: string | null
  fotoUrl?: string | null
  observacoes?: string | null
  modalidadeIds: string[]
  autorId: string
}) {
  const senhaHash = await gerarHashSenha(params.senha)
  return db.$transaction(async (tx) => {
    const usuario = await tx.usuario.create({
      data: {
        nome: params.nome,
        email: params.email,
        senhaHash,
        fotoUrl: params.fotoUrl ?? null,
        papel: "PROFESSOR",
        professor: {
          create: {
            cpf: params.cpf ?? null,
            telefone: params.telefone ?? null,
            fotoUrl: params.fotoUrl ?? null,
            observacoes: params.observacoes ?? null,
            modalidades: { connect: params.modalidadeIds.map((id) => ({ id })) },
          },
        },
      },
      include: { professor: true },
    })

    await registrarLog(
      {
        autorId: params.autorId,
        acao: "PROFESSOR_CRIADO",
        entidade: "Professor",
        entidadeId: usuario.professor?.id ?? usuario.id,
        valorNovo: {
          usuarioId: usuario.id,
          nome: usuario.nome,
          email: usuario.email,
          cpfInformado: Boolean(params.cpf),
          modalidadeIds: params.modalidadeIds,
          fotoInformada: Boolean(params.fotoUrl),
          ativo: usuario.ativo,
        },
      },
      tx,
    )

    return usuario
  })
}

export async function atualizarProfessor(
  professorId: string,
  params: {
    nome?: string
    cpf?: string | null
    telefone?: string | null
    fotoUrl?: string | null
    observacoes?: string | null
    ativo?: boolean
    modalidadeIds?: string[]
    autorId: string
  },
) {
  const atual = await db.professor.findUnique({
    where: { id: professorId },
    select: {
      id: true,
      cpf: true,
      telefone: true,
      fotoUrl: true,
      observacoes: true,
      ativo: true,
      usuario: { select: { nome: true, email: true, fotoUrl: true, ativo: true } },
      modalidades: { select: { id: true, nome: true } },
    },
  })
  if (!atual) return { ok: false as const, motivo: "Professor não encontrado." }

  const resultado = await db.$transaction(async (tx) => {
    const professor = await tx.professor.update({
      where: { id: atual.id },
      data: {
        ...(params.nome !== undefined || params.fotoUrl !== undefined
          ? {
              usuario: {
                update: {
                  ...(params.nome !== undefined ? { nome: params.nome } : {}),
                  ...(params.fotoUrl !== undefined ? { fotoUrl: params.fotoUrl } : {}),
                },
              },
            }
          : {}),
        ...(params.cpf !== undefined ? { cpf: params.cpf } : {}),
        ...(params.telefone !== undefined ? { telefone: params.telefone } : {}),
        ...(params.fotoUrl !== undefined ? { fotoUrl: params.fotoUrl } : {}),
        ...(params.observacoes !== undefined ? { observacoes: params.observacoes } : {}),
        ...(params.ativo !== undefined ? { ativo: params.ativo } : {}),
        ...(params.modalidadeIds
          ? { modalidades: { set: params.modalidadeIds.map((id) => ({ id })) } }
          : {}),
      },
      include: {
        usuario: { select: { nome: true, email: true, fotoUrl: true, ativo: true } },
        modalidades: { select: { id: true, nome: true } },
      },
    })

    const valorAntigo = serializarProfessor({
      nome: atual.usuario.nome,
      email: atual.usuario.email,
      ativo: atual.ativo,
      usuarioAtivo: atual.usuario.ativo,
      cpf: atual.cpf,
      telefone: atual.telefone,
      fotoUrl: atual.fotoUrl,
      observacoes: atual.observacoes,
      modalidades: atual.modalidades.map((item) => item.nome),
    })
    const valorNovo = serializarProfessor({
      nome: professor.usuario.nome,
      email: professor.usuario.email,
      ativo: professor.ativo,
      usuarioAtivo: professor.usuario.ativo,
      cpf: professor.cpf,
      telefone: professor.telefone,
      fotoUrl: professor.fotoUrl,
      observacoes: professor.observacoes,
      modalidades: professor.modalidades.map((item) => item.nome),
    })

    if (JSON.stringify(valorAntigo) !== JSON.stringify(valorNovo)) {
      await registrarLog(
        {
          autorId: params.autorId,
          acao: "CONFIGURACAO",
          entidade: "Professor",
          entidadeId: professor.id,
          valorAntigo,
          valorNovo,
        },
        tx,
      )
    }

    return professor
  })

  if (
    params.fotoUrl !== undefined &&
    (atual.fotoUrl !== resultado.fotoUrl || atual.usuario.fotoUrl !== resultado.usuario.fotoUrl)
  ) {
    await excluirFotosInternasAntigas([atual.fotoUrl, atual.usuario.fotoUrl], resultado.fotoUrl)
  }

  return { ok: true as const, professor: resultado }
}

export async function excluirProfessor(params: { professorId: string; autorId: string }) {
  const professor = await db.professor.findUnique({
    where: { id: params.professorId },
    select: {
      id: true,
      usuario: {
        select: {
          id: true,
          nome: true,
          email: true,
          fotoUrl: true,
          ativo: true,
        },
      },
      cpf: true,
      telefone: true,
      fotoUrl: true,
      observacoes: true,
      modalidades: { select: { id: true, nome: true } },
    },
  })
  if (!professor) return { ok: false as const, motivo: "Professor não encontrado." }

  const hasLogs = await db.logAuditoria.count({ where: { autorId: professor.usuario.id } })
  if (hasLogs > 0) {
    return {
      ok: false as const,
      motivo:
        "Não é possível excluir este professor porque ele já possui logs de auditoria próprios.",
    }
  }

  await db.$transaction(async (tx) => {
    await tx.usuario.delete({ where: { id: professor.usuario.id } })
    await registrarLog(
      {
        autorId: params.autorId,
        acao: "CONFIGURACAO",
        entidade: "Professor",
        entidadeId: professor.id,
        valorAntigo: {
          nome: professor.usuario.nome,
          email: professor.usuario.email,
          ativo: professor.usuario.ativo,
          cpf: professor.cpf,
          telefone: professor.telefone,
          fotoUrl: professor.fotoUrl,
          observacoes: professor.observacoes,
          modalidades: professor.modalidades.map((modalidade) => modalidade.nome),
        },
      },
      tx,
    )
  })

  await excluirFotosInternasAntigas([professor.fotoUrl, professor.usuario.fotoUrl], null)

  return { ok: true as const, professorId: professor.id }
}

export async function atualizarStatusProfessor(params: {
  professorId: string
  ativo: boolean
  autorId: string
}) {
  const professor = await db.professor.findUnique({
    where: { id: params.professorId },
    select: {
      id: true,
      ativo: true,
      usuarioId: true,
      usuario: { select: { nome: true, email: true, ativo: true } },
    },
  })
  if (!professor) return { ok: false as const, motivo: "Professor não encontrado." }

  const atualizado = await db.$transaction(async (tx) => {
    const novo = await tx.professor.update({
      where: { id: professor.id },
      data: {
        ativo: params.ativo,
        usuario: { update: { ativo: params.ativo } },
      },
      select: {
        id: true,
        ativo: true,
        usuario: { select: { ativo: true } },
      },
    })

    if (professor.ativo !== novo.ativo || professor.usuario.ativo !== novo.usuario.ativo) {
      await registrarLog(
        {
          autorId: params.autorId,
          acao: "PROFESSOR_STATUS_ATUALIZADO",
          entidade: "Professor",
          entidadeId: professor.id,
          valorAntigo: {
            professor: professor.usuario.nome,
            email: professor.usuario.email,
            ativo: professor.ativo,
            usuarioAtivo: professor.usuario.ativo,
          },
          valorNovo: {
            professor: professor.usuario.nome,
            email: professor.usuario.email,
            ativo: novo.ativo,
            usuarioAtivo: novo.usuario.ativo,
          },
        },
        tx,
      )
    }

    return novo
  })

  return { ok: true as const, professor: atualizado }
}

function serializarProfessor(dados: {
  nome: string
  email: string
  ativo: boolean
  usuarioAtivo: boolean
  cpf: string | null
  telefone: string | null
  fotoUrl: string | null
  observacoes: string | null
  modalidades: string[]
}) {
  return {
    nome: dados.nome,
    email: dados.email,
    ativo: dados.ativo,
    usuarioAtivo: dados.usuarioAtivo,
    cpf: dados.cpf,
    telefone: dados.telefone,
    fotoUrl: dados.fotoUrl,
    observacoes: dados.observacoes,
    modalidades: dados.modalidades,
  }
}

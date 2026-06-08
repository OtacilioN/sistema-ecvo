import "server-only"
import type { Prisma, StatusAluno, TipoAluno } from "@prisma/client"
import { gerarHashSenha } from "@/lib/auth/senha"
import { db } from "@/lib/db"
import { registrarLog } from "@/lib/services/auditoria.service"
import { excluirFotoInternaSeExistir } from "@/lib/storage/blob-fotos"

// Serviço de ALUNOS (RF-001..004). Criar um aluno cria o Usuario (papel ALUNO) + Aluno,
// conecta modalidades e, se menor de idade, o responsável.

export function listarAlunos(opts?: { busca?: string; status?: StatusAluno }) {
  const where: Prisma.AlunoWhereInput = {}
  if (opts?.status) where.status = opts.status
  if (opts?.busca) {
    where.usuario = {
      OR: [
        { nome: { contains: opts.busca, mode: "insensitive" } },
        { email: { contains: opts.busca, mode: "insensitive" } },
      ],
    }
  }
  return db.aluno.findMany({
    where,
    orderBy: { usuario: { nome: "asc" } },
    include: {
      usuario: { select: { nome: true, email: true, ativo: true } },
      modalidades: { select: { id: true, nome: true } },
      responsavel: true,
      plano: { select: { nome: true } },
      _count: { select: { documentos: true } },
    },
  })
}

export function obterAluno(alunoId: string) {
  return db.aluno.findUnique({
    where: { id: alunoId },
    include: {
      usuario: { select: { nome: true, email: true } },
      modalidades: { select: { id: true, nome: true } },
      responsavel: true,
      plano: true,
    },
  })
}

type DadosAluno = {
  tipo: TipoAluno
  status?: StatusAluno
  cpf?: string | null
  telefone?: string | null
  fotoUrl?: string | null
  dataNascimento?: Date | null
  endereco?: string | null
  dataInicio?: Date | null
  contatoEmergencia?: string | null
  restricoesMedicas?: string | null
  observacoesTecnicas?: string | null
  observacoesAdmin?: string | null
  idExterno?: string | null
  diaVencimento?: number
  modalidadeIds: string[]
  responsavel?: {
    nome: string
    cpf?: string | null
    telefone?: string | null
    email?: string | null
    grauParentesco?: string | null
    responsavelFinanceiro?: boolean
  } | null
}

export async function criarAluno(
  params: { nome: string; email: string; senha: string; autorId: string } & DadosAluno,
) {
  const senhaHash = await gerarHashSenha(params.senha)
  return db.$transaction(async (tx) => {
    const usuario = await tx.usuario.create({
      data: {
        nome: params.nome,
        email: params.email,
        senhaHash,
        papel: "ALUNO",
        aluno: {
          create: {
            tipo: params.tipo,
            status: params.status ?? "ATIVO",
            cpf: params.cpf ?? null,
            telefone: params.telefone ?? null,
            fotoUrl: params.fotoUrl ?? null,
            dataNascimento: params.dataNascimento ?? null,
            endereco: params.endereco ?? null,
            dataInicio: params.dataInicio ?? new Date(),
            contatoEmergencia: params.contatoEmergencia ?? null,
            restricoesMedicas: params.restricoesMedicas ?? null,
            observacoesTecnicas: params.observacoesTecnicas ?? null,
            observacoesAdmin: params.observacoesAdmin ?? null,
            idExterno: params.idExterno ?? null,
            diaVencimento: params.diaVencimento ?? 10,
            modalidades: { connect: params.modalidadeIds.map((id) => ({ id })) },
            ...(params.responsavel
              ? {
                  responsavel: {
                    create: {
                      nome: params.responsavel.nome,
                      cpf: params.responsavel.cpf ?? null,
                      telefone: params.responsavel.telefone ?? null,
                      email: params.responsavel.email ?? null,
                      grauParentesco: params.responsavel.grauParentesco ?? null,
                      responsavelFinanceiro: params.responsavel.responsavelFinanceiro ?? false,
                    },
                  },
                }
              : {}),
          },
        },
      },
      include: { aluno: true },
    })

    await registrarLog(
      {
        autorId: params.autorId,
        acao: "ALUNO_CRIADO",
        entidade: "Aluno",
        entidadeId: usuario.aluno?.id ?? usuario.id,
        valorNovo: {
          usuarioId: usuario.id,
          nome: usuario.nome,
          email: usuario.email,
          tipo: usuario.aluno?.tipo,
          status: usuario.aluno?.status,
          diaVencimento: usuario.aluno?.diaVencimento,
          modalidadeIds: params.modalidadeIds,
          responsavelInformado: Boolean(params.responsavel),
          cpfInformado: Boolean(params.cpf),
          fotoInformada: Boolean(params.fotoUrl),
          idExternoInformado: Boolean(params.idExterno),
        },
      },
      tx,
    )

    return usuario
  })
}

export async function atualizarAluno(
  alunoId: string,
  params: Partial<DadosAluno> & { nome?: string; autorId: string },
) {
  const atual = await db.aluno.findUnique({
    where: { id: alunoId },
    select: {
      id: true,
      tipo: true,
      status: true,
      cpf: true,
      telefone: true,
      fotoUrl: true,
      dataNascimento: true,
      endereco: true,
      dataInicio: true,
      contatoEmergencia: true,
      restricoesMedicas: true,
      observacoesTecnicas: true,
      observacoesAdmin: true,
      idExterno: true,
      diaVencimento: true,
      responsavel: true,
      usuario: { select: { nome: true } },
      modalidades: { select: { id: true, nome: true } },
    },
  })
  if (!atual) return { ok: false as const, motivo: "Aluno não encontrado." }

  const atualizado = await db.$transaction(async (tx) => {
    if (params.responsavel !== undefined) {
      if (params.responsavel) {
        await tx.responsavel.upsert({
          where: { alunoId: atual.id },
          create: {
            alunoId: atual.id,
            nome: params.responsavel.nome,
            cpf: params.responsavel.cpf ?? null,
            telefone: params.responsavel.telefone ?? null,
            email: params.responsavel.email ?? null,
            grauParentesco: params.responsavel.grauParentesco ?? null,
            responsavelFinanceiro: params.responsavel.responsavelFinanceiro ?? false,
          },
          update: {
            nome: params.responsavel.nome,
            cpf: params.responsavel.cpf ?? null,
            telefone: params.responsavel.telefone ?? null,
            email: params.responsavel.email ?? null,
            grauParentesco: params.responsavel.grauParentesco ?? null,
            responsavelFinanceiro: params.responsavel.responsavelFinanceiro ?? false,
          },
        })
      } else {
        await tx.responsavel.deleteMany({ where: { alunoId: atual.id } })
      }
    }

    const aluno = await tx.aluno.update({
      where: { id: atual.id },
      data: {
        ...(params.nome !== undefined ? { usuario: { update: { nome: params.nome } } } : {}),
        ...(params.tipo !== undefined ? { tipo: params.tipo } : {}),
        ...(params.status !== undefined ? { status: params.status } : {}),
        ...(params.cpf !== undefined ? { cpf: params.cpf } : {}),
        ...(params.telefone !== undefined ? { telefone: params.telefone } : {}),
        ...(params.fotoUrl !== undefined ? { fotoUrl: params.fotoUrl } : {}),
        ...(params.dataNascimento !== undefined ? { dataNascimento: params.dataNascimento } : {}),
        ...(params.endereco !== undefined ? { endereco: params.endereco } : {}),
        ...(params.dataInicio !== undefined ? { dataInicio: params.dataInicio } : {}),
        ...(params.contatoEmergencia !== undefined
          ? { contatoEmergencia: params.contatoEmergencia }
          : {}),
        ...(params.restricoesMedicas !== undefined
          ? { restricoesMedicas: params.restricoesMedicas }
          : {}),
        ...(params.observacoesTecnicas !== undefined
          ? { observacoesTecnicas: params.observacoesTecnicas }
          : {}),
        ...(params.observacoesAdmin !== undefined
          ? { observacoesAdmin: params.observacoesAdmin }
          : {}),
        ...(params.idExterno !== undefined ? { idExterno: params.idExterno } : {}),
        ...(params.diaVencimento !== undefined ? { diaVencimento: params.diaVencimento } : {}),
        ...(params.modalidadeIds
          ? { modalidades: { set: params.modalidadeIds.map((id) => ({ id })) } }
          : {}),
      },
      include: {
        usuario: { select: { nome: true } },
        modalidades: { select: { id: true, nome: true } },
        responsavel: true,
      },
    })

    if (params.modalidadeIds) {
      await tx.alunoPlanoModalidade.deleteMany({
        where: {
          alunoId: atual.id,
          modalidadeId: { notIn: params.modalidadeIds },
        },
      })
    }

    const valorAntigo = serializarAluno({
      nome: atual.usuario.nome,
      tipo: atual.tipo,
      status: atual.status,
      cpf: atual.cpf,
      telefone: atual.telefone,
      fotoUrl: atual.fotoUrl,
      dataNascimento: atual.dataNascimento,
      endereco: atual.endereco,
      dataInicio: atual.dataInicio,
      contatoEmergencia: atual.contatoEmergencia,
      restricoesMedicas: atual.restricoesMedicas,
      observacoesTecnicas: atual.observacoesTecnicas,
      observacoesAdmin: atual.observacoesAdmin,
      idExterno: atual.idExterno,
      diaVencimento: atual.diaVencimento,
      modalidades: atual.modalidades.map((modalidade) => modalidade.nome),
      responsavel: atual.responsavel,
    })
    const valorNovo = serializarAluno({
      nome: aluno.usuario.nome,
      tipo: aluno.tipo,
      status: aluno.status,
      cpf: aluno.cpf,
      telefone: aluno.telefone,
      fotoUrl: aluno.fotoUrl,
      dataNascimento: aluno.dataNascimento,
      endereco: aluno.endereco,
      dataInicio: aluno.dataInicio,
      contatoEmergencia: aluno.contatoEmergencia,
      restricoesMedicas: aluno.restricoesMedicas,
      observacoesTecnicas: aluno.observacoesTecnicas,
      observacoesAdmin: aluno.observacoesAdmin,
      idExterno: aluno.idExterno,
      diaVencimento: aluno.diaVencimento,
      modalidades: aluno.modalidades.map((modalidade) => modalidade.nome),
      responsavel: aluno.responsavel,
    })

    if (JSON.stringify(valorAntigo) !== JSON.stringify(valorNovo)) {
      await registrarLog(
        {
          autorId: params.autorId,
          acao: "CONFIGURACAO",
          entidade: "Aluno",
          entidadeId: aluno.id,
          valorAntigo,
          valorNovo,
        },
        tx,
      )
    }

    return aluno
  })

  if (params.fotoUrl !== undefined && atual.fotoUrl !== atualizado.fotoUrl) {
    await excluirFotoInternaSeExistir(atual.fotoUrl)
  }

  return { ok: true as const, aluno: atualizado }
}

export async function excluirAluno(params: { alunoId: string; autorId: string }) {
  const aluno = await db.aluno.findUnique({
    where: { id: params.alunoId },
    select: {
      id: true,
      usuario: { select: { id: true, nome: true, email: true } },
      tipo: true,
      status: true,
      cpf: true,
      telefone: true,
      fotoUrl: true,
      dataNascimento: true,
      endereco: true,
      dataInicio: true,
      contatoEmergencia: true,
      restricoesMedicas: true,
      observacoesTecnicas: true,
      observacoesAdmin: true,
      idExterno: true,
      diaVencimento: true,
      responsavel: true,
      modalidades: { select: { id: true, nome: true } },
    },
  })
  if (!aluno) return { ok: false as const, motivo: "Aluno não encontrado." }

  const hasLogs = await db.logAuditoria.count({ where: { autorId: aluno.usuario.id } })
  if (hasLogs > 0) {
    return {
      ok: false as const,
      motivo: "Não é possível excluir este aluno porque ele já possui logs de auditoria próprios.",
    }
  }

  await db.$transaction(async (tx) => {
    await tx.usuario.delete({ where: { id: aluno.usuario.id } })
    await registrarLog(
      {
        autorId: params.autorId,
        acao: "CONFIGURACAO",
        entidade: "Aluno",
        entidadeId: aluno.id,
        valorAntigo: serializarAluno({
          nome: aluno.usuario.nome,
          tipo: aluno.tipo,
          status: aluno.status,
          cpf: aluno.cpf,
          telefone: aluno.telefone,
          fotoUrl: aluno.fotoUrl,
          dataNascimento: aluno.dataNascimento,
          endereco: aluno.endereco,
          dataInicio: aluno.dataInicio,
          contatoEmergencia: aluno.contatoEmergencia,
          restricoesMedicas: aluno.restricoesMedicas,
          observacoesTecnicas: aluno.observacoesTecnicas,
          observacoesAdmin: aluno.observacoesAdmin,
          idExterno: aluno.idExterno,
          diaVencimento: aluno.diaVencimento,
          modalidades: aluno.modalidades.map((modalidade) => modalidade.nome),
          responsavel: aluno.responsavel,
        }),
      },
      tx,
    )
  })

  await excluirFotoInternaSeExistir(aluno.fotoUrl)

  return { ok: true as const, alunoId: aluno.id }
}

function serializarAluno(dados: {
  nome: string
  tipo: TipoAluno
  status: StatusAluno
  cpf: string | null
  telefone: string | null
  fotoUrl: string | null
  dataNascimento: Date | null
  endereco: string | null
  dataInicio: Date | null
  contatoEmergencia: string | null
  restricoesMedicas: string | null
  observacoesTecnicas: string | null
  observacoesAdmin: string | null
  idExterno: string | null
  diaVencimento: number
  modalidades: string[]
  responsavel?: {
    nome: string
    cpf: string | null
    telefone: string | null
    email: string | null
    grauParentesco: string | null
    responsavelFinanceiro: boolean
  } | null
}) {
  return {
    nome: dados.nome,
    tipo: dados.tipo,
    status: dados.status,
    cpf: dados.cpf,
    telefone: dados.telefone,
    fotoUrl: dados.fotoUrl,
    dataNascimento: dados.dataNascimento?.toISOString(),
    endereco: dados.endereco,
    dataInicio: dados.dataInicio?.toISOString(),
    contatoEmergencia: dados.contatoEmergencia,
    restricoesMedicas: dados.restricoesMedicas,
    observacoesTecnicas: dados.observacoesTecnicas,
    observacoesAdmin: dados.observacoesAdmin,
    idExterno: dados.idExterno,
    diaVencimento: dados.diaVencimento,
    modalidades: dados.modalidades,
    responsavel: dados.responsavel
      ? {
          nome: dados.responsavel.nome,
          cpf: dados.responsavel.cpf,
          telefone: dados.responsavel.telefone,
          email: dados.responsavel.email,
          grauParentesco: dados.responsavel.grauParentesco,
          responsavelFinanceiro: dados.responsavel.responsavelFinanceiro,
        }
      : null,
  }
}

export async function atualizarStatusTipoAluno(params: {
  alunoId: string
  tipo: TipoAluno
  status: StatusAluno
  autorId: string
}) {
  const aluno = await db.aluno.findUnique({
    where: { id: params.alunoId },
    select: {
      id: true,
      tipo: true,
      status: true,
      usuario: { select: { nome: true } },
    },
  })
  if (!aluno) return { ok: false as const, motivo: "Aluno não encontrado." }

  const atualizado = await db.$transaction(async (tx) => {
    const novo = await tx.aluno.update({
      where: { id: params.alunoId },
      data: {
        tipo: params.tipo,
        status: params.status,
      },
      select: { id: true, tipo: true, status: true },
    })

    if (aluno.tipo !== novo.tipo) {
      await registrarLog(
        {
          autorId: params.autorId,
          acao: "TIPO_ALUNO",
          entidade: "Aluno",
          entidadeId: aluno.id,
          valorAntigo: { aluno: aluno.usuario.nome, tipo: aluno.tipo },
          valorNovo: { aluno: aluno.usuario.nome, tipo: novo.tipo },
        },
        tx,
      )
    }

    if (aluno.status !== novo.status) {
      await registrarLog(
        {
          autorId: params.autorId,
          acao: "STATUS_ALUNO",
          entidade: "Aluno",
          entidadeId: aluno.id,
          valorAntigo: { aluno: aluno.usuario.nome, status: aluno.status },
          valorNovo: { aluno: aluno.usuario.nome, status: novo.status },
        },
        tx,
      )
    }

    return novo
  })

  return { ok: true as const, aluno: atualizado }
}

export async function atualizarObservacoesTecnicas(params: {
  alunoId: string
  observacoesTecnicas: string | null
  autorId: string
  professorId?: string | null
  porGestor?: boolean
}) {
  const aluno = await db.aluno.findUnique({
    where: { id: params.alunoId },
    select: {
      id: true,
      observacoesTecnicas: true,
      usuario: { select: { nome: true } },
      modalidades: { select: { id: true, nome: true } },
    },
  })
  if (!aluno) return { ok: false as const, motivo: "Aluno não encontrado." }

  if (!params.porGestor) {
    if (!params.professorId) return { ok: false as const, motivo: "Professor não identificado." }
    const professor = await db.professor.findUnique({
      where: { id: params.professorId },
      select: { modalidades: { select: { id: true } } },
    })
    const modalidadesProfessor = new Set(professor?.modalidades.map((modalidade) => modalidade.id))
    const autorizado = aluno.modalidades.some((modalidade) =>
      modalidadesProfessor.has(modalidade.id),
    )
    if (!autorizado) {
      return { ok: false as const, motivo: "Professor não habilitado nas modalidades do aluno." }
    }
  }

  const atualizado = await db.$transaction(async (tx) => {
    const novo = await tx.aluno.update({
      where: { id: params.alunoId },
      data: { observacoesTecnicas: params.observacoesTecnicas },
      select: { id: true, observacoesTecnicas: true },
    })

    await registrarLog(
      {
        autorId: params.autorId,
        acao: "OBSERVACAO_TECNICA",
        entidade: "Aluno",
        entidadeId: aluno.id,
        valorAntigo: {
          aluno: aluno.usuario.nome,
          observacoesTecnicas: aluno.observacoesTecnicas,
        },
        valorNovo: {
          aluno: aluno.usuario.nome,
          observacoesTecnicas: novo.observacoesTecnicas,
          modalidades: aluno.modalidades.map((modalidade) => modalidade.nome),
        },
      },
      tx,
    )

    return novo
  })

  return { ok: true as const, aluno: atualizado }
}

export async function criarDocumentoAluno(params: {
  alunoId: string
  titulo: string
  categoria?: string | null
  url: string
  observacao?: string | null
  autorId: string
}) {
  const aluno = await db.aluno.findUnique({
    where: { id: params.alunoId },
    select: { id: true, usuario: { select: { nome: true } } },
  })
  if (!aluno) return { ok: false as const, motivo: "Aluno não encontrado." }

  const documento = await db.$transaction(async (tx) => {
    const criado = await tx.documentoAluno.create({
      data: {
        alunoId: params.alunoId,
        titulo: params.titulo,
        categoria: params.categoria ?? null,
        url: params.url,
        observacao: params.observacao ?? null,
        criadoPorId: params.autorId,
      },
    })

    await registrarLog(
      {
        autorId: params.autorId,
        acao: "DOCUMENTO_ALUNO_ADICIONADO",
        entidade: "DocumentoAluno",
        entidadeId: criado.id,
        valorNovo: {
          alunoId: aluno.id,
          aluno: aluno.usuario.nome,
          titulo: criado.titulo,
          categoria: criado.categoria,
          url: criado.url,
        },
      },
      tx,
    )

    return criado
  })

  return { ok: true as const, documento }
}

import "server-only"
import type { Plataforma, Prisma, StatusAluno, TipoAluno } from "@prisma/client"
import { gerarHashSenha } from "@/lib/auth/senha"
import { db } from "@/lib/db"
import { registrarLog } from "@/lib/services/auditoria.service"
import { atualizarVencimentosMensalidadesAluno } from "@/lib/services/financeiro.service"
import { excluirFotosInternasAntigas } from "@/lib/storage/blob-fotos"
import { TERMO_RESPONSABILIDADE_VERSAO } from "@/lib/termo-responsabilidade"

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
      usuario: { select: { id: true, nome: true, email: true, fotoUrl: true, ativo: true } },
      modalidades: { select: { id: true, nome: true } },
      modalidadesPlano: { select: { modalidadeId: true, plataformaExterna: true } },
      aceitesTermoResponsabilidade: {
        where: { termoVersao: TERMO_RESPONSABILIDADE_VERSAO },
        orderBy: { aceitoEm: "desc" },
        take: 1,
        select: { aceitoEm: true, termoVersao: true },
      },
      responsavel: true,
      plano: { select: { nome: true, valor: true } },
      _count: { select: { documentos: true } },
    },
  })
}

export function obterAluno(alunoId: string) {
  return db.aluno.findUnique({
    where: { id: alunoId },
    include: {
      usuario: { select: { nome: true, email: true, fotoUrl: true } },
      modalidades: { select: { id: true, nome: true } },
      modalidadesPlano: { select: { modalidadeId: true, plataformaExterna: true } },
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
  planoId?: string | null
  diaVencimento?: number
  modalidadeIds: string[]
  cobrancasModalidades?: Array<{
    modalidadeId: string
    plataformaExterna: Plataforma | null
  }>
  responsavel?: {
    nome: string
    cpf?: string | null
    telefone?: string | null
    email?: string | null
    grauParentesco?: string | null
    responsavelFinanceiro?: boolean
  } | null
}

type Cliente = Prisma.TransactionClient | typeof db

export async function migrarMensalidadesAbertasParaPlanoAluno(
  cliente: Cliente,
  params: {
    alunoId: string
    planoAnteriorId: string | null
    planoNovoId: string | null
    planoNovoValor?: Prisma.MensalidadeUncheckedUpdateManyInput["valor"]
  },
) {
  if (params.planoAnteriorId === params.planoNovoId) return 0

  const data: Prisma.MensalidadeUncheckedUpdateManyInput = {
    planoId: params.planoNovoId,
  }
  if (params.planoNovoId && params.planoNovoValor !== undefined) {
    data.valor = params.planoNovoValor
  }

  const resultado = await cliente.mensalidade.updateMany({
    where: {
      alunoId: params.alunoId,
      status: "EM_ABERTO",
    },
    data,
  })

  return resultado.count
}

export async function criarAluno(
  params: { nome: string; email: string; senha: string; autorId: string } & DadosAluno,
) {
  const senhaHash = await gerarHashSenha(params.senha)
  const vinculosCobranca = vinculosCobrancaModalidade({
    planoId: params.planoId ?? null,
    modalidadeIds: params.modalidadeIds,
    cobrancasModalidades: params.cobrancasModalidades,
  })
  return db.$transaction(async (tx) => {
    const usuario = await tx.usuario.create({
      data: {
        nome: params.nome,
        email: params.email,
        senhaHash,
        fotoUrl: params.fotoUrl ?? null,
        dataNascimento: params.dataNascimento ?? null,
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
            planoId: params.planoId ?? null,
            diaVencimento: params.diaVencimento ?? 10,
            modalidades: { connect: params.modalidadeIds.map((id) => ({ id })) },
            ...(vinculosCobranca.length > 0
              ? {
                  modalidadesPlano: {
                    create: vinculosCobranca,
                  },
                }
              : {}),
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
          planoId: usuario.aluno?.planoId,
          modalidadeIds: params.modalidadeIds,
          cobrancasModalidades: vinculosCobranca,
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
  params: Partial<DadosAluno> & { nome?: string; email?: string; autorId: string },
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
      planoId: true,
      plano: { select: { nome: true } },
      diaVencimento: true,
      responsavel: true,
      usuario: { select: { nome: true, email: true, fotoUrl: true } },
      modalidades: { select: { id: true, nome: true } },
      modalidadesPlano: { select: { modalidadeId: true, plataformaExterna: true } },
    },
  })
  if (!atual) return { ok: false as const, motivo: "Aluno não encontrado." }

  const atualizado = await db.$transaction(async (tx) => {
    let mensalidadesAbertasMigradas = 0
    let mensalidadesVencimentoAtualizadas = 0

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
        ...(params.nome !== undefined ||
        params.email !== undefined ||
        params.fotoUrl !== undefined ||
        params.dataNascimento !== undefined
          ? {
              usuario: {
                update: {
                  ...(params.nome !== undefined ? { nome: params.nome } : {}),
                  ...(params.email !== undefined ? { email: params.email } : {}),
                  ...(params.fotoUrl !== undefined ? { fotoUrl: params.fotoUrl } : {}),
                  ...(params.dataNascimento !== undefined
                    ? { dataNascimento: params.dataNascimento }
                    : {}),
                },
              },
            }
          : {}),
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
        ...(params.planoId !== undefined
          ? {
              plano:
                params.planoId === null
                  ? { disconnect: true }
                  : { connect: { id: params.planoId } },
            }
          : {}),
        ...(params.diaVencimento !== undefined ? { diaVencimento: params.diaVencimento } : {}),
        ...(params.modalidadeIds
          ? { modalidades: { set: params.modalidadeIds.map((id) => ({ id })) } }
          : {}),
      },
      include: {
        usuario: { select: { nome: true, email: true, fotoUrl: true } },
        modalidades: { select: { id: true, nome: true } },
        plano: { select: { nome: true, valor: true } },
        responsavel: true,
      },
    })

    if (params.planoId !== undefined) {
      mensalidadesAbertasMigradas = await migrarMensalidadesAbertasParaPlanoAluno(tx, {
        alunoId: atual.id,
        planoAnteriorId: atual.planoId,
        planoNovoId: params.planoId,
        planoNovoValor: aluno.plano?.valor,
      })
    }

    if (params.diaVencimento !== undefined) {
      mensalidadesVencimentoAtualizadas = await atualizarVencimentosMensalidadesAluno(tx, {
        alunoId: atual.id,
        diaVencimentoAnterior: atual.diaVencimento,
        diaVencimentoNovo: params.diaVencimento,
        autorId: params.autorId,
      })
    }

    if (
      params.planoId !== undefined ||
      params.modalidadeIds !== undefined ||
      params.cobrancasModalidades !== undefined
    ) {
      const modalidadeIds =
        params.modalidadeIds ?? atual.modalidades.map((modalidade) => modalidade.id)
      const vinculosCobranca = vinculosCobrancaModalidade({
        planoId: aluno.planoId,
        modalidadeIds,
        cobrancasModalidades:
          params.cobrancasModalidades ??
          atual.modalidadesPlano.map((modalidade) => ({
            modalidadeId: modalidade.modalidadeId,
            plataformaExterna: modalidade.plataformaExterna,
          })),
      })

      await tx.alunoPlanoModalidade.deleteMany({ where: { alunoId: atual.id } })
      if (vinculosCobranca.length > 0) {
        await tx.alunoPlanoModalidade.createMany({
          data: vinculosCobranca.map((vinculo) => ({ alunoId: atual.id, ...vinculo })),
        })
      }
    }

    const valorAntigo = serializarAluno({
      nome: atual.usuario.nome,
      email: atual.usuario.email,
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
      plano: atual.plano?.nome ?? null,
      diaVencimento: atual.diaVencimento,
      modalidades: atual.modalidades.map((modalidade) => modalidade.nome),
      cobrancasModalidades: atual.modalidadesPlano,
      responsavel: atual.responsavel,
    })
    const valorNovo = {
      ...serializarAluno({
        nome: aluno.usuario.nome,
        email: aluno.usuario.email,
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
        plano: aluno.plano?.nome ?? null,
        diaVencimento: aluno.diaVencimento,
        modalidades: aluno.modalidades.map((modalidade) => modalidade.nome),
        cobrancasModalidades:
          params.cobrancasModalidades ??
          atual.modalidadesPlano.map((modalidade) => ({
            modalidadeId: modalidade.modalidadeId,
            plataformaExterna: modalidade.plataformaExterna,
          })),
        responsavel: aluno.responsavel,
      }),
      ...(mensalidadesAbertasMigradas > 0 ? { mensalidadesAbertasMigradas } : {}),
      ...(mensalidadesVencimentoAtualizadas > 0 ? { mensalidadesVencimentoAtualizadas } : {}),
    }

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

  if (
    params.fotoUrl !== undefined &&
    (atual.fotoUrl !== atualizado.fotoUrl || atual.usuario.fotoUrl !== atualizado.usuario.fotoUrl)
  ) {
    await excluirFotosInternasAntigas([atual.fotoUrl, atual.usuario.fotoUrl], atualizado.fotoUrl)
  }

  return { ok: true as const, aluno: atualizado }
}

export async function excluirAluno(params: { alunoId: string; autorId: string }) {
  const aluno = await db.aluno.findUnique({
    where: { id: params.alunoId },
    select: {
      id: true,
      usuario: { select: { id: true, nome: true, email: true, fotoUrl: true } },
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
      plano: { select: { nome: true } },
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
          email: aluno.usuario.email,
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
          plano: aluno.plano?.nome ?? null,
          diaVencimento: aluno.diaVencimento,
          modalidades: aluno.modalidades.map((modalidade) => modalidade.nome),
          responsavel: aluno.responsavel,
        }),
      },
      tx,
    )
  })

  await excluirFotosInternasAntigas([aluno.fotoUrl, aluno.usuario.fotoUrl], null)

  return { ok: true as const, alunoId: aluno.id }
}

function serializarAluno(dados: {
  nome: string
  email: string
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
  plano: string | null
  diaVencimento: number
  modalidades: string[]
  cobrancasModalidades?: Array<{
    modalidadeId: string
    plataformaExterna: Plataforma | null
  }>
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
    email: dados.email,
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
    plano: dados.plano,
    diaVencimento: dados.diaVencimento,
    modalidades: dados.modalidades,
    cobrancasModalidades: dados.cobrancasModalidades,
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

function vinculosCobrancaModalidade(params: {
  planoId: string | null
  modalidadeIds: string[]
  cobrancasModalidades?: Array<{
    modalidadeId: string
    plataformaExterna: Plataforma | null
  }>
}) {
  const modalidadesSelecionadas = new Set(params.modalidadeIds)
  const plataformas = new Map(
    (params.cobrancasModalidades ?? [])
      .filter((cobranca) => modalidadesSelecionadas.has(cobranca.modalidadeId))
      .map((cobranca) => [cobranca.modalidadeId, cobranca.plataformaExterna] as const),
  )

  return params.modalidadeIds
    .map((modalidadeId) => ({
      modalidadeId,
      plataformaExterna: plataformas.get(modalidadeId) ?? null,
    }))
    .filter((vinculo) => params.planoId || vinculo.plataformaExterna)
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

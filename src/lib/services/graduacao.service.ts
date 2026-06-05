import "server-only"
import type { Prisma } from "@prisma/client"
import { db } from "@/lib/db"
import { registrarLog } from "@/lib/services/auditoria.service"
import { criarNotificacao } from "@/lib/services/notificacao.service"

type GraduacaoCriterio = {
  minHoras: number | null
  minTempoNoGrauDias: number | null
}

type GraduacaoOrdenada = { id: string; ordem: number }

type ResultadoRegra = { ok: true } | { ok: false; motivo: string }

export type ResultadoElegibilidade = {
  horasOk: boolean
  tempoOk: boolean
  elegivel: boolean
  horasAtuais: number
  horasMinimas: number | null
  diasNoGrau: number | null
  diasMinimos: number | null
}

export function avaliarElegibilidade(params: {
  graduacao: GraduacaoCriterio
  minutosNaModalidade: number
  concedidaEmAtual?: Date | null
  agora?: Date
}): ResultadoElegibilidade {
  const horasAtuais = Math.floor(params.minutosNaModalidade / 60)
  const horasMinimas = params.graduacao.minHoras
  const horasOk = horasMinimas === null || horasAtuais >= horasMinimas

  const diasMinimos = params.graduacao.minTempoNoGrauDias
  const diasNoGrau =
    params.concedidaEmAtual && diasMinimos !== null
      ? Math.floor(
          ((params.agora ?? new Date()).getTime() - params.concedidaEmAtual.getTime()) / 86_400_000,
        )
      : null
  const tempoOk = diasMinimos === null || (diasNoGrau !== null && diasNoGrau >= diasMinimos)

  return {
    horasOk,
    tempoOk,
    elegivel: horasOk && tempoOk,
    horasAtuais,
    horasMinimas,
    diasNoGrau,
    diasMinimos,
  }
}

export function graduacaoInicial<T extends GraduacaoOrdenada>(catalogo: T[]): T | null {
  return [...catalogo].sort((a, b) => a.ordem - b.ordem)[0] ?? null
}

export function graduacaoAtualEfetiva<T extends GraduacaoOrdenada>(
  catalogo: T[],
  atual?: T | null,
): T | null {
  return atual ?? graduacaoInicial(catalogo)
}

export function proximaGraduacao<T extends GraduacaoOrdenada>(
  catalogo: T[],
  atual?: T | null,
): T | null {
  const atualEfetiva = graduacaoAtualEfetiva(catalogo, atual)
  if (!atualEfetiva) return null

  return (
    [...catalogo]
      .sort((a, b) => a.ordem - b.ordem)
      .find((graduacao) => graduacao.ordem > atualEfetiva.ordem) ?? null
  )
}

export function avaliarInscricaoExame(params: {
  statusAluno: string
  alunoModalidadeIds: string[]
  exameModalidadeId: string
  exameData: Date
  jaInscrito: boolean
  agora?: Date
}): ResultadoRegra {
  if (params.statusAluno !== "ATIVO") {
    return { ok: false, motivo: "Aluno precisa estar ativo para se inscrever em exame." }
  }

  if (!params.alunoModalidadeIds.includes(params.exameModalidadeId)) {
    return { ok: false, motivo: "Exame disponível apenas para alunos da modalidade." }
  }

  if (params.exameData.getTime() < (params.agora ?? new Date()).getTime()) {
    return { ok: false, motivo: "Não é possível se inscrever em exame já realizado." }
  }

  if (params.jaInscrito) {
    return { ok: false, motivo: "Aluno já inscrito neste exame." }
  }

  return { ok: true }
}

export async function criarGraduacaoModalidade(params: {
  modalidadeId: string
  nome: string
  ordem: number
  minHoras?: number | null
  minFrequencia?: number | null
  minTempoNoGrauDias?: number | null
  autorId: string
}) {
  const modalidade = await db.modalidade.findUnique({
    where: { id: params.modalidadeId },
    select: { id: true, nome: true },
  })
  if (!modalidade) return { ok: false as const, motivo: "Modalidade não encontrada." }

  const graduacao = await db.$transaction(async (tx) => {
    const nova = await tx.graduacao.create({
      data: {
        modalidadeId: params.modalidadeId,
        nome: params.nome,
        ordem: params.ordem,
        minHoras: params.minHoras ?? null,
        minFrequencia: params.minFrequencia ?? null,
        minTempoNoGrauDias: params.minTempoNoGrauDias ?? null,
      },
    })

    await registrarLog(
      {
        autorId: params.autorId,
        acao: "GRADUACAO",
        entidade: "Graduacao",
        entidadeId: nova.id,
        valorNovo: {
          modalidadeId: modalidade.id,
          modalidade: modalidade.nome,
          nome: nova.nome,
          ordem: nova.ordem,
          minHoras: nova.minHoras,
          minFrequencia: nova.minFrequencia,
          minTempoNoGrauDias: nova.minTempoNoGrauDias,
        },
      },
      tx,
    )

    return nova
  })

  return { ok: true as const, graduacao }
}

export async function registrarGraduacao(params: {
  alunoId: string
  graduacaoId: string
  professorId: string
  autorId: string
  observacao?: string | null
  anexoUrl?: string | null
}) {
  const [graduacao, professor] = await Promise.all([
    db.graduacao.findUnique({
      where: { id: params.graduacaoId },
      include: {
        modalidade: {
          select: {
            id: true,
            nome: true,
            graduacoes: {
              orderBy: [{ ordem: "asc" }, { nome: "asc" }],
              select: { id: true, nome: true, modalidadeId: true, ordem: true },
            },
          },
        },
      },
    }),
    db.professor.findUnique({
      where: { id: params.professorId },
      select: { modalidades: { select: { id: true } } },
    }),
  ])

  if (!graduacao) return { ok: false as const, motivo: "Graduação não encontrada." }
  if (!professor) return { ok: false as const, motivo: "Professor não encontrado." }

  const habilitado = professor.modalidades.some((m) => m.id === graduacao.modalidadeId)
  if (!habilitado) {
    return { ok: false as const, motivo: "Professor não habilitado nesta modalidade." }
  }

  const atual = await db.graduacaoAluno.findFirst({
    where: {
      alunoId: params.alunoId,
      atual: true,
      graduacao: { modalidadeId: graduacao.modalidadeId },
    },
    include: { graduacao: { select: { id: true, nome: true, modalidadeId: true, ordem: true } } },
  })

  const inicial = graduacaoInicial(graduacao.modalidade.graduacoes)
  const atualEfetiva = graduacaoAtualEfetiva(graduacao.modalidade.graduacoes, atual?.graduacao)
  const graduacaoAnteriorId =
    atual?.graduacaoId ?? (inicial && inicial.id !== params.graduacaoId ? inicial.id : null)

  if (atualEfetiva?.id === params.graduacaoId) {
    return { ok: false as const, motivo: "Aluno já está nesta graduação." }
  }

  const registro = await db.$transaction(async (tx) => {
    await tx.graduacaoAluno.updateMany({
      where: {
        alunoId: params.alunoId,
        atual: true,
        graduacao: { modalidadeId: graduacao.modalidadeId },
      },
      data: { atual: false },
    })

    const novo = await tx.graduacaoAluno.create({
      data: {
        alunoId: params.alunoId,
        graduacaoId: params.graduacaoId,
        graduacaoAnteriorId,
        concedidaPorId: params.professorId,
        observacao: params.observacao ?? null,
        anexoUrl: params.anexoUrl ?? null,
      },
      include: {
        graduacao: { include: { modalidade: true } },
        aluno: { include: { usuario: true } },
      },
    })

    await registrarLog(
      {
        autorId: params.autorId,
        acao: "GRADUACAO",
        entidade: "GraduacaoAluno",
        entidadeId: novo.id,
        valorAntigo: atual
          ? ({
              graduacaoId: atual.graduacaoId,
              nome: atual.graduacao.nome,
              modalidadeId: atual.graduacao.modalidadeId,
            } satisfies Prisma.InputJsonObject)
          : inicial && inicial.id !== params.graduacaoId
            ? ({
                graduacaoId: inicial.id,
                nome: inicial.nome,
                modalidadeId: inicial.modalidadeId,
                presumida: true,
              } satisfies Prisma.InputJsonObject)
            : undefined,
        valorNovo: {
          alunoId: params.alunoId,
          graduacaoId: params.graduacaoId,
          graduacao: graduacao.nome,
          modalidade: graduacao.modalidade.nome,
        },
        justificativa: params.observacao ?? null,
      },
      tx,
    )

    await criarNotificacao(tx, {
      usuarioId: novo.aluno.usuarioId,
      tipo: "GRADUACAO",
      titulo: "Graduação registrada",
      mensagem: `${novo.graduacao.nome} em ${novo.graduacao.modalidade.nome}.`,
    })

    return novo
  })

  return { ok: true as const, registro }
}

export async function criarExameGraduacao(params: {
  modalidadeId: string
  professorId: string
  autorId: string
  data: Date
  descricao?: string | null
  taxa?: number | null
}) {
  const professor = await db.professor.findUnique({
    where: { id: params.professorId },
    select: {
      usuario: { select: { nome: true } },
      modalidades: { select: { id: true, nome: true } },
    },
  })
  if (!professor) return { ok: false as const, motivo: "Professor não encontrado." }
  const modalidade = professor.modalidades.find((m) => m.id === params.modalidadeId)
  if (!modalidade) {
    return { ok: false as const, motivo: "Professor não habilitado nesta modalidade." }
  }

  const exame = await db.$transaction(async (tx) => {
    const criado = await tx.exame.create({
      data: {
        modalidadeId: params.modalidadeId,
        professorId: params.professorId,
        data: params.data,
        descricao: params.descricao ?? null,
        taxa: params.taxa ?? null,
      },
    })

    await registrarLog(
      {
        autorId: params.autorId,
        acao: "GRADUACAO",
        entidade: "Exame",
        entidadeId: criado.id,
        valorNovo: {
          modalidadeId: params.modalidadeId,
          modalidade: modalidade.nome,
          professorId: params.professorId,
          professor: professor.usuario.nome,
          data: criado.data.toISOString(),
          taxa: criado.taxa ? Number(criado.taxa) : null,
        },
        justificativa: params.descricao ?? null,
      },
      tx,
    )

    return criado
  })

  return { ok: true as const, exame }
}

export async function inscreverAlunoExame(params: { alunoId: string; exameId: string }) {
  const [aluno, exame] = await Promise.all([
    db.aluno.findUnique({
      where: { id: params.alunoId },
      select: {
        id: true,
        status: true,
        usuarioId: true,
        modalidades: { select: { id: true } },
      },
    }),
    db.exame.findUnique({
      where: { id: params.exameId },
      include: {
        modalidade: { select: { id: true, nome: true } },
        inscricoes: {
          where: { alunoId: params.alunoId },
          select: { id: true },
        },
      },
    }),
  ])

  if (!aluno) return { ok: false as const, motivo: "Aluno não encontrado." }
  if (!exame) return { ok: false as const, motivo: "Exame não encontrado." }

  const regra = avaliarInscricaoExame({
    statusAluno: aluno.status,
    alunoModalidadeIds: aluno.modalidades.map((modalidade) => modalidade.id),
    exameModalidadeId: exame.modalidadeId,
    exameData: exame.data,
    jaInscrito: exame.inscricoes.length > 0,
  })
  if (!regra.ok) return { ok: false as const, motivo: regra.motivo }

  const inscricao = await db.$transaction(async (tx) => {
    const nova = await tx.inscricaoExame.create({
      data: {
        exameId: params.exameId,
        alunoId: params.alunoId,
      },
    })

    await criarNotificacao(tx, {
      usuarioId: aluno.usuarioId,
      tipo: "GRADUACAO",
      titulo: "Inscrição em exame confirmada",
      mensagem: `Exame de ${exame.modalidade.nome}.`,
    })

    return nova
  })

  return { ok: true as const, inscricao }
}

export async function registrarResultadoExame(params: {
  inscricaoExameId: string
  professorId: string
  autorId: string
  aprovado: boolean | null
  novaGraduacaoId?: string | null
  resultado?: string | null
}) {
  const inscricao = await db.inscricaoExame.findUnique({
    where: { id: params.inscricaoExameId },
    include: {
      aluno: { include: { usuario: { select: { id: true, nome: true } } } },
      exame: {
        include: {
          modalidade: { select: { id: true, nome: true } },
        },
      },
    },
  })

  if (!inscricao) return { ok: false as const, motivo: "Inscrição não encontrada." }
  if (inscricao.exame.professorId !== params.professorId) {
    return { ok: false as const, motivo: "Você não é responsável por este exame." }
  }
  if (params.novaGraduacaoId && params.aprovado !== true) {
    return {
      ok: false as const,
      motivo: "Informe nova graduação apenas para resultado aprovado.",
    }
  }

  const [novaGraduacao, atual] = await Promise.all([
    params.novaGraduacaoId
      ? db.graduacao.findUnique({
          where: { id: params.novaGraduacaoId },
          include: {
            modalidade: {
              select: {
                id: true,
                nome: true,
                graduacoes: {
                  orderBy: [{ ordem: "asc" }, { nome: "asc" }],
                  select: { id: true, nome: true, modalidadeId: true, ordem: true },
                },
              },
            },
          },
        })
      : null,
    db.graduacaoAluno.findFirst({
      where: {
        alunoId: inscricao.alunoId,
        atual: true,
        graduacao: { modalidadeId: inscricao.exame.modalidadeId },
      },
      include: { graduacao: { select: { id: true, nome: true, modalidadeId: true, ordem: true } } },
    }),
  ])
  if (params.novaGraduacaoId && !novaGraduacao) {
    return { ok: false as const, motivo: "Nova graduação não encontrada." }
  }
  if (novaGraduacao && novaGraduacao.modalidadeId !== inscricao.exame.modalidadeId) {
    return { ok: false as const, motivo: "Graduação fora da modalidade do exame." }
  }

  const inicial = novaGraduacao ? graduacaoInicial(novaGraduacao.modalidade.graduacoes) : null
  const atualEfetiva = novaGraduacao
    ? graduacaoAtualEfetiva(novaGraduacao.modalidade.graduacoes, atual?.graduacao)
    : null
  const graduacaoAnteriorId =
    atual?.graduacaoId ?? (inicial && inicial.id !== params.novaGraduacaoId ? inicial.id : null)

  const atualizado = await db.$transaction(async (tx) => {
    const novo = await tx.inscricaoExame.update({
      where: { id: params.inscricaoExameId },
      data: {
        aprovado: params.aprovado,
        resultado: params.resultado ?? null,
        novaGraduacaoId: params.aprovado ? (params.novaGraduacaoId ?? null) : null,
      },
    })

    if (params.aprovado && novaGraduacao && atualEfetiva?.id !== novaGraduacao.id) {
      await tx.graduacaoAluno.updateMany({
        where: {
          alunoId: inscricao.alunoId,
          atual: true,
          graduacao: { modalidadeId: novaGraduacao.modalidadeId },
        },
        data: { atual: false },
      })

      const graduacaoAluno = await tx.graduacaoAluno.create({
        data: {
          alunoId: inscricao.alunoId,
          graduacaoId: novaGraduacao.id,
          graduacaoAnteriorId,
          concedidaPorId: params.professorId,
          observacao: params.resultado ?? "Resultado de exame de graduação",
        },
      })

      await registrarLog(
        {
          autorId: params.autorId,
          acao: "GRADUACAO",
          entidade: "GraduacaoAluno",
          entidadeId: graduacaoAluno.id,
          valorAntigo: atual
            ? ({
                graduacaoId: atual.graduacaoId,
                nome: atual.graduacao.nome,
                modalidadeId: atual.graduacao.modalidadeId,
              } satisfies Prisma.InputJsonObject)
            : inicial && inicial.id !== novaGraduacao.id
              ? ({
                  graduacaoId: inicial.id,
                  nome: inicial.nome,
                  modalidadeId: inicial.modalidadeId,
                  presumida: true,
                } satisfies Prisma.InputJsonObject)
              : undefined,
          valorNovo: {
            alunoId: inscricao.alunoId,
            aluno: inscricao.aluno.usuario.nome,
            graduacaoId: novaGraduacao.id,
            graduacao: novaGraduacao.nome,
            modalidade: novaGraduacao.modalidade.nome,
            origem: "EXAME",
            inscricaoExameId: inscricao.id,
          },
          justificativa: params.resultado ?? null,
        },
        tx,
      )
    }

    await registrarLog(
      {
        autorId: params.autorId,
        acao: "GRADUACAO",
        entidade: "InscricaoExame",
        entidadeId: novo.id,
        valorAntigo: {
          aprovado: inscricao.aprovado,
          resultado: inscricao.resultado,
          novaGraduacaoId: inscricao.novaGraduacaoId,
        },
        valorNovo: {
          aprovado: novo.aprovado,
          resultado: novo.resultado,
          novaGraduacaoId: novo.novaGraduacaoId,
          alunoId: inscricao.alunoId,
          exameId: inscricao.exameId,
        },
        justificativa: params.resultado ?? null,
      },
      tx,
    )

    await criarNotificacao(tx, {
      usuarioId: inscricao.aluno.usuario.id,
      tipo: "GRADUACAO",
      titulo: "Resultado de exame registrado",
      mensagem: `${inscricao.exame.modalidade.nome}: ${
        params.aprovado === null
          ? "resultado em revisão"
          : params.aprovado
            ? `aprovado${novaGraduacao ? ` para ${novaGraduacao.nome}` : ""}`
            : "não aprovado"
      }.`,
    })

    return novo
  })

  return { ok: true as const, inscricao: atualizado }
}

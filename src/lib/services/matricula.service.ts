import "server-only"
import { Prisma } from "@prisma/client"
import { gerarHashSenha } from "@/lib/auth/senha"
import { db } from "@/lib/db"
import { registrarLog } from "@/lib/services/auditoria.service"
import { registrarMensalidadeInicialPagaAsaas } from "@/lib/services/financeiro.service"
import { criarNotificacao, enviarPushParaNotificacoes } from "@/lib/services/notificacao.service"
import type {
  AprovacaoMatriculaInput,
  RejeicaoMatriculaInput,
  SolicitacaoMatriculaInput,
} from "@/lib/validations/matricula"

type DadosComprovante = {
  url: string
  contentType: string
  nomeOriginal: string
}

type ClienteMatricula = Prisma.TransactionClient

const ROTULO_TIPO_PAGAMENTO = {
  MENSALISTA: "mensalista",
  WELLHUB: "Wellhub",
  TOTALPASS: "TotalPass",
} as const

async function notificarGestoresSobreMatricula(
  cliente: ClienteMatricula,
  params: { titulo: string; mensagem: string },
) {
  const gestores = await cliente.usuario.findMany({
    where: { papel: "GESTOR", ativo: true },
    select: { id: true },
  })

  const notificacoes = []
  for (const gestor of gestores) {
    const notificacao = await criarNotificacao(
      cliente,
      {
        usuarioId: gestor.id,
        tipo: "MATRICULA",
        ...params,
      },
      { enviarPush: false },
    )
    if (notificacao) notificacoes.push(notificacao)
  }

  return notificacoes
}

export function listarOpcoesPublicasMatricula() {
  return db.modalidade.findMany({
    where: { ativa: true },
    orderBy: { nome: "asc" },
    select: {
      id: true,
      nome: true,
      descricao: true,
      turmas: {
        where: {
          ativa: true,
          ehEvento: false,
          horaInicio: { not: null },
          horaFim: { not: null },
        },
        orderBy: [{ horaInicio: "asc" }, { criadoEm: "asc" }],
        select: {
          id: true,
          nome: true,
          diaSemana: true,
          diasSemana: true,
          horaInicio: true,
          horaFim: true,
          local: true,
          nivel: true,
          professor: { select: { usuario: { select: { nome: true } } } },
        },
      },
    },
  })
}

export async function solicitarMatricula(
  params: SolicitacaoMatriculaInput & { comprovante?: DadosComprovante | null },
) {
  if (params.tipoPagamento !== "MENSALISTA" && params.comprovante) {
    return {
      ok: false as const,
      motivo: "Matrículas Wellhub e TotalPass não recebem comprovante de pagamento.",
    }
  }
  const existente = await db.usuario.findUnique({
    where: { email: params.email },
    select: { id: true },
  })
  if (existente) {
    return { ok: false as const, motivo: "Este e-mail já possui cadastro. Use a tela de acesso." }
  }

  const senhaHash = await gerarHashSenha(params.senha)

  try {
    const resultadoTransacao = await db.$transaction(async (tx) => {
      const modalidade = await tx.modalidade.findFirst({
        where: { id: params.modalidadeId, ativa: true },
        select: { id: true, nome: true },
      })
      if (!modalidade) throw new ErroMatricula("A modalidade selecionada não está disponível.")
      const plano =
        params.tipoPagamento === "MENSALISTA"
          ? await tx.plano.findFirst({
              where: { padrao: true, ativo: true, periodicidade: "MENSAL" },
              select: { id: true, nome: true, valor: true },
            })
          : null
      if (params.tipoPagamento === "MENSALISTA" && !plano) {
        throw new ErroMatricula("O plano padrão de matrícula não está configurado.")
      }

      const criada = await tx.solicitacaoMatricula.create({
        data: {
          nome: params.nome,
          email: params.email,
          senhaHash,
          cpf: params.cpf,
          telefone: params.telefone,
          dataNascimento: params.dataNascimento,
          endereco: params.endereco,
          contatoEmergencia: params.contatoEmergencia,
          restricoesMedicas: params.restricoesMedicas,
          tipoPagamento: params.tipoPagamento,
          beneficioAtivoDeclarado: params.beneficioAtivoDeclarado,
          modalidadeId: modalidade.id,
          planoId: plano?.id ?? null,
          comprovantePagamentoUrl: params.comprovante?.url ?? null,
          comprovanteContentType: params.comprovante?.contentType ?? null,
          comprovanteNomeOriginal: params.comprovante?.nomeOriginal ?? null,
        },
      })

      await registrarLog(
        {
          autorId: null,
          acao: "MATRICULA_SOLICITADA",
          entidade: "SolicitacaoMatricula",
          entidadeId: criada.id,
          valorNovo: {
            modalidadeId: modalidade.id,
            modalidadeNome: modalidade.nome,
            tipoPagamento: params.tipoPagamento,
            beneficioAtivoDeclarado: params.beneficioAtivoDeclarado,
            comprovanteInformado: Boolean(params.comprovante),
            planoId: plano?.id ?? null,
            planoNome: plano?.nome ?? null,
            valorPlano: plano ? Number(plano.valor) : null,
          },
        },
        tx,
      )

      const notificacoes = await notificarGestoresSobreMatricula(tx, {
        titulo: "Matrícula aguardando análise",
        mensagem: `${params.nome} solicitou matrícula em ${modalidade.nome}. Tipo de pagamento: ${ROTULO_TIPO_PAGAMENTO[params.tipoPagamento]}.`,
      })

      return { solicitacao: criada, notificacoes }
    })

    await enviarPushParaNotificacoes(resultadoTransacao.notificacoes)

    return { ok: true as const, solicitacao: resultadoTransacao.solicitacao }
  } catch (erro) {
    if (erro instanceof ErroMatricula) return { ok: false as const, motivo: erro.message }
    if (erro instanceof Prisma.PrismaClientKnownRequestError && erro.code === "P2002") {
      return {
        ok: false as const,
        motivo: "Já existe uma matrícula ou cadastro com este e-mail ou CPF.",
      }
    }
    throw erro
  }
}

export function listarMatriculasPendentes() {
  return db.solicitacaoMatricula.findMany({
    where: {
      status: "PENDENTE",
      OR: [
        {
          tipoPagamento: { in: ["WELLHUB", "TOTALPASS"] },
          beneficioAtivoDeclarado: true,
        },
        { tipoPagamento: "MENSALISTA", cobrancasAsaas: { some: { status: "RECEBIDA" } } },
      ],
    },
    orderBy: { criadoEm: "asc" },
    select: {
      id: true,
      nome: true,
      email: true,
      cpf: true,
      telefone: true,
      dataNascimento: true,
      endereco: true,
      contatoEmergencia: true,
      restricoesMedicas: true,
      tipoPagamento: true,
      beneficioAtivoDeclarado: true,
      comprovantePagamentoUrl: true,
      comprovanteContentType: true,
      comprovanteNomeOriginal: true,
      criadoEm: true,
      plano: { select: { id: true, nome: true, valor: true, periodicidade: true } },
      cobrancasAsaas: {
        where: { status: "RECEBIDA" },
        orderBy: { recebidaEmAsaas: "desc" },
        take: 1,
        select: {
          id: true,
          asaasPaymentId: true,
          asaasCustomerId: true,
          externalReference: true,
          competencia: true,
          valor: true,
          vencimentoAsaas: true,
          pixCopiaECola: true,
          qrCodeExpiraEm: true,
          invoiceUrl: true,
          statusAsaas: true,
          recebidaEmAsaas: true,
        },
      },
      modalidade: { select: { id: true, nome: true } },
    },
  })
}

export async function aprovarMatricula(
  params: AprovacaoMatriculaInput & { autorId: string; agora?: Date },
) {
  const agora = params.agora ?? new Date()
  try {
    const resultado = await db.$transaction(async (tx) => {
      const solicitacao = await tx.solicitacaoMatricula.findUnique({
        where: { id: params.solicitacaoId },
        include: {
          modalidade: { select: { id: true, nome: true, ativa: true } },
          plano: true,
          cobrancasAsaas: {
            orderBy: { recebidaEmAsaas: "desc" },
          },
        },
      })
      if (solicitacao?.status !== "PENDENTE") {
        return { ok: false as const, motivo: "Esta matrícula já foi analisada ou não existe." }
      }
      if (!solicitacao.senhaHash) {
        return { ok: false as const, motivo: "Esta solicitação não possui credenciais válidas." }
      }
      if (!solicitacao.modalidade.ativa) {
        return { ok: false as const, motivo: "A modalidade solicitada está inativa." }
      }
      const mensalista = solicitacao.tipoPagamento === "MENSALISTA"
      const plataformaExterna =
        solicitacao.tipoPagamento === "WELLHUB"
          ? "WELLHUB"
          : solicitacao.tipoPagamento === "TOTALPASS"
            ? "TOTALPASS"
            : null
      const plano = solicitacao.plano
      const cobrancaMatricula = solicitacao.cobrancasAsaas.find(
        (cobranca) => cobranca.status === "RECEBIDA",
      )
      if (mensalista) {
        if (!plano) {
          return { ok: false as const, motivo: "O plano da solicitação não está disponível." }
        }
        if (!params.diaVencimento) {
          return { ok: false as const, motivo: "Informe o dia de vencimento." }
        }
        if (
          !cobrancaMatricula?.recebidaEmAsaas ||
          !cobrancaMatricula.asaasPaymentId ||
          !cobrancaMatricula.asaasCustomerId
        ) {
          return {
            ok: false as const,
            motivo: "A primeira mensalidade ainda não foi confirmada pelo Asaas.",
          }
        }
      } else {
        if (!solicitacao.beneficioAtivoDeclarado) {
          return {
            ok: false as const,
            motivo: "A declaração de benefício ativo não foi confirmada.",
          }
        }
        if (plano || solicitacao.cobrancasAsaas.length > 0) {
          return {
            ok: false as const,
            motivo: "A solicitação externa possui uma configuração financeira inconsistente.",
          }
        }
      }

      const reservada = await tx.solicitacaoMatricula.updateMany({
        where: { id: solicitacao.id, status: "PENDENTE" },
        data: { status: "APROVADA" },
      })
      if (reservada.count !== 1) {
        return { ok: false as const, motivo: "Esta matrícula acabou de ser analisada." }
      }

      const usuario = await tx.usuario.create({
        data: {
          nome: solicitacao.nome,
          email: solicitacao.email,
          senhaHash: solicitacao.senhaHash,
          dataNascimento: solicitacao.dataNascimento,
          papel: "ALUNO",
          aluno: {
            create: {
              tipo: solicitacao.tipoPagamento,
              status: "ATIVO",
              cpf: solicitacao.cpf,
              telefone: solicitacao.telefone,
              dataNascimento: solicitacao.dataNascimento,
              endereco: solicitacao.endereco,
              dataInicio: agora,
              contatoEmergencia: solicitacao.contatoEmergencia,
              restricoesMedicas: solicitacao.restricoesMedicas,
              planoId: plano?.id ?? null,
              ...(mensalista ? { diaVencimento: params.diaVencimento } : {}),
              modalidades: { connect: { id: solicitacao.modalidade.id } },
              modalidadesPlano: {
                create: {
                  modalidadeId: solicitacao.modalidade.id,
                  plataformaExterna,
                },
              },
            },
          },
        },
        include: { aluno: true },
      })
      if (!usuario.aluno) throw new ErroMatricula("Não foi possível criar o aluno.")

      if (mensalista && plano && cobrancaMatricula) {
        const mensalidade = await registrarMensalidadeInicialPagaAsaas(tx, {
          alunoId: usuario.aluno.id,
          competencia: cobrancaMatricula.competencia,
          valor: cobrancaMatricula.valor,
          pagoEm: cobrancaMatricula.recebidaEmAsaas!,
          autorId: params.autorId,
          agora,
        })
        if (!mensalidade.ok) throw new ErroMatricula(mensalidade.motivo)

        await tx.clienteAsaas.create({
          data: {
            alunoId: usuario.aluno.id,
            asaasCustomerId: cobrancaMatricula.asaasCustomerId!,
            tipoPagador: "ALUNO",
          },
        })
        const cobrancaCanonica = await tx.cobrancaAsaas.create({
          data: {
            mensalidadeId: mensalidade.mensalidade.id,
            tipo: "PIX_MENSAL",
            status: "RECEBIDA",
            ativa: true,
            asaasPaymentId: cobrancaMatricula.asaasPaymentId!,
            externalReference: cobrancaMatricula.externalReference,
            vencimentoAsaas: cobrancaMatricula.vencimentoAsaas,
            statusAsaas: cobrancaMatricula.statusAsaas,
            pixCopiaECola: cobrancaMatricula.pixCopiaECola,
            qrCodeExpiraEm: cobrancaMatricula.qrCodeExpiraEm,
            invoiceUrl: cobrancaMatricula.invoiceUrl,
            ultimoEventoAsaas: cobrancaMatricula.ultimoEventoAsaas,
            recebidaEmAsaas: cobrancaMatricula.recebidaEmAsaas,
          },
        })
        await tx.mensalidade.update({
          where: { id: mensalidade.mensalidade.id },
          data: { cobrancaQuitacaoAsaasId: cobrancaCanonica.id },
        })
        await tx.cobrancaMatriculaAsaas.update({
          where: { id: cobrancaMatricula.id },
          data: { mensalidadeId: mensalidade.mensalidade.id, ativa: false },
        })
      }

      await tx.solicitacaoMatricula.update({
        where: { id: solicitacao.id },
        data: {
          status: "APROVADA",
          alunoId: usuario.aluno.id,
          planoAprovadoId: plano?.id ?? null,
          analisadoPorId: params.autorId,
          analisadoEm: agora,
          senhaHash: null,
        },
      })

      await registrarLog(
        {
          autorId: params.autorId,
          acao: "ALUNO_CRIADO",
          entidade: "Aluno",
          entidadeId: usuario.aluno.id,
          valorNovo: {
            origem: "SOLICITACAO_MATRICULA",
            usuarioId: usuario.id,
            tipo: solicitacao.tipoPagamento,
            status: "ATIVO",
            planoId: plano?.id ?? null,
            modalidadeIds: [solicitacao.modalidade.id],
            plataformaExterna,
          },
        },
        tx,
      )
      await registrarLog(
        {
          autorId: params.autorId,
          acao: "MATRICULA_APROVADA",
          entidade: "SolicitacaoMatricula",
          entidadeId: solicitacao.id,
          valorAntigo: { status: "PENDENTE" },
          valorNovo: {
            status: "APROVADA",
            alunoId: usuario.aluno.id,
            tipoPagamento: solicitacao.tipoPagamento,
            beneficioAtivoDeclarado: solicitacao.beneficioAtivoDeclarado,
            planoId: plano?.id ?? null,
            modalidadeId: solicitacao.modalidade.id,
            diaVencimento: mensalista ? params.diaVencimento : null,
            pagamentoAsaasConfirmado: mensalista,
            pagamentoDispensado: !mensalista,
            origemFinanceira: mensalista ? "ECVO" : solicitacao.tipoPagamento,
            asaasPaymentId: cobrancaMatricula?.asaasPaymentId ?? null,
            comprovanteInformado: Boolean(solicitacao.comprovantePagamentoUrl),
          },
        },
        tx,
      )

      const notificacoes = await notificarGestoresSobreMatricula(tx, {
        titulo: "Matrícula aprovada",
        mensagem: `A matrícula de ${solicitacao.nome} em ${solicitacao.modalidade.nome} está concluída. O acesso ao sistema está liberado.`,
      })

      return { ok: true as const, alunoId: usuario.aluno.id, notificacoes }
    })
    if (!resultado.ok) return resultado

    await enviarPushParaNotificacoes(resultado.notificacoes)
    return { ok: true as const, alunoId: resultado.alunoId }
  } catch (erro) {
    if (erro instanceof ErroMatricula) return { ok: false as const, motivo: erro.message }
    if (erro instanceof Prisma.PrismaClientKnownRequestError && erro.code === "P2002") {
      return {
        ok: false as const,
        motivo: "Já existe um aluno com o e-mail ou CPF desta solicitação.",
      }
    }
    throw erro
  }
}

export async function rejeitarMatricula(
  params: RejeicaoMatriculaInput & { autorId: string; agora?: Date },
) {
  const agora = params.agora ?? new Date()

  return db.$transaction(async (tx) => {
    const solicitacao = await tx.solicitacaoMatricula.findUnique({
      where: { id: params.solicitacaoId },
      select: {
        id: true,
        nome: true,
        status: true,
        tipoPagamento: true,
        cobrancasAsaas: {
          where: { status: "RECEBIDA" },
          select: { id: true },
          take: 1,
        },
      },
    })
    if (solicitacao?.status !== "PENDENTE") {
      return { ok: false as const, motivo: "Esta matrícula já foi analisada ou não existe." }
    }
    if (solicitacao.tipoPagamento === "MENSALISTA" && solicitacao.cobrancasAsaas.length > 0) {
      return {
        ok: false as const,
        motivo:
          "Esta matrícula possui pagamento confirmado. Concilie o pagamento antes de rejeitar a solicitação.",
      }
    }

    const rejeitada = await tx.solicitacaoMatricula.updateMany({
      where: { id: solicitacao.id, status: "PENDENTE" },
      data: {
        status: "REJEITADA",
        justificativa: params.justificativa,
        analisadoPorId: params.autorId,
        analisadoEm: agora,
        senhaHash: null,
      },
    })
    if (rejeitada.count !== 1) {
      return { ok: false as const, motivo: "Esta matrícula acabou de ser analisada." }
    }

    await registrarLog(
      {
        autorId: params.autorId,
        acao: "MATRICULA_REJEITADA",
        entidade: "SolicitacaoMatricula",
        entidadeId: solicitacao.id,
        valorAntigo: { status: "PENDENTE" },
        valorNovo: { status: "REJEITADA", tipoPagamento: solicitacao.tipoPagamento },
        justificativa: params.justificativa,
      },
      tx,
    )

    return { ok: true as const }
  })
}

class ErroMatricula extends Error {}

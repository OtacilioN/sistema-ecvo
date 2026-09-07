import "server-only"
import { Prisma } from "@prisma/client"
import {
  planoCompativelComAulaAvulsa,
  VALOR_AULA_AVULSA,
  VALOR_COMPLEMENTO_AULA_AVULSA,
  VALOR_MENSALIDADE_AULA_AVULSA,
} from "@/lib/aula-avulsa"
import { gerarHashSenha } from "@/lib/auth/senha"
import { db } from "@/lib/db"
import { registrarLog } from "@/lib/services/auditoria.service"
import { registrarMensalidadeInicialPagaAsaas } from "@/lib/services/financeiro.service"
import { criarNotificacao, enviarPushParaNotificacoes } from "@/lib/services/notificacao.service"
import { fimExclusivoDaSemanaAcademia, formatarDataHora } from "@/lib/utils/datas"
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
  AULA_AVULSA: "aula avulsa",
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
  const agora = new Date()
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
          aulas: {
            where: { cancelada: false, inicio: { gt: agora } },
            orderBy: { inicio: "asc" },
            take: 24,
            select: { id: true, inicio: true, fim: true },
          },
        },
      },
    },
  })
}

export async function solicitarMatricula(
  params: SolicitacaoMatriculaInput & { comprovante?: DadosComprovante | null },
) {
  const agora = new Date()
  if (params.tipoPagamento !== "MENSALISTA" && params.comprovante) {
    return {
      ok: false as const,
      motivo: "Este tipo de matrícula não recebe comprovante de pagamento.",
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
      const modalidadesEncontradas = await tx.modalidade.findMany({
        where: { id: { in: params.modalidadeIds }, ativa: true },
        select: { id: true, nome: true },
      })
      if (modalidadesEncontradas.length !== params.modalidadeIds.length) {
        throw new ErroMatricula("Uma das modalidades selecionadas não está disponível.")
      }
      const modalidadesPorId = new Map(
        modalidadesEncontradas.map((modalidade) => [modalidade.id, modalidade]),
      )
      const modalidades = params.modalidadeIds.map((id) => modalidadesPorId.get(id)!)
      const modalidadePrincipal = modalidades[0]
      if (!modalidadePrincipal) {
        throw new ErroMatricula("Selecione ao menos uma modalidade.")
      }
      const aulaAvulsa =
        params.tipoPagamento === "AULA_AVULSA"
          ? await tx.aula.findFirst({
              where: {
                id: params.aulaAvulsaId ?? "",
                cancelada: false,
                inicio: { gt: agora },
                turma: {
                  ativa: true,
                  ehEvento: false,
                  modalidadeId: modalidadePrincipal.id,
                  modalidade: { ativa: true },
                },
              },
              select: {
                id: true,
                inicio: true,
                fim: true,
                turma: { select: { nome: true, local: true, capacidade: true } },
              },
            })
          : null
      if (params.tipoPagamento === "AULA_AVULSA" && !aulaAvulsa) {
        throw new ErroMatricula(
          "A aula escolhida não está mais disponível para esta modalidade. Escolha outro horário.",
        )
      }
      const exigePlano =
        params.tipoPagamento === "MENSALISTA" || params.tipoPagamento === "AULA_AVULSA"
      const plano =
        params.tipoPagamento === "MENSALISTA"
          ? await tx.plano.findFirst({
              where: {
                quantidadeModalidadesMatricula: modalidades.length,
                ativo: true,
                periodicidade: "MENSAL",
              },
              select: {
                id: true,
                nome: true,
                valor: true,
                quantidadeModalidadesMatricula: true,
              },
            })
          : params.tipoPagamento === "AULA_AVULSA"
            ? await tx.plano.findFirst({
                where: { padrao: true, ativo: true, periodicidade: "MENSAL" },
                select: {
                  id: true,
                  nome: true,
                  valor: true,
                  quantidadeModalidadesMatricula: true,
                },
              })
            : null
      if (exigePlano && !plano) {
        throw new ErroMatricula(
          params.tipoPagamento === "MENSALISTA"
            ? `O plano para ${modalidades.length} ${modalidades.length === 1 ? "modalidade" : "modalidades"} não está configurado.`
            : "O plano padrão de matrícula não está configurado.",
        )
      }
      if (
        params.tipoPagamento === "AULA_AVULSA" &&
        plano &&
        !planoCompativelComAulaAvulsa(Number(plano.valor))
      ) {
        throw new ErroMatricula(
          "A aula avulsa está indisponível porque o plano mensal padrão não está em R$ 100,00.",
        )
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
          aulaAvulsaId: aulaAvulsa?.id ?? null,
          modalidadePrincipalId: modalidadePrincipal.id,
          modalidades: {
            create: modalidades.map((modalidade) => ({ modalidadeId: modalidade.id })),
          },
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
            modalidadeIds: modalidades.map((modalidade) => modalidade.id),
            modalidadeNomes: modalidades.map((modalidade) => modalidade.nome),
            quantidadeModalidades: modalidades.length,
            tipoPagamento: params.tipoPagamento,
            beneficioAtivoDeclarado: params.beneficioAtivoDeclarado,
            comprovanteInformado: Boolean(params.comprovante),
            planoId: plano?.id ?? null,
            planoNome: plano?.nome ?? null,
            valorPlano: plano ? Number(plano.valor) : null,
            aulaAvulsaId: aulaAvulsa?.id ?? null,
            aulaAvulsaInicio: aulaAvulsa?.inicio.toISOString() ?? null,
            valorAulaAvulsa: params.tipoPagamento === "AULA_AVULSA" ? VALOR_AULA_AVULSA : null,
          },
        },
        tx,
      )

      const notificacoes = await notificarGestoresSobreMatricula(tx, {
        titulo: "Matrícula aguardando análise",
        mensagem: `${params.nome} solicitou matrícula em ${modalidades.map((modalidade) => modalidade.nome).join(", ")}. Tipo de pagamento: ${ROTULO_TIPO_PAGAMENTO[params.tipoPagamento]}.`,
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
        { tipoPagamento: "AULA_AVULSA", cobrancasAsaas: { some: { status: "RECEBIDA" } } },
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
      aulaAvulsa: {
        select: {
          id: true,
          inicio: true,
          fim: true,
          turma: { select: { nome: true, local: true } },
        },
      },
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
      modalidadePrincipal: { select: { id: true, nome: true } },
      modalidades: {
        orderBy: { criadoEm: "asc" },
        select: { modalidade: { select: { id: true, nome: true } } },
      },
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
          modalidadePrincipal: { select: { id: true, nome: true, ativa: true } },
          modalidades: {
            orderBy: { criadoEm: "asc" },
            select: { modalidade: { select: { id: true, nome: true, ativa: true } } },
          },
          aulaAvulsa: {
            select: {
              id: true,
              inicio: true,
              fim: true,
              cancelada: true,
              turma: {
                select: { ativa: true, ehEvento: true, modalidadeId: true, capacidade: true },
              },
            },
          },
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
      const modalidades =
        solicitacao.modalidades.length > 0
          ? solicitacao.modalidades.map((vinculo) => vinculo.modalidade)
          : [solicitacao.modalidadePrincipal]
      if (modalidades.some((modalidade) => !modalidade.ativa)) {
        return { ok: false as const, motivo: "Uma das modalidades solicitadas está inativa." }
      }
      const mensalista = solicitacao.tipoPagamento === "MENSALISTA"
      const aulaAvulsa = solicitacao.tipoPagamento === "AULA_AVULSA"
      const externo =
        solicitacao.tipoPagamento === "WELLHUB" || solicitacao.tipoPagamento === "TOTALPASS"
      const tipoAluno = mensalista
        ? "MENSALISTA"
        : aulaAvulsa
          ? "AVULSO"
          : solicitacao.tipoPagamento === "WELLHUB"
            ? "WELLHUB"
            : "TOTALPASS"
      const plataformaExterna =
        solicitacao.tipoPagamento === "WELLHUB"
          ? "WELLHUB"
          : solicitacao.tipoPagamento === "TOTALPASS"
            ? "TOTALPASS"
            : null
      const plano = solicitacao.plano
      const finalidadeEsperada = aulaAvulsa ? "AULA_AVULSA" : "PRIMEIRA_MENSALIDADE"
      const cobrancaMatricula = solicitacao.cobrancasAsaas.find(
        (cobranca) => cobranca.status === "RECEBIDA" && cobranca.finalidade === finalidadeEsperada,
      )
      if (mensalista) {
        if (!plano) {
          return { ok: false as const, motivo: "O plano da solicitação não está disponível." }
        }
        if (!params.diaVencimento) {
          return { ok: false as const, motivo: "Informe o dia de vencimento." }
        }
        if (
          modalidades.length < 1 ||
          modalidades.length > 3 ||
          !plano.ativo ||
          plano.periodicidade !== "MENSAL" ||
          plano.quantidadeModalidadesMatricula !== modalidades.length
        ) {
          return {
            ok: false as const,
            motivo: "A quantidade de modalidades não corresponde ao plano da solicitação.",
          }
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
      } else if (modalidades.length !== 1) {
        return {
          ok: false as const,
          motivo: "Este tipo de matrícula deve possuir somente uma modalidade.",
        }
      } else if (aulaAvulsa) {
        if (!plano || !planoCompativelComAulaAvulsa(Number(plano.valor))) {
          return { ok: false as const, motivo: "O plano mensal de R$ 100,00 não está disponível." }
        }
        if (
          !cobrancaMatricula?.recebidaEmAsaas ||
          !cobrancaMatricula.asaasPaymentId ||
          !cobrancaMatricula.asaasCustomerId ||
          Number(cobrancaMatricula.valor) !== VALOR_AULA_AVULSA
        ) {
          return {
            ok: false as const,
            motivo: "O pagamento de R$ 20,00 ainda não foi confirmado pelo Asaas.",
          }
        }
        if (
          !solicitacao.aulaAvulsa ||
          solicitacao.aulaAvulsa.cancelada ||
          !solicitacao.aulaAvulsa.turma.ativa ||
          solicitacao.aulaAvulsa.turma.ehEvento ||
          solicitacao.aulaAvulsa.turma.modalidadeId !== modalidades[0]?.id ||
          solicitacao.aulaAvulsa.fim.getTime() <= agora.getTime()
        ) {
          return { ok: false as const, motivo: "A aula avulsa escolhida não está mais disponível." }
        }
      } else if (externo) {
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
      } else return { ok: false as const, motivo: "Tipo de matrícula inválido." }

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
              tipo: tipoAluno,
              status: "ATIVO",
              cpf: solicitacao.cpf,
              telefone: solicitacao.telefone,
              dataNascimento: solicitacao.dataNascimento,
              endereco: solicitacao.endereco,
              dataInicio: agora,
              contatoEmergencia: solicitacao.contatoEmergencia,
              restricoesMedicas: solicitacao.restricoesMedicas,
              planoId: mensalista ? (plano?.id ?? null) : null,
              ...(mensalista ? { diaVencimento: params.diaVencimento } : {}),
              modalidades: { connect: modalidades.map((modalidade) => ({ id: modalidade.id })) },
              modalidadesPlano: {
                create: modalidades.map((modalidade) => ({
                  modalidadeId: modalidade.id,
                  plataformaExterna,
                })),
              },
            },
          },
        },
        include: { aluno: true },
      })
      if (!usuario.aluno) throw new ErroMatricula("Não foi possível criar o aluno.")

      if (aulaAvulsa && solicitacao.aulaAvulsa && plano && cobrancaMatricula) {
        await tx.$queryRaw`SELECT "id" FROM "Aula" WHERE "id" = ${solicitacao.aulaAvulsa.id} FOR UPDATE`
        const aulaAtual = await tx.aula.findUnique({
          where: { id: solicitacao.aulaAvulsa.id },
          select: {
            inicio: true,
            fim: true,
            cancelada: true,
            turma: {
              select: { ativa: true, ehEvento: true, modalidadeId: true, capacidade: true },
            },
          },
        })
        if (
          !aulaAtual ||
          aulaAtual.cancelada ||
          !aulaAtual.turma.ativa ||
          aulaAtual.turma.ehEvento ||
          aulaAtual.turma.modalidadeId !== modalidades[0]?.id ||
          aulaAtual.fim.getTime() <= agora.getTime()
        ) {
          throw new ErroMatricula("A aula avulsa escolhida não está mais disponível.")
        }
        const [comparecimentos, checkins] = await Promise.all([
          tx.comparecimento.findMany({
            where: {
              aulaId: solicitacao.aulaAvulsa.id,
              status: { in: ["CONFIRMADO", "CONVERTIDO_CHECKIN"] },
            },
            select: { alunoId: true },
          }),
          tx.checkin.findMany({
            where: { aulaId: solicitacao.aulaAvulsa.id, status: "VALIDO" },
            select: { alunoId: true },
          }),
        ])
        const ocupacao = new Set([
          ...comparecimentos.map((item) => item.alunoId),
          ...checkins.map((item) => item.alunoId),
        ]).size
        if (aulaAtual.turma.capacidade > 0 && ocupacao >= aulaAtual.turma.capacidade) {
          throw new ErroMatricula(
            "A aula escolhida ficou lotada. Concilie o pagamento antes de aprovar.",
          )
        }
        await tx.acessoAulaAvulsa.create({
          data: {
            solicitacaoId: solicitacao.id,
            alunoId: usuario.aluno.id,
            aulaId: solicitacao.aulaAvulsa.id,
            valorPago: VALOR_AULA_AVULSA,
            valorPlanoSnapshot: VALOR_MENSALIDADE_AULA_AVULSA,
            valorComplemento: VALOR_COMPLEMENTO_AULA_AVULSA,
            prazoConversao: fimExclusivoDaSemanaAcademia(aulaAtual.inicio),
          },
        })
        await tx.comparecimento.create({
          data: {
            alunoId: usuario.aluno.id,
            aulaId: solicitacao.aulaAvulsa.id,
            status: "CONFIRMADO",
          },
        })
      }

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

      if (aulaAvulsa && cobrancaMatricula) {
        await tx.clienteAsaas.create({
          data: {
            alunoId: usuario.aluno.id,
            asaasCustomerId: cobrancaMatricula.asaasCustomerId!,
            tipoPagador: "ALUNO",
          },
        })
        await tx.cobrancaMatriculaAsaas.update({
          where: { id: cobrancaMatricula.id },
          data: { ativa: false },
        })
      }

      await tx.solicitacaoMatricula.update({
        where: { id: solicitacao.id },
        data: {
          status: "APROVADA",
          alunoId: usuario.aluno.id,
          planoAprovadoId: mensalista ? (plano?.id ?? null) : null,
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
            tipo: tipoAluno,
            status: "ATIVO",
            planoId: mensalista ? (plano?.id ?? null) : null,
            modalidadeIds: modalidades.map((modalidade) => modalidade.id),
            plataformaExterna,
            aulaAvulsaId: solicitacao.aulaAvulsa?.id ?? null,
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
            planoId: mensalista ? (plano?.id ?? null) : null,
            planoAlvoConversaoId: aulaAvulsa ? (plano?.id ?? null) : null,
            modalidadeIds: modalidades.map((modalidade) => modalidade.id),
            modalidadeNomes: modalidades.map((modalidade) => modalidade.nome),
            diaVencimento: mensalista ? params.diaVencimento : null,
            pagamentoAsaasConfirmado: mensalista,
            pagamentoAulaAvulsaAsaasConfirmado: aulaAvulsa,
            pagamentoDispensado: externo,
            origemFinanceira: mensalista || aulaAvulsa ? "ECVO" : solicitacao.tipoPagamento,
            asaasPaymentId: cobrancaMatricula?.asaasPaymentId ?? null,
            aulaAvulsa: solicitacao.aulaAvulsa
              ? formatarDataHora(solicitacao.aulaAvulsa.inicio)
              : null,
            comprovanteInformado: Boolean(solicitacao.comprovantePagamentoUrl),
          },
        },
        tx,
      )

      const notificacoes = await notificarGestoresSobreMatricula(tx, {
        titulo: "Matrícula aprovada",
        mensagem: `A matrícula de ${solicitacao.nome} em ${modalidades.map((modalidade) => modalidade.nome).join(", ")} está concluída. O acesso ao sistema está liberado.`,
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
    if (
      (solicitacao.tipoPagamento === "MENSALISTA" || solicitacao.tipoPagamento === "AULA_AVULSA") &&
      solicitacao.cobrancasAsaas.length > 0
    ) {
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

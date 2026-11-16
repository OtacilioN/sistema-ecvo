import "server-only"
import { Prisma, type PrismaClient } from "@prisma/client"
import { db } from "@/lib/db"
import { CUSTOS_FIXOS_PADRAO } from "@/lib/financeiro/custos-fixos"
import { registrarLog } from "@/lib/services/auditoria.service"
import { chaveCompetencia } from "@/lib/utils/datas"

const OPERACAO = "REEMBOLSO_MANUAL_INTEGRAL"

type Params = {
  mensalidadeId: string
  alunoId: string
  asaasPaymentId: string
  valorDevolvido: number
  confirmacao: "PIX_SEPARADO_REALIZADO_INFORMADO_PELO_GESTOR"
  autorId: string | null
}

// Conciliação interna de uma devolução já realizada. Não movimenta dinheiro nem
// altera o recebimento original no Asaas. A taxa permanece como custo da escola.
export async function conciliarReembolsoManualIntegral(params: Params, cliente: PrismaClient = db) {
  if (
    params.confirmacao !== "PIX_SEPARADO_REALIZADO_INFORMADO_PELO_GESTOR" ||
    !Number.isFinite(params.valorDevolvido) ||
    params.valorDevolvido <= 0 ||
    Number(params.valorDevolvido.toFixed(2)) !== params.valorDevolvido
  ) {
    throw new Error("Informe a devolução integral já realizada por Pix separado.")
  }

  return cliente.$transaction(
    async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "Mensalidade" WHERE "id" = ${params.mensalidadeId} FOR UPDATE`
      const mensalidade = await tx.mensalidade.findUniqueOrThrow({
        where: { id: params.mensalidadeId },
        include: {
          aluno: { select: { usuario: { select: { nome: true } } } },
          cobrancasAsaas: {
            select: {
              id: true,
              status: true,
              statusAsaas: true,
              asaasPaymentId: true,
              valorCobrado: true,
              taxaAsaas: true,
              contratoPixAutomaticoId: true,
              cobrancaFamiliaId: true,
              splits: { select: { id: true } },
            },
          },
          cobrancaMatriculaAsaas: { select: { splits: { select: { id: true } } } },
        },
      })
      if (mensalidade.alunoId !== params.alunoId) throw new Error("Aluno divergente.")
      const anterior = await tx.logAuditoria.findFirst({
        where: {
          entidade: "Mensalidade",
          entidadeId: mensalidade.id,
          acao: "CONCILIACAO_MANUAL",
          valorNovo: { path: ["operacao"], equals: OPERACAO },
        },
        select: { id: true, valorNovo: true },
      })
      if (anterior) {
        const registrado = anterior.valorNovo as Record<string, unknown> | null
        if (
          mensalidade.status !== "CANCELADA" ||
          registrado?.asaasPaymentId !== params.asaasPaymentId ||
          registrado?.valorDevolvido !== params.valorDevolvido
        ) {
          throw new Error("A conciliação anterior diverge do estado atual; revise a auditoria.")
        }
        return { duplicado: true, mensalidadeId: mensalidade.id, auditoriaId: anterior.id }
      }
      const cobranca = mensalidade.cobrancasAsaas.find(
        (item) => item.id === mensalidade.cobrancaQuitacaoAsaasId,
      )
      if (
        mensalidade.status !== "PAGA" ||
        mensalidade.formaPagamento !== "PIX_ASAAS" ||
        !mensalidade.pagoEm ||
        Number(mensalidade.valor) !== params.valorDevolvido ||
        !cobranca ||
        cobranca.asaasPaymentId !== params.asaasPaymentId ||
        cobranca.status !== "RECEBIDA" ||
        cobranca.statusAsaas !== "RECEIVED" ||
        Number(cobranca.valorCobrado) !== params.valorDevolvido ||
        cobranca.taxaAsaas === null
      ) {
        throw new Error("Pagamento divergente; a devolução não foi conciliada.")
      }
      if (
        mensalidade.cobrancasAsaas.some(
          (item) =>
            item.splits.length > 0 ||
            item.contratoPixAutomaticoId ||
            item.cobrancaFamiliaId ||
            (item.id !== cobranca.id && item.status === "RECEBIDA"),
        ) ||
        mensalidade.cobrancaMatriculaAsaas?.splits.length
      ) {
        throw new Error(
          "Pagamento com split, recorrência ou outra quitação exige conciliação própria.",
        )
      }

      const competenciaCusto = chaveCompetencia(mensalidade.pagoEm)
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('CustoFixoMensal'), hashtext(${competenciaCusto}))`
      const custosAnteriores = await tx.custoFixoMensal.findUnique({
        where: { competencia: competenciaCusto },
      })
      const marcador = `[reembolso-manual:${mensalidade.id}]`
      if (custosAnteriores?.observacoesOutros.includes(marcador)) {
        throw new Error("A taxa já tem registro nos custos; revise antes de conciliar novamente.")
      }
      const taxa = cobranca.taxaAsaas
      if (taxa.isNegative() || taxa.greaterThan(params.valorDevolvido)) {
        throw new Error("Taxa Asaas inválida.")
      }
      const justificativa =
        `${marcador} Devolução integral de R$ ${params.valorDevolvido.toFixed(2)} ` +
        "por novo Pix da conta da ECVO ao aluno, confirmada pelo gestor. " +
        "Sem estorno no Asaas; recebimento original preservado. " +
        "Data exata do Pix não informada. Mensalidade excluída da receita e do repasse."
      const observacoesOutros = [
        custosAnteriores?.observacoesOutros,
        `${marcador} Taxa Asaas de R$ ${taxa.toFixed(2)} mantida após devolução por Pix separado. ` +
          "Revisar este custo antes de eventual reabertura da mensalidade, para não duplicar a taxa.",
      ]
        .filter(Boolean)
        .join("\n")
      if (observacoesOutros.length > 2000) throw new Error("Observações de custos sem espaço.")
      const custosNovos = await tx.custoFixoMensal.upsert({
        where: { competencia: competenciaCusto },
        create: {
          competencia: competenciaCusto,
          ...CUSTOS_FIXOS_PADRAO,
          outros: taxa,
          observacoesOutros,
        },
        update: {
          outros: new Prisma.Decimal(custosAnteriores?.outros ?? 0).plus(taxa),
          observacoesOutros,
        },
      })
      const atualizada = await tx.mensalidade.update({
        where: { id: mensalidade.id },
        data: {
          status: "CANCELADA",
          pagoEm: null,
          formaPagamento: null,
          cobrancaQuitacaoAsaasId: null,
          observacao: [mensalidade.observacao, justificativa].filter(Boolean).join("\n"),
        },
      })
      const auditoria = await registrarLog(
        {
          autorId: params.autorId,
          acao: "CONCILIACAO_MANUAL",
          entidade: "Mensalidade",
          entidadeId: mensalidade.id,
          valorAntigo: JSON.parse(JSON.stringify(mensalidade)),
          valorNovo: {
            operacao: OPERACAO,
            alunoId: params.alunoId,
            asaasPaymentId: params.asaasPaymentId,
            valorDevolvido: params.valorDevolvido,
            confirmacao: params.confirmacao,
            status: atualizada.status,
            pagamentoAsaasPreservado: true,
            taxaAsaasMantida: Number(taxa),
            competenciaCusto,
            dataPixInformada: false,
          },
          justificativa,
        },
        tx,
      )
      await registrarLog(
        {
          autorId: params.autorId,
          acao: "CONCILIACAO_MANUAL",
          entidade: "CustoFixoMensal",
          entidadeId: competenciaCusto,
          valorAntigo: custosAnteriores
            ? JSON.parse(JSON.stringify(custosAnteriores))
            : { ...CUSTOS_FIXOS_PADRAO, personalizado: false },
          valorNovo: JSON.parse(JSON.stringify(custosNovos)),
          justificativa: `${marcador} Taxa original permanece como custo da ECVO. Auditoria ${auditoria.id}.`,
        },
        tx,
      )
      return {
        duplicado: false,
        mensalidadeId: mensalidade.id,
        auditoriaId: auditoria.id,
        status: atualizada.status,
        receita: 0,
        repasseProfessor: 0,
        taxaAsaasMantida: Number(taxa),
        competenciaCusto,
      }
    },
    { timeout: 15000 },
  )
}

import "server-only"
import { createHash } from "node:crypto"
import type { Prisma } from "@prisma/client"
import { z } from "zod"
import { STATUS_ALUNO_OPERACIONAIS } from "@/lib/alunos/status"
import { db } from "@/lib/db"
import { resumoAdimplencia } from "@/lib/financeiro/adimplencia"
import {
  fimExclusivoDoDiaAcademia,
  formatarCompetencia,
  formatarData,
  inicioDoDiaAcademia,
} from "@/lib/utils/datas"
import { formatarBRL } from "@/lib/utils/formato"

const DIA_MS = 86_400_000
const PAUSA_MS = 150
const esperar = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))
const alunoSelect = {
  usuario: { select: { nome: true, email: true } },
  responsavel: { select: { responsavelFinanceiro: true, email: true } },
} satisfies Prisma.AlunoSelect

type Mensalidade = Prisma.MensalidadeGetPayload<{
  include: { aluno: { select: typeof alunoSelect } }
}>

function configuracaoEmail() {
  const chave = process.env.RESEND_API_KEY?.trim()
  const remetente = process.env.EMAIL_REMETENTE?.trim()
  const endereco = process.env.NEXT_PUBLIC_APP_URL?.trim()
  if (!chave || !remetente || !endereco) throw new Error("E-mail financeiro não configurado.")
  const url = new URL(endereco)
  if (
    url.username ||
    url.password ||
    !["https:", "http:"].includes(url.protocol) ||
    (process.env.NODE_ENV === "production" && url.protocol !== "https:")
  ) {
    throw new Error("URL do financeiro inválida.")
  }
  return { chave, remetente, financeiro: new URL("/aluno/financeiro", url).toString() }
}

function conteudoEmail(
  mensalidade: Mensalidade,
  config: ReturnType<typeof configuracaoEmail>,
  agora: Date,
) {
  const responsavel = mensalidade.aluno.responsavel
  const email =
    (responsavel?.responsavelFinanceiro && responsavel.email?.trim()) ||
    mensalidade.aluno.usuario.email.trim()
  // Um responsável com endereço inválido não deve vazar a cobrança para outro destinatário.
  const destinatario = z.email().parse(email)
  const resumo = resumoAdimplencia(mensalidade, agora)
  const vencimento = formatarData(mensalidade.vencimento)
  const competencia = formatarCompetencia(mensalidade.competencia)
  const promocao = resumo.temDesconto
    ? `Para manter o valor promocional de ${formatarBRL(resumo.valorComDesconto)}, é necessário pagar até ${formatarData(resumo.ultimoDiaComDesconto)}. Após essa data, o valor da mensalidade será ${formatarBRL(resumo.valorBase)}.`
    : `Efetue o pagamento até ${vencimento} para manter sua mensalidade em dia.`
  return {
    remetente: config.remetente,
    destinatario,
    assunto: `Sua mensalidade vence em 5 dias — ECVO`,
    texto: [
      `Olá!`,
      `A mensalidade de ${competencia} de ${mensalidade.aluno.usuario.nome} vence em 5 dias.`,
      `Valor: ${formatarBRL(resumo.valorAtual)}\nData limite para pagamento: ${vencimento}`,
      promocao,
      `Consulte sua mensalidade e as opções de pagamento no financeiro:\n${config.financeiro}`,
      `Se você já efetuou o pagamento, desconsidere este lembrete.`,
      `Equipe ECVO`,
    ].join("\n\n"),
  }
}

/** Três tentativas com o MESMO corpo/chave, dentro da janela de 24h do Resend. */
async function enviar(
  chave: string,
  registro: { id: string; remetente: string; destinatario: string; assunto: string; texto: string },
) {
  for (let tentativa = 0; tentativa < 3; tentativa++) {
    try {
      const resposta = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${chave}`,
          "Content-Type": "application/json",
          "Idempotency-Key": `lembrete-mensalidade/${registro.id}`,
        },
        body: JSON.stringify({
          from: registro.remetente,
          to: [registro.destinatario],
          subject: registro.assunto,
          text: registro.texto,
        }),
        signal: AbortSignal.timeout(10_000),
      })
      if (resposta.ok) {
        const resultado = (await resposta.json()) as { id?: string }
        if (!resultado.id) throw new Error("Resposta de envio inválida.")
        return resultado.id
      }
      if (resposta.status !== 429 && resposta.status < 500) return null
    } catch {
      // Falhas de rede podem ocorrer após a aceitação: sempre preservar a chave.
    }
    if (tentativa < 2) await esperar(1000 * 2 ** tentativa)
  }
  return null
}

export async function enviarLembretesPagamentoEmail(params?: {
  agora?: Date
  limiteExecucaoEm?: number
}) {
  const agora = params?.agora ?? new Date()
  const alvo = new Date(inicioDoDiaAcademia(agora).getTime() + 5 * DIA_MS)
  const where = {
    status: "EM_ABERTO",
    vencimento: { gte: inicioDoDiaAcademia(alvo), lt: fimExclusivoDoDiaAcademia(alvo) },
    aluno: {
      status: { in: [...STATUS_ALUNO_OPERACIONAIS] },
      usuario: { ativo: true },
    },
  } satisfies Prisma.MensalidadeWhereInput
  const mensalidades = await db.mensalidade.findMany({
    where,
    include: { aluno: { select: alunoSelect } },
    orderBy: { id: "asc" },
  })
  if (!mensalidades.length) return { ok: true, analisadas: 0, enviados: 0, falhas: 0 }
  const config = configuracaoEmail()
  const inicio = Date.now()
  const limiteExecucaoEm = Math.min(inicio + 180_000, params?.limiteExecucaoEm ?? Infinity)
  let enviados = 0
  let falhas = 0

  for (const [indice, mensalidade] of mensalidades.entries()) {
    // Reserva tempo para as outras etapas e para o registro do resultado da tarefa.
    if (Date.now() + 35_000 > limiteExecucaoEm) {
      falhas += mensalidades.length - indice
      break
    }
    let registroId: string | undefined
    try {
      const conteudo = conteudoEmail(mensalidade, config, agora)
      const id = createHash("sha256").update(`mensalidade:${mensalidade.id}`).digest("hex")
      await db.lembretePagamentoEmail.createMany({
        data: [{ id, mensalidadeId: mensalidade.id, ...conteudo, primeiraTentativaEm: agora }],
        skipDuplicates: true,
      })
      const registro = await db.lembretePagamentoEmail.findUniqueOrThrow({
        where: { mensalidadeId: mensalidade.id },
      })
      if (registro.enviadoEm) continue
      // Após 23h uma tentativa incerta requer conferência; nunca reenviar após expirar a chave.
      if (registro.primeiraTentativaEm.getTime() < agora.getTime() - 23 * 60 * 60 * 1000) {
        falhas++
        continue
      }
      const reserva = await db.lembretePagamentoEmail.updateMany({
        where: {
          id: registro.id,
          enviadoEm: null,
          OR: [{ reservadoAte: null }, { reservadoAte: { lte: agora } }],
        },
        data: { reservadoAte: new Date(agora.getTime() + 360_000), tentativas: { increment: 1 } },
      })
      if (!reserva.count) {
        falhas++
        continue
      }
      registroId = registro.id
      // Revalidar pagamento, trancamento, vencimento, valor e destinatário antes do envio.
      const atual = await db.mensalidade.findFirst({
        where: { ...where, id: mensalidade.id },
        include: { aluno: { select: alunoSelect } },
      })
      if (!atual) {
        await db.lembretePagamentoEmail.update({
          where: { id: registro.id },
          data: { reservadoAte: null },
        })
        continue
      }
      const conteudoAtual = conteudoEmail(atual, config, agora)
      if (
        Object.entries(conteudoAtual).some(
          ([campo, valor]) => registro[campo as keyof typeof conteudoAtual] !== valor,
        )
      ) {
        throw new Error("Conteúdo alterado após a reserva.")
      }
      const resendId = await enviar(config.chave, registro)
      if (!resendId) throw new Error("Envio não confirmado.")
      await db.lembretePagamentoEmail.update({
        where: { id: registro.id },
        data: { enviadoEm: new Date(), resendId, reservadoAte: null, ultimoErro: null },
      })
      enviados++
    } catch {
      falhas++
      if (registroId) {
        try {
          await db.lembretePagamentoEmail.update({
            where: { id: registroId },
            data: {
              reservadoAte: null,
              ultimoErro:
                "Envio não confirmado. Conferir antes de repetir fora da janela de idempotência.",
            },
          })
        } catch {
          // Se o banco caiu, preservar a reserva até expirar e continuar os demais itens.
        }
      }
    }
    await esperar(PAUSA_MS)
  }
  // Só contadores: nome, e-mail, valores e conteúdo não entram no histórico do cron.
  return { ok: falhas === 0, analisadas: mensalidades.length, enviados, falhas }
}

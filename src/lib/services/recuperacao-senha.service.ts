import "server-only"
import { createHash, randomBytes } from "node:crypto"
import { gerarHashSenha } from "@/lib/auth/senha"
import { db } from "@/lib/db"
import { registrarLog } from "@/lib/services/auditoria.service"

const VALIDADE_MS = 60 * 60 * 1000
const INTERVALO_MS = 5 * 60 * 1000
const hashToken = (token: string) => createHash("sha256").update(token).digest("hex")

function configuracaoEmail() {
  const chave = process.env.RESEND_API_KEY?.trim()
  const remetente = process.env.EMAIL_REMETENTE?.trim()
  const endereco = process.env.NEXT_PUBLIC_APP_URL?.trim()
  if (!chave || !remetente || !endereco) throw new Error("Envio de recuperação não configurado")
  const url = new URL(endereco)
  if (
    url.username ||
    url.password ||
    (process.env.NODE_ENV === "production" && url.protocol !== "https:")
  ) {
    throw new Error("URL de recuperação inválida")
  }
  if (!["https:", "http:"].includes(url.protocol)) throw new Error("URL de recuperação inválida")
  return { chave, remetente, url }
}

export async function solicitarRecuperacaoSenha(email: string) {
  const usuario = await db.usuario.findUnique({
    where: { email },
    select: { id: true, ativo: true, papel: true, aluno: { select: { id: true } } },
  })
  if (!usuario?.ativo || usuario.papel !== "ALUNO" || !usuario.aluno) return
  const { chave, remetente, url } = configuracaoEmail()
  const agora = new Date()
  const token = randomBytes(32).toString("hex")
  const hash = hashToken(token)
  const reservado = await db.usuario.updateMany({
    where: {
      id: usuario.id,
      ativo: true,
      papel: "ALUNO",
      OR: [
        { recuperacaoEnviadaEm: null },
        { recuperacaoEnviadaEm: { lte: new Date(agora.getTime() - INTERVALO_MS) } },
      ],
    },
    data: {
      recuperacaoHash: hash,
      recuperacaoExpiraEm: new Date(agora.getTime() + VALIDADE_MS),
      recuperacaoEnviadaEm: agora,
    },
  })
  if (!reservado.count) return
  url.pathname = "/redefinir-senha"
  url.search = ""
  url.hash = ""
  url.searchParams.set("token", token)
  try {
    const resposta = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${chave}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: remetente,
        to: [email],
        subject: "Redefinição de senha — ECVO",
        text: `Recebemos uma solicitação para redefinir sua senha no Sistema ECVO.\n\nAcesse o link abaixo para escolher uma nova senha. Ele é válido por 1 hora e pode ser usado uma única vez:\n\n${url.toString()}\n\nSe você não fez essa solicitação, ignore este e-mail.`,
      }),
      signal: AbortSignal.timeout(10000),
    })
    if (!resposta.ok) throw new Error(`Provedor de e-mail respondeu ${resposta.status}`)
  } catch (erro) {
    await db.usuario.updateMany({
      where: { id: usuario.id, recuperacaoHash: hash },
      data: { recuperacaoHash: null, recuperacaoExpiraEm: null, recuperacaoEnviadaEm: null },
    })
    throw erro
  }
}

export async function concluirRecuperacaoSenha(token: string, senha: string): Promise<boolean> {
  const hash = hashToken(token)
  const candidato = await db.usuario.findUnique({
    where: { recuperacaoHash: hash },
    select: {
      id: true,
      ativo: true,
      papel: true,
      aluno: { select: { id: true } },
      recuperacaoExpiraEm: true,
    },
  })
  if (
    !candidato?.ativo ||
    candidato.papel !== "ALUNO" ||
    !candidato.aluno ||
    !candidato.recuperacaoExpiraEm ||
    candidato.recuperacaoExpiraEm <= new Date()
  ) {
    return false
  }
  const senhaHash = await gerarHashSenha(senha)
  return db.$transaction(async (tx) => {
    const resultado = await tx.usuario.updateMany({
      where: {
        id: candidato.id,
        recuperacaoHash: hash,
        recuperacaoExpiraEm: { gt: new Date() },
        ativo: true,
        papel: "ALUNO",
        aluno: { isNot: null },
      },
      data: {
        senhaHash,
        recuperacaoHash: null,
        recuperacaoExpiraEm: null,
        sessaoVersao: { increment: 1 },
      },
    })
    if (!resultado.count) return false
    await registrarLog(
      {
        autorId: candidato.id,
        acao: "CONFIGURACAO",
        entidade: "Usuario",
        entidadeId: candidato.id,
        valorNovo: { tipo: "SENHA_REDEFINIDA", origem: "RECUPERACAO_EMAIL" },
      },
      tx,
    )
    return true
  })
}

"use server"

import { z } from "zod"
import {
  concluirRecuperacaoSenha,
  solicitarRecuperacaoSenha,
} from "@/lib/services/recuperacao-senha.service"

export type EstadoRecuperacao = { mensagem?: string; erro?: string; sucesso?: boolean } | undefined

export async function solicitarRecuperacao(
  _: EstadoRecuperacao,
  formData: FormData,
): Promise<EstadoRecuperacao> {
  const email = z.email().trim().toLowerCase().safeParse(formData.get("email"))
  if (!email.success) return { erro: "Informe um e-mail válido." }
  try {
    await solicitarRecuperacaoSenha(email.data)
  } catch {
    // Não registrar e-mail, token ou resposta do provedor, nem revelar a existência da conta.
    console.error("Falha ao processar solicitação de recuperação de senha")
  }
  return {
    sucesso: true,
    mensagem: "Se houver uma conta de aluno apta, você receberá um e-mail com as instruções.",
  }
}

export async function redefinirSenha(
  _: EstadoRecuperacao,
  formData: FormData,
): Promise<EstadoRecuperacao> {
  const dados = z
    .object({
      token: z.string().regex(/^[a-f0-9]{64}$/),
      senha: z.string().min(6, "Senha de no mínimo 6 caracteres"),
      confirmarSenha: z.string(),
    })
    .refine((valor) => valor.senha === valor.confirmarSenha, {
      message: "As senhas não conferem",
      path: ["confirmarSenha"],
    })
    .safeParse({
      token: formData.get("token"),
      senha: formData.get("senha"),
      confirmarSenha: formData.get("confirmarSenha"),
    })
  if (!dados.success)
    return {
      erro:
        dados.error.issues[0]?.path[0] === "token"
          ? "Link inválido ou expirado. Solicite um novo link."
          : dados.error.issues[0]?.message,
    }
  const ok = await concluirRecuperacaoSenha(dados.data.token, dados.data.senha)
  if (!ok) return { erro: "Link inválido ou expirado. Solicite um novo link." }
  return { sucesso: true, mensagem: "Senha redefinida. Entre com sua nova senha." }
}

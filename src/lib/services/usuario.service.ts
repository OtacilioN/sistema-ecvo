import "server-only"
import { gerarHashSenha, verificarSenha } from "@/lib/auth/senha"
import { db } from "@/lib/db"
import { registrarLog } from "@/lib/services/auditoria.service"

export function listarUsuariosAcesso() {
  return db.usuario.findMany({
    orderBy: [{ nome: "asc" }, { email: "asc" }],
    select: {
      id: true,
      nome: true,
      email: true,
      papel: true,
      ativo: true,
      criadoEm: true,
      aluno: { select: { id: true, status: true } },
      professor: { select: { id: true, ativo: true } },
    },
  })
}

export async function alterarSenhaPropria(params: {
  usuarioId: string
  senhaAtual: string
  novaSenha: string
}) {
  const usuario = await db.usuario.findUnique({
    where: { id: params.usuarioId },
    select: {
      id: true,
      email: true,
      nome: true,
      papel: true,
      ativo: true,
      senhaHash: true,
    },
  })
  if (!usuario?.ativo) {
    return { ok: false as const, motivo: "Usuário não encontrado." }
  }

  const senhaAtualCorreta = await verificarSenha(params.senhaAtual, usuario.senhaHash)
  if (!senhaAtualCorreta) {
    return { ok: false as const, motivo: "Senha atual incorreta." }
  }

  const senhaHash = await gerarHashSenha(params.novaSenha)

  await db.$transaction(async (tx) => {
    await tx.usuario.update({
      where: { id: usuario.id },
      data: { senhaHash },
      select: { id: true },
    })

    await registrarLog(
      {
        autorId: usuario.id,
        acao: "CONFIGURACAO",
        entidade: "Usuario",
        entidadeId: usuario.id,
        valorNovo: {
          tipo: "SENHA_ALTERADA",
          usuarioId: usuario.id,
          email: usuario.email,
          papel: usuario.papel,
          origem: "PROPRIA",
        },
      },
      tx,
    )
  })

  return { ok: true as const }
}

export async function redefinirSenhaUsuario(params: {
  usuarioId: string
  novaSenha: string
  autorId: string
}) {
  const usuario = await db.usuario.findUnique({
    where: { id: params.usuarioId },
    select: {
      id: true,
      email: true,
      nome: true,
      papel: true,
      ativo: true,
    },
  })
  if (!usuario) {
    return { ok: false as const, motivo: "Usuário não encontrado." }
  }

  const senhaHash = await gerarHashSenha(params.novaSenha)

  await db.$transaction(async (tx) => {
    await tx.usuario.update({
      where: { id: usuario.id },
      data: { senhaHash },
      select: { id: true },
    })

    await registrarLog(
      {
        autorId: params.autorId,
        acao: "CONFIGURACAO",
        entidade: "Usuario",
        entidadeId: usuario.id,
        valorNovo: {
          tipo: "SENHA_REDEFINIDA",
          usuarioId: usuario.id,
          nome: usuario.nome,
          email: usuario.email,
          papel: usuario.papel,
          ativo: usuario.ativo,
          origem: "GESTOR",
        },
      },
      tx,
    )
  })

  return { ok: true as const }
}

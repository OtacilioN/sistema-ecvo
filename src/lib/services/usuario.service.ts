import "server-only"
import { gerarHashSenha, verificarSenha } from "@/lib/auth/senha"
import { db } from "@/lib/db"
import { registrarLog } from "@/lib/services/auditoria.service"
import { excluirFotosInternasAntigas } from "@/lib/storage/blob-fotos"

export function listarUsuariosAcesso() {
  return db.usuario.findMany({
    orderBy: [{ nome: "asc" }, { email: "asc" }],
    select: {
      id: true,
      nome: true,
      email: true,
      papel: true,
      ativo: true,
      fotoUrl: true,
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

export async function atualizarFotoUsuario(params: {
  usuarioId: string
  fotoUrl: string | null
  autorId: string
}) {
  const [autor, usuario] = await Promise.all([
    db.usuario.findUnique({
      where: { id: params.autorId },
      select: { id: true, papel: true, ativo: true },
    }),
    db.usuario.findUnique({
      where: { id: params.usuarioId },
      select: {
        id: true,
        nome: true,
        email: true,
        papel: true,
        ativo: true,
        fotoUrl: true,
        aluno: { select: { id: true, fotoUrl: true } },
        professor: { select: { id: true, fotoUrl: true } },
      },
    }),
  ])

  if (!autor?.ativo) return { ok: false as const, motivo: "Usuário não autorizado." }
  if (!usuario) return { ok: false as const, motivo: "Usuário não encontrado." }
  const propria = autor.id === usuario.id
  if (!propria && autor.papel !== "GESTOR") {
    return { ok: false as const, motivo: "Usuário não autorizado." }
  }

  const atualizado = await db.$transaction(async (tx) => {
    const usuarioAtualizado = await tx.usuario.update({
      where: { id: usuario.id },
      data: { fotoUrl: params.fotoUrl },
      select: { id: true, fotoUrl: true },
    })

    if (usuario.aluno) {
      await tx.aluno.update({
        where: { id: usuario.aluno.id },
        data: { fotoUrl: params.fotoUrl },
        select: { id: true },
      })
    }

    if (usuario.professor) {
      await tx.professor.update({
        where: { id: usuario.professor.id },
        data: { fotoUrl: params.fotoUrl },
        select: { id: true },
      })
    }

    if (usuario.fotoUrl !== params.fotoUrl) {
      await registrarLog(
        {
          autorId: autor.id,
          acao: "CONFIGURACAO",
          entidade: "Usuario",
          entidadeId: usuario.id,
          valorAntigo: {
            tipo: "FOTO_ATUALIZADA",
            usuarioId: usuario.id,
            fotoInformada: Boolean(usuario.fotoUrl),
          },
          valorNovo: {
            tipo: "FOTO_ATUALIZADA",
            usuarioId: usuario.id,
            nome: usuario.nome,
            email: usuario.email,
            papel: usuario.papel,
            fotoInformada: Boolean(params.fotoUrl),
            origem: propria ? "PROPRIA" : "GESTOR",
          },
        },
        tx,
      )
    }

    return usuarioAtualizado
  })

  await excluirFotosInternasAntigas(
    [usuario.fotoUrl, usuario.aluno?.fotoUrl, usuario.professor?.fotoUrl],
    atualizado.fotoUrl,
  )

  return { ok: true as const, usuario: atualizado }
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

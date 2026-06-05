import "server-only"
import { gerarHashSenha } from "@/lib/auth/senha"
import { db } from "@/lib/db"
import { registrarLog } from "@/lib/services/auditoria.service"

// Serviço de GESTORES. O MVP prevê múltiplos gestores administrando a academia.

export function listarGestores() {
  return db.usuario.findMany({
    where: { papel: "GESTOR" },
    orderBy: { nome: "asc" },
    select: {
      id: true,
      nome: true,
      email: true,
      ativo: true,
      criadoEm: true,
      _count: { select: { logs: true } },
    },
  })
}

export async function criarGestor(params: {
  nome: string
  email: string
  senha: string
  autorId: string
}) {
  const senhaHash = await gerarHashSenha(params.senha)

  return db.$transaction(async (tx) => {
    const gestor = await tx.usuario.create({
      data: {
        nome: params.nome,
        email: params.email,
        senhaHash,
        papel: "GESTOR",
      },
      select: { id: true, nome: true, email: true, papel: true, ativo: true },
    })

    await registrarLog(
      {
        autorId: params.autorId,
        acao: "GESTOR_CRIADO",
        entidade: "Usuario",
        entidadeId: gestor.id,
        valorNovo: {
          nome: gestor.nome,
          email: gestor.email,
          papel: gestor.papel,
          ativo: gestor.ativo,
        },
      },
      tx,
    )

    return gestor
  })
}

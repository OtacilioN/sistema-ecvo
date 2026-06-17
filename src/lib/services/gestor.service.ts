import "server-only"
import type { Papel } from "@prisma/client"
import { gerarHashSenha } from "@/lib/auth/senha"
import { db } from "@/lib/db"
import { registrarLog } from "@/lib/services/auditoria.service"

// Serviço de GESTORES. O MVP prevê múltiplos gestores administrando a academia.

export function listarGestores() {
  return db.usuario.findMany({
    where: { papel: { in: ["GESTOR", "SECRETARIA"] } },
    orderBy: [{ papel: "asc" }, { nome: "asc" }],
    select: {
      id: true,
      nome: true,
      email: true,
      fotoUrl: true,
      papel: true,
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
  papel?: Extract<Papel, "GESTOR" | "SECRETARIA">
  autorId: string
}) {
  const senhaHash = await gerarHashSenha(params.senha)
  const papel = params.papel ?? "GESTOR"

  return db.$transaction(async (tx) => {
    const gestor = await tx.usuario.create({
      data: {
        nome: params.nome,
        email: params.email,
        senhaHash,
        papel,
      },
      select: { id: true, nome: true, email: true, papel: true, ativo: true },
    })

    await registrarLog(
      {
        autorId: params.autorId,
        acao: papel === "GESTOR" ? "GESTOR_CRIADO" : "SECRETARIA_CRIADA",
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

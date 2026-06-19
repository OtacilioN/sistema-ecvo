"use server"

import { revalidatePath } from "next/cache"
import { getUsuarioAtual } from "@/lib/auth/dal"
import { db } from "@/lib/db"

export async function acaoMarcarNotificacaoLida(formData: FormData) {
  const usuario = await getUsuarioAtual()
  const id = String(formData.get("id"))
  await db.notificacao.updateMany({
    where: { id, usuarioId: usuario.id },
    data: { lida: true },
  })
  revalidatePath("/gestao/notificacoes")
  revalidatePath("/professor/notificacoes")
  revalidatePath("/aluno/notificacoes")
}

export async function acaoMarcarTodasNotificacoesLidas() {
  const usuario = await getUsuarioAtual()
  await db.notificacao.updateMany({
    where: { usuarioId: usuario.id, lida: false },
    data: { lida: true },
  })
  revalidatePath("/gestao/notificacoes")
  revalidatePath("/professor/notificacoes")
  revalidatePath("/aluno/notificacoes")
}

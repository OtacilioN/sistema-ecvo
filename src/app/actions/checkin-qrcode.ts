"use server"

import { revalidatePath } from "next/cache"
import { exigirPapel } from "@/lib/auth/dal"
import { rotacionarTokenCheckinAcademia } from "@/lib/services/checkin-token.service"

export async function acaoRotacionarTokenCheckinAcademia() {
  const usuario = await exigirPapel("GESTOR")
  await rotacionarTokenCheckinAcademia({ autorId: usuario.id })
  revalidatePath("/gestao/checkin/qrcode")
  revalidatePath("/gestao/auditoria")
}

"use server"

import { redirect } from "next/navigation"
import { z } from "zod"
import {
  chaveChamadaValida,
  emitirPermissaoChamada,
  limparLocalizacaoChamada,
  localizacaoChamadaValida,
  ROTA_CHAMADA,
  temPermissaoChamada,
} from "@/lib/auth/chamada-rapida"

export type EstadoChamada = { erro?: string; localizacaoConfirmada?: boolean }

const localizacaoSchema = z.object({
  latitude: z.number().finite(),
  longitude: z.number().finite(),
  precisao: z.number().finite(),
  capturadaEm: z.number().finite(),
})

export async function confirmarLocalizacaoChamada(
  chave: string,
  dados: z.infer<typeof localizacaoSchema>,
): Promise<EstadoChamada> {
  if (!chaveChamadaValida(chave))
    return { erro: "Link de chamada inválido. Leia o QR Code da academia." }
  const validada = localizacaoSchema.safeParse(dados)
  if (!validada.success || !localizacaoChamadaValida(validada.data)) {
    return {
      erro: "É preciso estar a até 200 m da academia, com localização precisa. Tente novamente.",
    }
  }
  await emitirPermissaoChamada("localizacao")
  return { localizacaoConfirmada: true }
}

export async function liberarChamada(_: EstadoChamada, formData: FormData): Promise<EstadoChamada> {
  const chave = formData.get("acesso")
  if (!chaveChamadaValida(chave))
    return { erro: "Link de chamada inválido. Leia o QR Code da academia." }
  if (!(await temPermissaoChamada("localizacao"))) {
    return {
      erro: "Confirme sua localização novamente para continuar.",
      localizacaoConfirmada: false,
    }
  }
  if (formData.get("contrasenha") !== "combate") {
    return { erro: "Contra-senha incorreta.", localizacaoConfirmada: true }
  }
  await emitirPermissaoChamada("consulta")
  await limparLocalizacaoChamada()
  redirect(`${ROTA_CHAMADA}?acesso=${encodeURIComponent(chave)}`)
}

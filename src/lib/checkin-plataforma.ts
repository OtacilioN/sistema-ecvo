export type PlataformaCheckin = "WELLHUB" | "TOTALPASS"

export function plataformaCheckinDoTipo(
  tipoAluno: string | null | undefined,
): PlataformaCheckin | null {
  if (tipoAluno === "WELLHUB" || tipoAluno === "TOTALPASS") return tipoAluno
  return null
}

export function nomePlataformaCheckin(plataforma: PlataformaCheckin): string {
  return plataforma === "WELLHUB" ? "Wellhub" : "TotalPass"
}

export function textoConfirmacaoCheckinPlataforma(plataforma: PlataformaCheckin): string {
  return `Confirmo que já realizei o check-in no aplicativo ${nomePlataformaCheckin(plataforma)} primeiro`
}

export function mensagemConfirmacaoCheckinPlataforma(plataforma: PlataformaCheckin): string {
  return `Confirme que você já realizou o check-in no aplicativo ${nomePlataformaCheckin(plataforma)} primeiro.`
}

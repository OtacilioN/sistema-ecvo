import type { Prisma } from "@prisma/client"

/** Rateia em centavos, preservando exatamente a taxa do único recebimento. */
export function ratearTaxaMatriculaFamilia(taxa: number, quantidade: number): number[] {
  if (
    !Number.isInteger(quantidade) ||
    quantidade < 2 ||
    quantidade > 4 ||
    !Number.isFinite(taxa) ||
    taxa < 0
  ) {
    throw new Error("Rateio de matrícula família inválido.")
  }
  const centavos = Math.round(taxa * 100)
  const base = Math.floor(centavos / quantidade)
  return Array.from(
    { length: quantidade },
    (_, indice) => (base + (indice < centavos % quantidade ? 1 : 0)) / 100,
  )
}

export function snapshotPessoaMatriculaFamilia(
  snapshot: Prisma.JsonValue | null,
  solicitacaoId: string,
): Prisma.InputJsonValue {
  if (!Array.isArray(snapshot)) throw new Error("Snapshot da matrícula família ausente.")
  const itens = snapshot.filter(
    (item) =>
      item &&
      typeof item === "object" &&
      !Array.isArray(item) &&
      item.solicitacaoFamiliaId === solicitacaoId,
  )
  if (!itens.length) throw new Error("Snapshot do participante da matrícula família ausente.")
  return itens.map((item) => {
    const {
      solicitacaoFamiliaId: _,
      valorRepasseProfessorOriginal,
      ...registro
    } = item as Prisma.JsonObject
    return {
      ...registro,
      valorRepasseProfessor: valorRepasseProfessorOriginal ?? registro.valorRepasseProfessor,
    }
  }) as Prisma.InputJsonValue
}

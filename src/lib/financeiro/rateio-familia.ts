/** Rateia um valor em centavos conservando o total, com desempate estável pela ordem. */
export function ratearCentavos(total: number, pesos: number[]): number[] {
  if (
    !Number.isInteger(total) ||
    total < 0 ||
    pesos.some((peso) => !Number.isFinite(peso) || peso < 0)
  ) {
    throw new Error("Valor e pesos inválidos para rateio.")
  }
  const soma = pesos.reduce((acumulado, peso) => acumulado + peso, 0)
  if (soma === 0) {
    if (total !== 0) throw new Error("Um rateio positivo exige ao menos um peso positivo.")
    return pesos.map(() => 0)
  }
  const parcelas = pesos.map((peso) => (total * peso) / soma)
  const resultado = parcelas.map(Math.floor)
  const ordem = parcelas
    .map((parcela, indice) => ({ indice, resto: parcela - resultado[indice] }))
    .sort((a, b) => b.resto - a.resto || a.indice - b.indice)
  const restantes = total - resultado.reduce((acumulado, parcela) => acumulado + parcela, 0)
  for (let indice = 0; indice < restantes; indice++) resultado[ordem[indice].indice]++
  return resultado
}

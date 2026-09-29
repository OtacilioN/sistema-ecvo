const PONTOS_BASE_TAXA_ASAAS = 199

/** Calcula 1,99% do valor recebido, arredondando a taxa para centavos. */
export function calcularTaxaAsaas(valor: number): number {
  if (!Number.isFinite(valor) || valor < 0) {
    throw new Error("Valor para cálculo da taxa Asaas deve ser não negativo.")
  }

  const valorCentavos = Math.round(valor * 100)
  const taxaCentavos = Math.round((valorCentavos * PONTOS_BASE_TAXA_ASAAS) / 10_000)
  return Number((taxaCentavos / 100).toFixed(2))
}

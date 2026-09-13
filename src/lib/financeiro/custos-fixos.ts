import { z } from "zod"

export const CUSTOS_FIXOS_PADRAO = {
  aluguel: 2200,
  energia: 150,
  agua: 120,
  internet: 90,
  limpeza: 80,
  outros: 0,
} as const

export type ValoresCustosFixos = Record<keyof typeof CUSTOS_FIXOS_PADRAO, number>

export const CAMPOS_CUSTOS_FIXOS = [
  { nome: "aluguel", rotulo: "Aluguel" },
  { nome: "energia", rotulo: "Energia" },
  { nome: "agua", rotulo: "Água" },
  { nome: "internet", rotulo: "Internet" },
  { nome: "limpeza", rotulo: "Limpeza" },
  { nome: "outros", rotulo: "Outros custos" },
] as const

export const competenciaCustosFixosSchema = z
  .string()
  .regex(/^(?!0000)\d{4}-(0[1-9]|1[0-2])$/, "Informe uma competência válida (AAAA-MM).")

const valorCustoSchema = z
  .number({ error: "Informe um valor numérico válido." })
  .min(0, "O custo não pode ser negativo.")
  .max(9999999999.99, "O custo deve ser de até R$ 9.999.999.999,99.")
  // Comparar o valor decimal evita rejeitar centavos válidos, como 1,01, por erro binário.
  .refine((valor) => Number(valor.toFixed(2)) === valor, "Informe no máximo duas casas decimais.")

export const custosFixosMensaisSchema = z.object({
  competencia: competenciaCustosFixosSchema,
  aluguel: valorCustoSchema,
  energia: valorCustoSchema,
  agua: valorCustoSchema,
  internet: valorCustoSchema,
  limpeza: valorCustoSchema,
  outros: valorCustoSchema,
})

export type CustosFixosMensaisInput = z.infer<typeof custosFixosMensaisSchema>

export function totalizarCustosFixos(valores: ValoresCustosFixos): number {
  return (
    CAMPOS_CUSTOS_FIXOS.reduce((total, { nome }) => total + Math.round(valores[nome] * 100), 0) /
    100
  )
}

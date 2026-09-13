import { z } from "zod"

export const COMPETENCIA_INICIO_OUTRAS_RECEITAS = "2026-09"

export const CAMPOS_OUTRAS_RECEITAS = [
  { nome: "aluguelHorario", rotulo: "Aluguel de horário" },
  { nome: "outros", rotulo: "Outros" },
] as const

export type ValoresOutrasReceitas = Record<(typeof CAMPOS_OUTRAS_RECEITAS)[number]["nome"], number>

export const competenciaOutrasReceitasSchema = z
  .string()
  .regex(/^(?!0000)\d{4}-(0[1-9]|1[0-2])$/, "Informe uma competência válida (AAAA-MM).")

const valorReceitaSchema = z
  .number({ error: "Informe um valor numérico válido." })
  .min(0, "A receita não pode ser negativa.")
  .max(9999999999.99, "A receita deve ser de até R$ 9.999.999.999,99.")
  .refine((valor) => Number(valor.toFixed(2)) === valor, "Informe no máximo duas casas decimais.")

export const outrasReceitasMensaisSchema = z.object({
  competencia: competenciaOutrasReceitasSchema,
  aluguelHorario: valorReceitaSchema,
  outros: valorReceitaSchema,
})

export type OutrasReceitasMensaisInput = z.infer<typeof outrasReceitasMensaisSchema>

export function obterOutrasReceitasPadrao(competencia: string): ValoresOutrasReceitas {
  competenciaOutrasReceitasSchema.parse(competencia)
  return {
    aluguelHorario: competencia >= COMPETENCIA_INICIO_OUTRAS_RECEITAS ? 500 : 0,
    outros: 0,
  }
}

export function totalizarOutrasReceitas(valores: ValoresOutrasReceitas): number {
  return (
    CAMPOS_OUTRAS_RECEITAS.reduce((total, { nome }) => total + Math.round(valores[nome] * 100), 0) /
    100
  )
}

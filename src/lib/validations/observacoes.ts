import { z } from "zod"

export const observacaoTecnicaSchema = z.object({
  alunoId: z.string().min(1, "Selecione o aluno"),
  aulaId: z.string().min(1, "Selecione a aula"),
  observacoesTecnicas: z
    .string()
    .trim()
    .max(2000, "Use no máximo 2000 caracteres")
    .transform((valor) => (valor.length > 0 ? valor : null)),
})

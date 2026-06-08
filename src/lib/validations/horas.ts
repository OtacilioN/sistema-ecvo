import { z } from "zod"

export const ajusteManualHorasSchema = z.object({
  alunoId: z.string().min(1, "Selecione o aluno"),
  modalidadeId: z.string().min(1, "Selecione a modalidade"),
  minutos: z.coerce
    .number()
    .int("Informe minutos inteiros")
    .refine((valor) => valor !== 0, "Informe uma quantidade diferente de zero"),
  motivo: z.string().trim().min(5, "Informe o motivo do ajuste"),
})

export const lancamentoAvulsoHorasProfessorSchema = z.object({
  alunoId: z.string().min(1, "Selecione o aluno"),
  modalidadeId: z.string().min(1, "Selecione a modalidade"),
  minutos: z.coerce
    .number()
    .int("Informe minutos inteiros")
    .positive("Informe uma quantidade maior que zero"),
  motivo: z.string().trim().min(5, "Informe o motivo do lançamento"),
})

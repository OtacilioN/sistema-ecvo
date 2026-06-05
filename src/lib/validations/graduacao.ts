import { z } from "zod"

const textoOpcional = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v && v.length > 0 ? v : null))

export const registrarGraduacaoSchema = z.object({
  alunoId: z.string().min(1, "Selecione o aluno"),
  graduacaoId: z.string().min(1, "Selecione a nova graduação"),
  observacao: textoOpcional,
  anexoUrl: textoOpcional,
})

export const criarExameSchema = z.object({
  modalidadeId: z.string().min(1, "Selecione a modalidade"),
  data: z.coerce.date(),
  descricao: textoOpcional,
  taxa: z.coerce.number().nonnegative().optional().nullable(),
})

export const inscreverExameSchema = z.object({
  exameId: z.string().min(1, "Selecione o exame"),
})

export const registrarResultadoExameSchema = z.object({
  inscricaoExameId: z.string().min(1, "Selecione a inscrição"),
  aprovado: z.enum(["APROVADO", "REPROVADO", "PENDENTE"]).transform((valor) => {
    if (valor === "APROVADO") return true
    if (valor === "REPROVADO") return false
    return null
  }),
  novaGraduacaoId: textoOpcional,
  resultado: textoOpcional,
})

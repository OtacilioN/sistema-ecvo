import { z } from "zod"

const textoOpcional = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v && v.length > 0 ? v : null))

export const planoSchema = z.object({
  nome: z.string().trim().min(2, "Informe o nome do plano"),
  valor: z.coerce.number().positive("Informe o valor"),
  periodicidade: z.enum(["MENSAL", "TRIMESTRAL", "SEMESTRAL", "ANUAL"]),
  diaVencimento: z.coerce.number().int().min(1).max(28),
  limiteAulas: z.coerce.number().int().positive().optional().nullable(),
  modalidadeIds: z.array(z.string()).min(1, "Selecione ao menos uma modalidade"),
})

export const vinculoPlanoSchema = z.object({
  alunoId: z.string().min(1, "Selecione o aluno"),
  planoId: z.string().min(1, "Selecione o plano"),
})

export const gerarMensalidadeSchema = z.object({
  alunoId: z.string().min(1, "Selecione o aluno"),
  competencia: z.string().regex(/^\d{4}-\d{2}$/, "Competência inválida"),
})

export const baixarMensalidadeSchema = z.object({
  mensalidadeId: z.string().min(1, "Selecione a mensalidade"),
  formaPagamento: textoOpcional,
  observacao: textoOpcional,
})

export const statusMensalidadeSchema = z.object({
  mensalidadeId: z.string().min(1, "Selecione a mensalidade"),
  status: z.enum(["EM_ABERTO", "PAGA", "VENCIDA", "CANCELADA", "ISENTA"]),
  formaPagamento: textoOpcional,
  observacao: textoOpcional,
})

export const pagamentoAvulsoSchema = z.object({
  alunoId: textoOpcional,
  tipo: z.enum(["AULA_UNICA", "DIARIA", "PACOTE", "SEMINARIO", "EVENTO", "EXAME", "PRODUTO"]),
  valor: z.coerce.number().positive("Informe o valor"),
  descricao: textoOpcional,
  formaPagamento: textoOpcional,
})

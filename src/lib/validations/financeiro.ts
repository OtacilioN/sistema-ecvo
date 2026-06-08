import { z } from "zod"

const textoOpcional = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v && v.length > 0 ? v : null))

const diaVencimentoSchema = z.preprocess(
  (v) => (v === "" || v === null || v === undefined ? 10 : v),
  z.coerce.number().int().min(1, "Informe um dia entre 1 e 28").max(28),
)

export const planoSchema = z.object({
  nome: z.string().trim().min(2, "Informe o nome do plano"),
  valor: z.coerce.number().positive("Informe o valor"),
  periodicidade: z.enum(["MENSAL", "TRIMESTRAL", "SEMESTRAL", "ANUAL"]),
  limiteAulas: z.coerce.number().int().positive().optional().nullable(),
})

export const planoEdicaoSchema = planoSchema.extend({
  planoId: z.string().min(1, "Selecione o plano"),
  ativo: z.enum(["true", "false"]).transform((v) => v === "true"),
})

export const vinculoPlanoSchema = z.object({
  alunoId: z.string().min(1, "Selecione o aluno"),
  planoId: z.string().min(1, "Selecione o plano"),
  diaVencimento: diaVencimentoSchema,
  modalidadeIds: z.array(z.string()).min(1, "Selecione ao menos uma modalidade contratada"),
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

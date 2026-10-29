import { z } from "zod"

const textoOpcional = z
  .preprocess((v) => (v === null ? undefined : v), z.string().trim().optional())
  .transform((v) => (v && v.length > 0 ? v : null))

const diaVencimentoSchema = z.preprocess(
  (v) => (v === "" || v === null || v === undefined ? 10 : v),
  z.coerce.number().int().min(1, "Informe um dia entre 1 e 28").max(28),
)

const quantidadeModalidadesMatriculaSchema = z.preprocess(
  (v) => (v === "" || v === null || v === undefined ? null : v),
  z.coerce.number().int().min(1).max(3).nullable(),
)

const planoCamposSchema = z.object({
  nome: z.string().trim().min(2, "Informe o nome do plano"),
  valor: z.coerce.number().positive("Informe o valor"),
  valorBase: z.coerce.number().positive("Informe o valor base"),
  periodicidade: z.enum(["MENSAL", "TRIMESTRAL", "SEMESTRAL", "ANUAL"]),
  limiteAulas: z.coerce.number().int().positive().optional().nullable(),
  quantidadeModalidadesMatricula: quantidadeModalidadesMatriculaSchema,
  padrao: z.preprocess((valor) => valor === "on" || valor === true, z.boolean()),
})

const precosPlanoValidos = (plano: { valor: number; valorBase: number }) =>
  plano.valorBase >= plano.valor
const erroPrecosPlano = {
  message: "O valor base deve ser maior ou igual ao valor com desconto.",
  path: ["valorBase"],
}

export const planoSchema = planoCamposSchema.refine(precosPlanoValidos, erroPrecosPlano)

export const planoEdicaoSchema = planoCamposSchema
  .extend({
    planoId: z.string().min(1, "Selecione o plano"),
    ativo: z.enum(["true", "false"]).transform((v) => v === "true"),
  })
  .refine(precosPlanoValidos, erroPrecosPlano)

export const planoExclusaoSchema = z
  .object({
    planoId: z.string().min(1, "Selecione o plano"),
    planoDestinoId: textoOpcional,
  })
  .refine((dados) => dados.planoId !== dados.planoDestinoId, {
    message: "Escolha um plano de destino diferente.",
    path: ["planoDestinoId"],
  })

export const vinculoPlanoSchema = z.object({
  alunoId: z.string().min(1, "Selecione o aluno"),
  planoId: z.string().min(1, "Selecione o plano"),
  diaVencimento: diaVencimentoSchema,
  modalidadeIds: z.array(z.string()).min(1, "Selecione ao menos uma modalidade contratada"),
})

const confirmacaoCancelamentoPixAutomaticoSchema = z.preprocess(
  (valor) => valor === "on" || valor === true,
  z.boolean(),
)

export const baixarMensalidadeSchema = z.object({
  mensalidadeId: z.string().min(1, "Selecione a mensalidade"),
  formaPagamento: textoOpcional,
  observacao: textoOpcional,
  confirmarCancelamentoPixAutomatico: confirmacaoCancelamentoPixAutomaticoSchema,
})

export const baixaMensalidadeAlunoSchema = z.object({
  alunoId: z.string().min(1, "Selecione o aluno"),
  competencia: z.string().regex(/^\d{4}-\d{2}$/, "Competência inválida"),
  formaPagamento: textoOpcional,
  observacao: textoOpcional,
  confirmarCancelamentoPixAutomatico: confirmacaoCancelamentoPixAutomaticoSchema,
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

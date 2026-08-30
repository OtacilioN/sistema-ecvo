import { z } from "zod"
import { dataCivilParaDate, fimExclusivoDoDiaAcademia } from "@/lib/utils/datas"
import { cpfValido } from "@/lib/utils/formato"

const textoOpcional = (maximo: number) =>
  z
    .string()
    .trim()
    .max(maximo, `Use no máximo ${maximo} caracteres`)
    .optional()
    .transform((valor) => (valor ? valor : null))

const cpfOpcional = z
  .string()
  .trim()
  .optional()
  .transform((valor) => (valor ? valor.replace(/\D/g, "") : null))
  .refine((valor) => valor === null || cpfValido(valor), "CPF inválido")

const dataCivilOpcional = z.preprocess((valor) => {
  if (valor === "" || valor === null || valor === undefined) return null
  return typeof valor === "string" ? dataCivilParaDate(valor) : valor
}, z.date().nullable())

const dataPagamento = z
  .preprocess((valor) => {
    if (typeof valor === "string" && valor.length > 0) return dataCivilParaDate(valor)
    return valor
  }, z.date("Informe a data do pagamento"))
  .refine(
    (data) => data.getTime() < fimExclusivoDoDiaAcademia(new Date()).getTime(),
    "A data do pagamento não pode estar no futuro",
  )

export const solicitacaoMatriculaSchema = z
  .object({
    nome: z.string().trim().min(2, "Informe seu nome completo").max(120),
    email: z.email("Informe um e-mail válido").trim().toLowerCase().max(254),
    senha: z
      .string()
      .min(6, "A senha deve ter no mínimo 6 caracteres")
      .max(72, "A senha deve ter no máximo 72 caracteres"),
    confirmarSenha: z.string().min(1, "Confirme sua senha"),
    cpf: cpfOpcional,
    telefone: textoOpcional(40),
    dataNascimento: dataCivilOpcional,
    endereco: textoOpcional(300),
    contatoEmergencia: textoOpcional(120),
    restricoesMedicas: textoOpcional(1000),
    modalidadeId: z.string().min(1, "Selecione uma modalidade"),
    aceiteDados: z.literal("on", { error: "Confirme o envio dos dados para análise" }),
  })
  .refine((dados) => dados.senha === dados.confirmarSenha, {
    message: "As senhas não conferem",
    path: ["confirmarSenha"],
  })

export type SolicitacaoMatriculaInput = z.infer<typeof solicitacaoMatriculaSchema>

export const aprovacaoMatriculaSchema = z
  .object({
    solicitacaoId: z.string().min(1, "Matrícula inválida"),
    planoId: z.string().min(1, "Selecione um plano de pagamento"),
    diaVencimento: z.coerce
      .number()
      .int()
      .min(1, "Informe um dia entre 1 e 28")
      .max(28, "Informe um dia entre 1 e 28"),
    comprovanteConfirmado: z.boolean(),
    competenciaEsperada: z.string().regex(/^\d{4}-\d{2}$/, "Competência inválida"),
    pagoEm: z.union([dataPagamento, z.null()]),
  })
  .superRefine((dados, ctx) => {
    if (dados.comprovanteConfirmado && !dados.pagoEm) {
      ctx.addIssue({
        code: "custom",
        path: ["pagoEm"],
        message: "Informe a data do pagamento confirmado",
      })
    }
  })

export type AprovacaoMatriculaInput = z.infer<typeof aprovacaoMatriculaSchema>

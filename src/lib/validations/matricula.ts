import { z } from "zod"
import { dataCivilParaDate } from "@/lib/utils/datas"
import { cpfValido } from "@/lib/utils/formato"

const textoOpcional = (maximo: number) =>
  z
    .string()
    .trim()
    .max(maximo, `Use no máximo ${maximo} caracteres`)
    .optional()
    .transform((valor) => (valor ? valor : null))

const cpfObrigatorio = z
  .string()
  .trim()
  .min(1, "Informe seu CPF")
  .transform((valor) => valor.replace(/\D/g, ""))
  .refine(cpfValido, "CPF inválido")

const dataCivilOpcional = z.preprocess((valor) => {
  if (valor === "" || valor === null || valor === undefined) return null
  return typeof valor === "string" ? dataCivilParaDate(valor) : valor
}, z.date().nullable())

const declaracaoCheckbox = z.preprocess((valor) => valor === true || valor === "on", z.boolean())

export const solicitacaoMatriculaSchema = z
  .object({
    nome: z.string().trim().min(2, "Informe seu nome completo").max(120),
    email: z.email("Informe um e-mail válido").trim().toLowerCase().max(254),
    senha: z
      .string()
      .min(6, "A senha deve ter no mínimo 6 caracteres")
      .max(72, "A senha deve ter no máximo 72 caracteres"),
    confirmarSenha: z.string().min(1, "Confirme sua senha"),
    cpf: cpfObrigatorio,
    telefone: textoOpcional(40),
    dataNascimento: dataCivilOpcional,
    endereco: textoOpcional(300),
    contatoEmergencia: textoOpcional(120),
    restricoesMedicas: textoOpcional(1000),
    modalidadeId: z.string().min(1, "Selecione uma modalidade"),
    tipoPagamento: z.enum(["MENSALISTA", "WELLHUB", "TOTALPASS"]),
    beneficioAtivoDeclarado: declaracaoCheckbox,
    aceiteDados: z.literal("on", { error: "Confirme o envio dos dados para análise" }),
  })
  .superRefine((dados, ctx) => {
    if (dados.senha !== dados.confirmarSenha) {
      ctx.addIssue({
        code: "custom",
        message: "As senhas não conferem",
        path: ["confirmarSenha"],
      })
    }
    if (dados.tipoPagamento === "WELLHUB" && !dados.beneficioAtivoDeclarado) {
      ctx.addIssue({
        code: "custom",
        message: "Declare que seu Wellhub está ativo a partir do plano Basic",
        path: ["beneficioAtivoDeclarado"],
      })
    }
    if (dados.tipoPagamento === "TOTALPASS" && !dados.beneficioAtivoDeclarado) {
      ctx.addIssue({
        code: "custom",
        message: "Declare que seu TotalPass está ativo a partir do plano TP1+",
        path: ["beneficioAtivoDeclarado"],
      })
    }
    if (dados.tipoPagamento === "MENSALISTA" && dados.beneficioAtivoDeclarado) {
      ctx.addIssue({
        code: "custom",
        message: "A declaração de benefício não se aplica à matrícula mensalista",
        path: ["beneficioAtivoDeclarado"],
      })
    }
  })

export type SolicitacaoMatriculaInput = z.infer<typeof solicitacaoMatriculaSchema>

export const aprovacaoMatriculaSchema = z.object({
  solicitacaoId: z.string().min(1, "Matrícula inválida"),
  diaVencimento: z.coerce
    .number()
    .int()
    .min(1, "Informe um dia entre 1 e 28")
    .max(28, "Informe um dia entre 1 e 28")
    .optional(),
})

export type AprovacaoMatriculaInput = z.infer<typeof aprovacaoMatriculaSchema>

export const rejeicaoMatriculaSchema = z.object({
  solicitacaoId: z.string().min(1, "Matrícula inválida"),
  justificativa: z
    .string()
    .trim()
    .min(5, "Informe uma justificativa de pelo menos 5 caracteres")
    .max(1000, "Use no máximo 1000 caracteres"),
})

export type RejeicaoMatriculaInput = z.infer<typeof rejeicaoMatriculaSchema>

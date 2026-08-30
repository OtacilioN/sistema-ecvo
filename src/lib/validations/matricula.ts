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
    aceiteDados: z.literal("on", { error: "Confirme o envio dos dados para análise" }),
  })
  .refine((dados) => dados.senha === dados.confirmarSenha, {
    message: "As senhas não conferem",
    path: ["confirmarSenha"],
  })

export type SolicitacaoMatriculaInput = z.infer<typeof solicitacaoMatriculaSchema>

export const aprovacaoMatriculaSchema = z.object({
  solicitacaoId: z.string().min(1, "Matrícula inválida"),
  diaVencimento: z.coerce
    .number()
    .int()
    .min(1, "Informe um dia entre 1 e 28")
    .max(28, "Informe um dia entre 1 e 28"),
})

export type AprovacaoMatriculaInput = z.infer<typeof aprovacaoMatriculaSchema>

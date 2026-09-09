import { z } from "zod"
import { dataCivilParaDate, inicioDoDiaAcademia } from "@/lib/utils/datas"
import { cpfValido, interpretarBRL } from "@/lib/utils/formato"

const somenteDigitos = (valor: string) => valor.replace(/\D/g, "")

const cpfSchema = z
  .string()
  .trim()
  .min(1, "Informe seu CPF")
  .transform(somenteDigitos)
  .refine(cpfValido, "CPF inválido")

const celularSchema = z
  .string()
  .trim()
  .min(1, "Informe seu celular")
  .transform(somenteDigitos)
  .refine((valor) => valor.length === 10 || valor.length === 11, "Celular inválido")

const cepSchema = z
  .string()
  .trim()
  .min(1, "Informe seu CEP")
  .transform(somenteDigitos)
  .refine((valor) => valor.length === 8, "CEP inválido")

const dataNascimentoSchema = z
  .preprocess(
    (valor) =>
      typeof valor === "string" && /^\d{4}-\d{2}-\d{2}$/.test(valor)
        ? dataCivilParaDate(valor)
        : valor,
    z.date("Informe sua data de nascimento"),
  )
  .refine(
    (data) => data.getTime() < inicioDoDiaAcademia(new Date()).getTime(),
    "A data de nascimento deve estar no passado",
  )

const textoObrigatorio = (rotulo: string, max: number) =>
  z.string().trim().min(1, `Informe ${rotulo}`).max(max, `${rotulo} muito longo`)

const textoOpcional = z
  .preprocess(
    (valor) => (valor === null ? undefined : valor),
    z.string().trim().max(120).optional(),
  )
  .transform((valor) => (valor ? valor : null))

export const contaAsaasProfessorSchema = z.object({
  nomeTitular: textoObrigatorio("seu nome completo", 120),
  emailContaAsaas: z.email("Informe um e-mail válido").trim().toLowerCase().max(254),
  cpfCnpj: cpfSchema,
  dataNascimento: dataNascimentoSchema,
  celular: celularSchema,
  rendaMensal: z.preprocess(
    interpretarBRL,
    z
      .number("Informe sua renda mensal")
      .positive("A renda mensal deve ser maior que zero")
      .max(100_000_000, "Renda mensal inválida"),
  ),
  logradouro: textoObrigatorio("seu logradouro", 200),
  numeroEndereco: textoObrigatorio("o número do endereço", 20),
  complemento: textoOpcional,
  bairro: textoObrigatorio("seu bairro", 100),
  cep: cepSchema,
  consentimento: z.literal("on", {
    error: "Autorize o envio dos dados ao Asaas para criar sua conta",
  }),
})

export type ContaAsaasProfessorInput = z.infer<typeof contaAsaasProfessorSchema>

import { z } from "zod"
import { solicitacaoMatriculaSchema } from "./matricula"

// Permite validar novamente na borda do serviço os dados já normalizados pela action.
const pessoaFamiliaSchema = z.preprocess((entrada) => {
  if (!entrada || typeof entrada !== "object" || Array.isArray(entrada)) return entrada
  const pessoa = { ...entrada } as Record<string, unknown>
  for (const campo of ["telefone", "endereco", "contatoEmergencia", "restricoesMedicas"]) {
    if (pessoa[campo] === null) pessoa[campo] = undefined
  }
  if (typeof pessoa.email === "string") pessoa.email = pessoa.email.trim().toLowerCase()
  return pessoa
}, solicitacaoMatriculaSchema)

export const solicitacaoMatriculaFamiliaSchema = z
  .object({
    pessoas: z
      .array(pessoaFamiliaSchema)
      .min(2, "O plano família exige pelo menos 2 pessoas")
      .max(4, "O plano família permite no máximo 4 pessoas"),
  })
  .superRefine(({ pessoas }, ctx) => {
    const emails = new Set<string>()
    const cpfs = new Set<string>()
    pessoas.forEach((pessoa, indice) => {
      if (pessoa.tipoPagamento !== "MENSALISTA") {
        ctx.addIssue({
          code: "custom",
          message: "O plano família é uma matrícula mensalista",
          path: ["pessoas", indice, "tipoPagamento"],
        })
      }
      if (pessoa.modalidadeIds.length !== 1) {
        ctx.addIssue({
          code: "custom",
          message: "Selecione uma modalidade para cada pessoa do plano família",
          path: ["pessoas", indice, "modalidadeIds"],
        })
      }
      if (emails.has(pessoa.email)) {
        ctx.addIssue({
          code: "custom",
          message: "Cada pessoa deve informar um e-mail diferente",
          path: ["pessoas", indice, "email"],
        })
      }
      if (cpfs.has(pessoa.cpf)) {
        ctx.addIssue({
          code: "custom",
          message: "Cada pessoa deve informar um CPF diferente",
          path: ["pessoas", indice, "cpf"],
        })
      }
      emails.add(pessoa.email)
      cpfs.add(pessoa.cpf)
    })
  })

export type SolicitacaoMatriculaFamiliaInput = z.infer<typeof solicitacaoMatriculaFamiliaSchema>

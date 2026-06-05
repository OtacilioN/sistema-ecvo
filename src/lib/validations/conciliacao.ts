import { z } from "zod"

const textoOpcional = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v && v.length > 0 ? v : null))

export const importarConciliacaoSchema = z.object({
  plataforma: z.enum(["WELLHUB", "TOTALPASS"]),
})

export const resolverConciliacaoSchema = z.object({
  registroId: z.string().min(1, "Selecione o registro"),
  alunoId: textoOpcional,
  checkinId: textoOpcional,
  status: z.enum([
    "CONCILIADO",
    "NAO_ENCONTRADO",
    "ALUNO_NAO_IDENTIFICADO",
    "DIVERGENCIA_DATA",
    "DIVERGENCIA_HORARIO",
    "CHECKIN_INVALIDADO",
    "DUPLICADO_PLANILHA",
    "DUPLICADO_SISTEMA",
    "PENDENTE",
  ]),
  observacao: textoOpcional,
})

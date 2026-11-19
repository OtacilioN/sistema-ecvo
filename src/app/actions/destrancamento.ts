"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"
import { exigirPapel } from "@/lib/auth/dal"
import { destrancarAlunoComPagamentoManual } from "@/lib/services/destrancamento-manual.service"
import { chaveCompetencia, dataCivilParaDate, formatarDataInput } from "@/lib/utils/datas"

export type EstadoDestrancamento = { erro?: string; ok?: boolean } | undefined

const destrancamentoSchema = z.object({
  alunoId: z.string().trim().min(1, "Aluno não informado."),
  competencia: z
    .string()
    .regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Competência inválida.")
    .refine((valor) => valor === chaveCompetencia(), "Informe a competência atual."),
  valor: z.coerce
    .number()
    .positive("Informe um valor recebido maior que zero.")
    .refine(
      (valor) => Math.abs(valor * 100 - Math.round(valor * 100)) < 0.000001,
      "Informe o valor com até duas casas decimais.",
    ),
  pagoEm: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Informe a data do pagamento.")
    .refine((valor) => {
      const data = dataCivilParaDate(valor)
      return !Number.isNaN(data.getTime()) && formatarDataInput(data) === valor
    }, "Data do pagamento inválida.")
    .refine(
      (valor) => valor.slice(0, 7) === chaveCompetencia(),
      "O pagamento deve ter ocorrido na competência atual.",
    )
    .refine(
      (valor) => valor <= formatarDataInput(new Date()),
      "A data do pagamento não pode ser futura.",
    )
    .transform(dataCivilParaDate),
  formaPagamento: z.enum(["PIX", "DINHEIRO", "CARTAO", "TRANSFERENCIA", "OUTRO", "MANUAL"], {
    error: "Selecione uma forma de pagamento válida.",
  }),
  observacao: z
    .string()
    .trim()
    .min(1, "Descreva o pagamento para registrar o destrancamento.")
    .max(2000, "A observação deve ter até 2.000 caracteres."),
})

export async function acaoDestrancarAlunoComPagamento(
  _: EstadoDestrancamento,
  formData: FormData,
): Promise<EstadoDestrancamento> {
  const usuario = await exigirPapel("GESTOR")
  const parsed = destrancamentoSchema.safeParse({
    alunoId: formData.get("alunoId"),
    competencia: formData.get("competencia"),
    valor: formData.get("valor"),
    pagoEm: formData.get("pagoEm"),
    formaPagamento: formData.get("formaPagamento") || "MANUAL",
    observacao: formData.get("observacao"),
  })
  if (!parsed.success) return { erro: parsed.error.issues[0]?.message ?? "Dados inválidos." }

  const resultado = await destrancarAlunoComPagamentoManual({
    ...parsed.data,
    autorId: usuario.id,
  })
  if (!resultado.ok) return { erro: resultado.motivo }

  revalidatePath("/gestao/alunos")
  revalidatePath("/gestao/financeiro")
  revalidatePath("/gestao/auditoria")
  revalidatePath("/aluno", "layout")
  revalidatePath("/reativar-matricula")
  return { ok: true }
}

import { z } from "zod"

export const configuracaoAcademiaSchema = z.object({
  janelaComparecimentoHoras: z.coerce.number().int().min(0).max(168),
  prazoCancelamentoHoras: z.coerce.number().int().min(0).max(168),
  exigirComparecimentoParaCheckin: z.boolean(),
  politicaCheckinSemComparecimento: z.enum(["PERMITIR", "BLOQUEAR", "APENAS_COM_APROVACAO"]),
  bloqueioInadimplencia: z.enum([
    "APENAS_ALERTAR",
    "BLOQUEAR_COMPARECIMENTO",
    "BLOQUEAR_CHECKIN",
    "SEM_BLOQUEIO",
  ]),
  listaEsperaAtiva: z.boolean(),
  rankingHorasAtivo: z.boolean(),
  notificarComparecimento: z.boolean(),
  notificarLembreteTreino: z.boolean(),
  notificarLembreteAgendamento: z.boolean(),
  notificarCancelamentoAula: z.boolean(),
  notificarFinanceiro: z.boolean(),
  notificarGraduacao: z.boolean(),
  notificarCheckinInvalidado: z.boolean(),
  notificarAniversario: z.boolean(),
  valorBaseModalidade: z.coerce.number().positive("Informe o valor base por modalidade"),
})

export type ConfiguracaoAcademiaForm = z.infer<typeof configuracaoAcademiaSchema>

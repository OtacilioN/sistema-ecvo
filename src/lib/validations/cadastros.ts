import { z } from "zod"
import { STATUS_ALUNO } from "@/lib/alunos/status"
import { fotoPathnameDeUrl, pathnameFotoValido } from "@/lib/fotos"
import { dataCivilParaDate } from "@/lib/utils/datas"
import { cpfValido } from "@/lib/utils/formato"

// Schemas de validação dos cadastros da Fase 1 (RF-001..012).

const cpfOpcional = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v ? v.replace(/\D/g, "") : undefined))
  .refine((v) => v === undefined || v === "" || cpfValido(v), "CPF inválido")
  .transform((v) => (v ? v : null))

const textoOpcional = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v && v.length > 0 ? v : null))

const idOpcional = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v && v.length > 0 ? v : null))

const fotoUrlOpcional = z
  .union([
    z.url("Informe uma URL válida"),
    z.string().refine((url) => {
      const pathname = fotoPathnameDeUrl(url)
      return Boolean(pathname && pathnameFotoValido(pathname))
    }, "Informe uma foto válida"),
    z.literal(""),
    z.null(),
    z.undefined(),
  ])
  .transform((v) => (typeof v === "string" && v.length > 0 ? v : null))

const emailOpcional = z
  .union([z.email("E-mail inválido").trim().toLowerCase(), z.literal(""), z.null(), z.undefined()])
  .transform((v) => (typeof v === "string" && v.length > 0 ? v : null))

const diaVencimentoSchema = z.preprocess(
  (v) => (v === "" || v === null || v === undefined ? 10 : v),
  z.coerce.number().int().min(1, "Informe um dia entre 1 e 28").max(28),
)

const dataCivilOpcional = z.preprocess((v) => {
  if (v === "" || v === null || v === undefined) return undefined
  if (typeof v === "string") return dataCivilParaDate(v)
  return v
}, z.date().optional())

const numeroInteiroOpcional = (min: number, max?: number) =>
  z
    .preprocess(
      (v) => (v === "" || v === null || v === undefined ? undefined : v),
      z.coerce
        .number()
        .int()
        .min(min)
        .max(max ?? Number.MAX_SAFE_INTEGER)
        .optional(),
    )
    .transform((v) => v ?? null)

export const modalidadeSchema = z.object({
  nome: z.string().trim().min(2, "Informe o nome da modalidade"),
  descricao: textoOpcional,
  duracaoPadraoMin: z.coerce.number().int().min(15, "Mínimo de 15 minutos").max(480),
})
export type ModalidadeInput = z.infer<typeof modalidadeSchema>

export const graduacaoCatalogoSchema = z.object({
  id: textoOpcional,
  nome: z.string().trim().min(2, "Informe o nome da graduação"),
  ordem: z.coerce.number().int().min(0, "Ordem inválida"),
  minHoras: numeroInteiroOpcional(0),
  minFrequencia: numeroInteiroOpcional(0, 100),
  minTempoNoGrauDias: numeroInteiroOpcional(0),
  remover: z.boolean().default(false),
})
export type GraduacaoCatalogoInput = z.infer<typeof graduacaoCatalogoSchema>

export const graduacoesCatalogoSchema = z
  .array(graduacaoCatalogoSchema)
  .superRefine((graduacoes, ctx) => {
    const nomes = new Set<string>()
    for (const [index, graduacao] of graduacoes.entries()) {
      if (graduacao.remover) continue

      const nome = graduacao.nome.toLowerCase()
      if (nomes.has(nome)) {
        ctx.addIssue({
          code: "custom",
          message: "Não repita nomes de graduação na mesma modalidade.",
          path: [index, "nome"],
        })
      }
      nomes.add(nome)
    }
  })

export const dadosModalidadeSchema = modalidadeSchema.extend({
  modalidadeId: z.string().min(1, "Selecione a modalidade"),
  ativa: z.enum(["true", "false"]).transform((valor) => valor === "true"),
})
export type DadosModalidadeInput = z.infer<typeof dadosModalidadeSchema>

const booleanOverride = z
  .enum(["HERDAR", "true", "false"])
  .transform((valor) => (valor === "HERDAR" ? null : valor === "true"))

const politicaCheckinOverride = z
  .enum(["HERDAR", "PERMITIR", "BLOQUEAR", "APENAS_COM_APROVACAO"])
  .transform((valor) => (valor === "HERDAR" ? null : valor))

export const regrasModalidadeSchema = z.object({
  modalidadeId: z.string().min(1, "Selecione a modalidade"),
  janelaComparecimentoHoras: numeroInteiroOpcional(0, 168),
  prazoCancelamentoHoras: numeroInteiroOpcional(0, 168),
  exigirComparecimentoParaCheckin: booleanOverride,
  politicaCheckinSemComparecimento: politicaCheckinOverride,
  listaEsperaAtiva: booleanOverride,
})
export type RegrasModalidadeInput = z.infer<typeof regrasModalidadeSchema>

export const graduacaoModalidadeSchema = z.object({
  modalidadeId: z.string().min(1, "Selecione a modalidade"),
  nome: z.string().trim().min(2, "Informe o nome da graduação"),
  ordem: z.coerce.number().int().min(0, "Ordem inválida").default(0),
  minHoras: numeroInteiroOpcional(0),
  minFrequencia: numeroInteiroOpcional(0, 100),
  minTempoNoGrauDias: numeroInteiroOpcional(0),
})
export type GraduacaoModalidadeInput = z.infer<typeof graduacaoModalidadeSchema>

export const professorSchema = z.object({
  nome: z.string().trim().min(2, "Informe o nome"),
  email: z.email("E-mail inválido").trim().toLowerCase(),
  senha: z.string().min(6, "Senha de no mínimo 6 caracteres"),
  cpf: cpfOpcional,
  telefone: textoOpcional,
  dataNascimento: dataCivilOpcional,
  fotoUrl: fotoUrlOpcional,
  observacoes: textoOpcional,
  modalidadeIds: z.array(z.string()).min(1, "Selecione ao menos uma modalidade"),
})
export type ProfessorInput = z.infer<typeof professorSchema>

export const dadosProfessorSchema = z.object({
  professorId: z.string().min(1, "Selecione o professor"),
  nome: z.string().trim().min(2, "Informe o nome"),
  cpf: cpfOpcional,
  telefone: textoOpcional,
  dataNascimento: dataCivilOpcional,
  fotoUrl: fotoUrlOpcional,
  observacoes: textoOpcional,
  modalidadeIds: z.array(z.string()).min(1, "Selecione ao menos uma modalidade"),
})
export type DadosProfessorInput = z.infer<typeof dadosProfessorSchema>

export const excluirProfessorSchema = z.object({
  professorId: z.string().min(1, "Selecione o professor"),
})

export const statusProfessorSchema = z.object({
  professorId: z.string().min(1, "Selecione o professor"),
  ativo: z.enum(["true", "false"]).transform((v) => v === "true"),
})
export type StatusProfessorInput = z.infer<typeof statusProfessorSchema>

export const gestorSchema = z.object({
  nome: z.string().trim().min(2, "Informe o nome"),
  email: z.email("E-mail inválido").trim().toLowerCase(),
  senha: z.string().min(6, "Senha de no mínimo 6 caracteres"),
  dataNascimento: dataCivilOpcional,
  papel: z.enum(["GESTOR", "SECRETARIA"]).default("GESTOR"),
})
export type GestorInput = z.infer<typeof gestorSchema>

const responsavelSchema = z.object({
  nome: z.string().trim().min(2, "Informe o nome do responsável"),
  cpf: cpfOpcional,
  telefone: textoOpcional,
  email: emailOpcional,
  grauParentesco: textoOpcional,
  responsavelFinanceiro: z.coerce.boolean().optional().default(false),
})

const cobrancaModalidadeSchema = z.object({
  modalidadeId: z.string().min(1, "Selecione a modalidade"),
  plataformaExterna: z.enum(["WELLHUB", "TOTALPASS"]).nullable(),
})

function validarCobrancasModalidades(
  dados: {
    planoId?: string | null
    modalidadeIds: string[]
    cobrancasModalidades: Array<{ modalidadeId: string; plataformaExterna: string | null }>
  },
  ctx: z.RefinementCtx,
) {
  const modalidadeIds = new Set(dados.modalidadeIds)
  const cobrancasInvalidas = dados.cobrancasModalidades.filter(
    (cobranca) => !modalidadeIds.has(cobranca.modalidadeId),
  )
  if (cobrancasInvalidas.length > 0) {
    ctx.addIssue({
      code: "custom",
      path: ["cobrancasModalidades"],
      message: "Informe cobrança apenas para modalidades selecionadas.",
    })
  }

  if (dados.planoId) {
    const plataformas = new Map(
      dados.cobrancasModalidades.map((cobranca) => [
        cobranca.modalidadeId,
        cobranca.plataformaExterna,
      ]),
    )
    const temModalidadeInterna = dados.modalidadeIds.some(
      (modalidadeId) => !plataformas.get(modalidadeId),
    )
    if (!temModalidadeInterna) {
      ctx.addIssue({
        code: "custom",
        path: ["cobrancasModalidades"],
        message: "Plano de pagamento exige ao menos uma modalidade com cobrança interna.",
      })
    }
  }
}

export const alunoSchema = z
  .object({
    nome: z.string().trim().min(2, "Informe o nome"),
    email: z.email("E-mail inválido").trim().toLowerCase(),
    senha: z.string().min(6, "Senha de no mínimo 6 caracteres"),
    tipo: z.enum(["MENSALISTA", "WELLHUB", "TOTALPASS", "AVULSO"]),
    status: z.enum(STATUS_ALUNO).optional(),
    cpf: cpfOpcional,
    telefone: textoOpcional,
    fotoUrl: fotoUrlOpcional,
    dataNascimento: dataCivilOpcional,
    dataInicio: dataCivilOpcional,
    endereco: textoOpcional,
    contatoEmergencia: textoOpcional,
    restricoesMedicas: textoOpcional,
    observacoesTecnicas: textoOpcional,
    observacoesAdmin: textoOpcional,
    idExterno: textoOpcional,
    planoId: idOpcional,
    diaVencimento: diaVencimentoSchema,
    modalidadeIds: z.array(z.string()).min(1, "Selecione ao menos uma modalidade"),
    cobrancasModalidades: z.array(cobrancaModalidadeSchema).default([]),
    responsavel: responsavelSchema.optional(),
  })
  .superRefine(validarCobrancasModalidades)
export type AlunoInput = z.infer<typeof alunoSchema>

export const dadosAlunoSchema = z
  .object({
    alunoId: z.string().min(1, "Selecione o aluno"),
    nome: z.string().trim().min(2, "Informe o nome"),
    tipo: z.enum(["MENSALISTA", "WELLHUB", "TOTALPASS", "AVULSO"]),
    status: z.enum(STATUS_ALUNO),
    cpf: cpfOpcional,
    telefone: textoOpcional,
    fotoUrl: fotoUrlOpcional,
    dataNascimento: dataCivilOpcional,
    dataInicio: dataCivilOpcional,
    endereco: textoOpcional,
    contatoEmergencia: textoOpcional,
    restricoesMedicas: textoOpcional,
    observacoesTecnicas: textoOpcional,
    observacoesAdmin: textoOpcional,
    idExterno: textoOpcional,
    planoId: idOpcional,
    diaVencimento: diaVencimentoSchema,
    modalidadeIds: z.array(z.string()).min(1, "Selecione ao menos uma modalidade"),
    cobrancasModalidades: z.array(cobrancaModalidadeSchema).default([]),
    responsavel: responsavelSchema.nullable().optional(),
  })
  .superRefine(validarCobrancasModalidades)
export type DadosAlunoInput = z.infer<typeof dadosAlunoSchema>

export const meusDadosAlunoSchema = z.object({
  nome: z.string().trim().min(2, "Informe o nome"),
  email: z.email("E-mail inválido").trim().toLowerCase(),
  cpf: cpfOpcional,
  telefone: textoOpcional,
  dataNascimento: dataCivilOpcional,
  endereco: textoOpcional,
  contatoEmergencia: textoOpcional,
  restricoesMedicas: textoOpcional,
  responsavel: responsavelSchema.nullable().optional(),
})
export type MeusDadosAlunoInput = z.infer<typeof meusDadosAlunoSchema>

export const excluirAlunoSchema = z.object({
  alunoId: z.string().min(1, "Selecione o aluno"),
})

export const documentoAlunoSchema = z.object({
  alunoId: z.string().min(1, "Selecione o aluno"),
  titulo: z.string().trim().min(2, "Informe o título do documento"),
  categoria: textoOpcional,
  url: z.url("Informe uma URL válida do documento"),
  observacao: textoOpcional,
})
export type DocumentoAlunoInput = z.infer<typeof documentoAlunoSchema>

export const statusTipoAlunoSchema = z.object({
  alunoId: z.string().min(1, "Selecione o aluno"),
  tipo: z.enum(["MENSALISTA", "WELLHUB", "TOTALPASS", "AVULSO"]),
  status: z.enum(STATUS_ALUNO),
})
export type StatusTipoAlunoInput = z.infer<typeof statusTipoAlunoSchema>

export const excluirModalidadeSchema = z.object({
  modalidadeId: z.string().min(1, "Selecione a modalidade"),
})

const HORA_RE = /^([01]?\d|2[0-3]):[0-5]\d$/

const diasSemanaSchema = z
  .array(z.coerce.number().int().min(0).max(6))
  .min(1, "Selecione ao menos um dia da semana")
  .transform((dias) => [...new Set(dias)].sort((a, b) => a - b))

export const turmaRecorrenteSchema = z.object({
  modalidadeId: z.string().min(1, "Selecione a modalidade"),
  professorId: textoOpcional,
  nome: textoOpcional,
  diasSemana: diasSemanaSchema,
  horaInicio: z.string().regex(HORA_RE, "Hora inválida (HH:mm)"),
  horaFim: z.string().regex(HORA_RE, "Hora inválida (HH:mm)"),
  capacidade: z.coerce.number().int().min(0).default(0),
  local: textoOpcional,
  nivel: textoOpcional,
})
export type TurmaRecorrenteInput = z.infer<typeof turmaRecorrenteSchema>

export const dadosTurmaSchema = z.object({
  turmaId: z.string().min(1, "Selecione a turma"),
  modalidadeId: z.string().min(1, "Selecione a modalidade"),
  professorId: textoOpcional,
  nome: textoOpcional,
  diasSemana: diasSemanaSchema,
  horaInicio: z.string().regex(HORA_RE, "Hora inválida (HH:mm)"),
  horaFim: z.string().regex(HORA_RE, "Hora inválida (HH:mm)"),
  capacidade: z.coerce.number().int().min(0).default(0),
  local: textoOpcional,
  nivel: textoOpcional,
  ativa: z.enum(["true", "false"]).transform((valor) => valor === "true"),
})
export type DadosTurmaInput = z.infer<typeof dadosTurmaSchema>

export const eventoSchema = z
  .object({
    modalidadeId: z.string().min(1, "Selecione a modalidade"),
    professorId: textoOpcional,
    nome: z.string().trim().min(2, "Informe o nome do evento"),
    inicio: z.coerce.date(),
    fim: z.coerce.date(),
    capacidade: z.coerce.number().int().min(0).default(0),
    local: textoOpcional,
  })
  .refine((dados) => dados.fim.getTime() > dados.inicio.getTime(), {
    message: "O fim deve ser posterior ao início",
    path: ["fim"],
  })
export type EventoInput = z.infer<typeof eventoSchema>

export const professorAulaSchema = z.object({
  aulaId: z.string().min(1, "Selecione a aula"),
  professorId: textoOpcional,
  justificativa: textoOpcional,
})
export type ProfessorAulaInput = z.infer<typeof professorAulaSchema>

export const cancelarAulaSchema = z.object({
  aulaId: z.string().min(1, "Selecione a aula"),
  justificativa: z.string().trim().min(5, "Informe a justificativa do cancelamento"),
})
export type CancelarAulaInput = z.infer<typeof cancelarAulaSchema>

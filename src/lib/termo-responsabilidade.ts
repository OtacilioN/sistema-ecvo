export const TERMO_RESPONSABILIDADE_VERSAO = "2026-06-18"
export const TERMO_RESPONSABILIDADE_CIDADE = "João Pessoa"

export const DECLARACOES_TERMO_RESPONSABILIDADE = [
  {
    id: "condicoes_fisicas",
    texto:
      "Estou em plenas condições físicas e de saúde para participar das atividades oferecidas pela Escola de Combate Vinicius de Oliveira e assumo total responsabilidade pela minha participação.",
  },
  {
    id: "condicao_preexistente",
    texto:
      "Caso tenha alguma condição de saúde preexistente, compreendo que devo informar ao professor Vinicius de Oliveira e seguir todas as recomendações médicas pertinentes.",
  },
  {
    id: "isencao_responsabilidade",
    texto:
      "Isento a Escola de Combate Vinicius de Oliveira, seus instrutores e colaboradores de qualquer responsabilidade por problemas de saúde preexistentes ou que possam surgir durante ou após a prática das atividades, desde que não sejam decorrentes de negligência por parte da equipe da escola.",
  },
  {
    id: "emergencia_medica",
    texto:
      "Autorizo, caso necessário, que a equipe da Escola de Combate acione os serviços médicos de emergência em meu nome e compreendo que os custos decorrentes serão de minha responsabilidade.",
  },
  {
    id: "uso_imagem",
    texto:
      "Autorizo o uso de minha imagem para fins de divulgação das atividades e eventos da Escola de Combate Vinicius de Oliveira.",
  },
  {
    id: "leitura_concordancia",
    texto: "Declaro que li, compreendi e concordo com os termos acima.",
  },
] as const

export type DeclaracaoTermoResponsabilidadeId =
  (typeof DECLARACOES_TERMO_RESPONSABILIDADE)[number]["id"]

export const DECLARACOES_TERMO_IDS = DECLARACOES_TERMO_RESPONSABILIDADE.map(
  (declaracao) => declaracao.id,
)

export const DECLARACAO_RESPONSAVEL_MENOR_ID = "responsavel_menor"

export function menorDeIdade(dataNascimento: Date | null | undefined, referencia = new Date()) {
  if (!dataNascimento) return false

  const aniversarioNesteAno = new Date(
    referencia.getFullYear(),
    dataNascimento.getMonth(),
    dataNascimento.getDate(),
  )
  const idade =
    referencia.getFullYear() -
    dataNascimento.getFullYear() -
    (referencia < aniversarioNesteAno ? 1 : 0)

  return idade < 18
}

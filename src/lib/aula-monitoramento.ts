import type { BadgeProps } from "@/components/ui/badge"

export type StatusLinha =
  | "PRESENTE"
  | "COMPARECEU"
  | "LISTA_ESPERA"
  | "PENDENTE_REVISAO"
  | "INVALIDADO"
  | "EXCLUIDO"
  | "NO_SHOW"
  | "AUSENTE"

export type LinhaMonitoramentoAula = {
  alunoId: string
  nome: string
  observacoesTecnicas: string | null
  status: StatusLinha
  checkinId: string | null
  temComparecimento: boolean
}

export type TentativaInadimplenteAula = {
  alunoId: string
  nome: string
  motivo: string
  ultimaTentativaEm: Date
  totalTentativas: number
}

export const PRIORIDADE_STATUS_LINHA: Record<StatusLinha, number> = {
  PRESENTE: 0,
  COMPARECEU: 1,
  LISTA_ESPERA: 2,
  PENDENTE_REVISAO: 3,
  INVALIDADO: 4,
  EXCLUIDO: 5,
  NO_SHOW: 6,
  AUSENTE: 7,
}

export const ROTULO_STATUS_LINHA: Record<
  StatusLinha,
  { texto: string; variant: BadgeProps["variant"] }
> = {
  PRESENTE: { texto: "Presente", variant: "success" },
  COMPARECEU: { texto: "Comparecimento", variant: "secondary" },
  LISTA_ESPERA: { texto: "Lista de espera", variant: "warning" },
  PENDENTE_REVISAO: { texto: "Pendente de revisão", variant: "warning" },
  INVALIDADO: { texto: "Check-in invalidado", variant: "destructive" },
  EXCLUIDO: { texto: "Check-in excluído", variant: "destructive" },
  NO_SHOW: { texto: "No-show", variant: "warning" },
  AUSENTE: { texto: "Ausente", variant: "outline" },
}

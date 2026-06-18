import type { StatusAluno } from "@prisma/client"

export const STATUS_ALUNO = [
  "ATIVO",
  "INADIMPLENTE",
  "TRANCADO",
  "CANCELADO",
] as const satisfies readonly StatusAluno[]

export const STATUS_ALUNO_OPERACIONAIS = [
  "ATIVO",
  "INADIMPLENTE",
] as const satisfies readonly StatusAluno[]
export const STATUS_ALUNO_FORA_OPERACAO = [
  "TRANCADO",
  "CANCELADO",
] as const satisfies readonly StatusAluno[]

export type StatusAlunoDominio = StatusAluno

export function alunoContaOperacionalmente(status: StatusAlunoDominio): boolean {
  return status === "ATIVO" || status === "INADIMPLENTE"
}

export function alunoSemMatriculaAtiva(status: StatusAlunoDominio): boolean {
  return status === "TRANCADO" || status === "CANCELADO"
}

export function alunoComMatriculaCancelada(status: StatusAlunoDominio): boolean {
  return status === "CANCELADO"
}

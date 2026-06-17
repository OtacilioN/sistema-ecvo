"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { exigirAluno, exigirPapel } from "@/lib/auth/dal"
import { db } from "@/lib/db"
import { atualizarObservacoesTecnicas } from "@/lib/services/aluno.service"
import {
  checkinRetroativo,
  invalidarCheckin,
  realizarCheckin,
  realizarCheckinQr,
} from "@/lib/services/checkin.service"
import {
  cancelarComparecimento,
  marcarComparecimento,
  marcarNoShows,
} from "@/lib/services/comparecimento.service"
import { observacaoTecnicaSchema } from "@/lib/validations/observacoes"

export type EstadoTreino =
  | {
      erro?: string
      ok?: boolean
      pendenteRevisao?: boolean
      inadimplente?: boolean
      tokenInvalido?: boolean
      foraDaJanela?: boolean
    }
  | undefined

// ───────────────────────── Aluno ─────────────────────────

export async function acaoMarcarComparecimento(
  _: EstadoTreino,
  formData: FormData,
): Promise<EstadoTreino> {
  const { alunoId } = await exigirAluno()
  const aulaId = String(formData.get("aulaId"))
  const r = await marcarComparecimento({ alunoId, aulaId })
  revalidatePath("/aluno")
  revalidatePath("/gestao/checkin")
  return r.ok ? { ok: true } : { erro: r.motivo }
}

export async function acaoCancelarComparecimento(
  _: EstadoTreino,
  formData: FormData,
): Promise<EstadoTreino> {
  const { alunoId, usuario } = await exigirAluno()
  const aulaId = String(formData.get("aulaId"))
  const r = await cancelarComparecimento({ alunoId, aulaId, autorId: usuario.id })
  revalidatePath("/aluno")
  revalidatePath("/gestao/auditoria")
  revalidatePath("/aluno/notificacoes")
  revalidatePath(`/professor/aula/${aulaId}`)
  revalidatePath("/gestao/checkin")
  return r.ok ? { ok: true } : { erro: r.motivo }
}

export async function acaoCheckinAluno(
  _: EstadoTreino,
  _formData: FormData,
): Promise<EstadoTreino> {
  await exigirAluno()
  return { erro: "Leia o QR Code da entrada da academia para fazer check-in." }
}

export async function acaoCheckinAlunoQr(
  _: EstadoTreino,
  formData: FormData,
): Promise<EstadoTreino> {
  const { alunoId, usuario } = await exigirAluno()
  const aulaId = String(formData.get("aulaId"))
  const token = String(formData.get("token") ?? "")
  const r = await realizarCheckinQr({ alunoId, aulaId, autorId: usuario.id, token })
  revalidatePath("/aluno")
  revalidatePath("/aluno/checkin")
  revalidatePath(`/aluno/checkin/${aulaId}`)
  revalidatePath(`/professor/aula/${aulaId}`)
  revalidatePath(`/gestao/turmas/aula/${aulaId}`)
  revalidatePath("/gestao/checkin")
  revalidatePath("/gestao/auditoria")
  revalidatePath("/gestao/notificacoes")
  revalidatePath("/professor/notificacoes")

  if (r.ok) redirect(`/aluno/checkin/passe/${r.checkinId}`)

  return {
    erro: r.motivo,
    inadimplente: r.codigo === "INADIMPLENTE",
    tokenInvalido: r.codigo === "TOKEN_INVALIDO",
    foraDaJanela: r.codigo === "FORA_DA_JANELA",
  }
}

// ───────────────────────── Professor / Gestor (lista da aula) ─────────────────────────

/** Lança check-in por um aluno (gestor/professor) — vale como aprovação (RF-019/022). */
export async function acaoLancarCheckin(
  _: EstadoTreino,
  formData: FormData,
): Promise<EstadoTreino> {
  const usuario = await exigirPapel("PROFESSOR", "GESTOR")
  const aulaId = String(formData.get("aulaId"))
  const alunoId = String(formData.get("alunoId"))
  const justificativa = String(formData.get("justificativa") ?? "").trim()
  const aula = await db.aula.findUnique({ where: { id: aulaId }, select: { fim: true } })
  if (!aula) return { erro: "Aula não encontrada." }

  const retroativo = checkinRetroativo({ fimAula: aula.fim })
  if (retroativo && justificativa.length < 5) {
    return { erro: "Informe a justificativa do lançamento retroativo." }
  }

  const r = await realizarCheckin({
    alunoId,
    aulaId,
    autorId: usuario.id,
    lancadoPorId: usuario.id,
    origem: usuario.papel === "GESTOR" ? "LANCADO_GESTOR" : "LANCADO_PROFESSOR",
    retroativo,
    justificativa: justificativa.length > 0 ? justificativa : undefined,
  })
  revalidatePath(`/professor/aula/${aulaId}`)
  revalidatePath(`/gestao/turmas/aula/${aulaId}`)
  revalidatePath("/gestao/checkin")
  revalidatePath("/gestao/turmas")
  revalidatePath("/gestao/auditoria")
  return r.ok ? { ok: true } : { erro: r.motivo }
}

/** Invalida (ou exclui) um check-in, estornando horas (RF-027/028/035). */
export async function acaoInvalidarCheckin(
  _: EstadoTreino,
  formData: FormData,
): Promise<EstadoTreino> {
  const usuario = await exigirPapel("PROFESSOR", "GESTOR")
  const checkinId = String(formData.get("checkinId"))
  const aulaId = String(formData.get("aulaId"))
  const justificativa = String(formData.get("justificativa") ?? "").trim()
  if (justificativa.length < 3) return { erro: "Informe a justificativa." }

  const r = await invalidarCheckin({
    checkinId,
    autorId: usuario.id,
    justificativa,
    excluir: formData.get("excluir") === "on",
  })
  revalidatePath(`/professor/aula/${aulaId}`)
  revalidatePath(`/gestao/turmas/aula/${aulaId}`)
  revalidatePath("/gestao/checkin")
  revalidatePath("/gestao/turmas")
  revalidatePath("/gestao/auditoria")
  return r.ok ? { ok: true } : { erro: r.motivo }
}

/** Registra observações técnicas do aluno visíveis no acompanhamento (RF-003/RF-026). */
export async function acaoAtualizarObservacaoTecnica(
  _: EstadoTreino,
  formData: FormData,
): Promise<EstadoTreino> {
  const usuario = await exigirPapel("PROFESSOR", "GESTOR")
  const parsed = observacaoTecnicaSchema.safeParse({
    alunoId: formData.get("alunoId"),
    aulaId: formData.get("aulaId"),
    observacoesTecnicas: formData.get("observacoesTecnicas"),
  })
  if (!parsed.success) {
    return { erro: parsed.error.issues[0]?.message ?? "Dados inválidos." }
  }

  const resultado = await atualizarObservacoesTecnicas({
    alunoId: parsed.data.alunoId,
    observacoesTecnicas: parsed.data.observacoesTecnicas,
    autorId: usuario.id,
    professorId: usuario.professor?.id ?? null,
    porGestor: usuario.papel === "GESTOR",
  })
  revalidatePath(`/professor/aula/${parsed.data.aulaId}`)
  revalidatePath(`/gestao/turmas/aula/${parsed.data.aulaId}`)
  revalidatePath("/gestao/checkin")
  revalidatePath("/aluno/perfil")
  revalidatePath("/gestao/auditoria")
  if (!resultado.ok) return { erro: resultado.motivo }
  return { ok: true }
}

/** Marca no-show para comparecimentos sem check-in válido após o fim da aula (RF-018). */
export async function acaoMarcarNoShows(
  _: EstadoTreino,
  formData: FormData,
): Promise<EstadoTreino> {
  const usuario = await exigirPapel("PROFESSOR", "GESTOR")
  const aulaId = String(formData.get("aulaId"))
  const r = await marcarNoShows({ aulaId, autorId: usuario.id })
  revalidatePath(`/professor/aula/${aulaId}`)
  revalidatePath(`/gestao/turmas/aula/${aulaId}`)
  revalidatePath("/gestao/checkin")
  revalidatePath("/gestao/turmas")
  revalidatePath("/gestao/auditoria")
  revalidatePath("/gestao/notificacoes")
  revalidatePath("/aluno/notificacoes")
  return r.ok ? { ok: true } : { erro: r.motivo }
}

import "server-only"
import {
  registrarSessaoLegada,
  renovarSessaoDispositivo,
  validarSessaoDispositivo,
} from "@/lib/services/sessao-dispositivo.service"
import type { SessaoPayload } from "./session"

/** Chamar depois de validar usuário, papel e versão da sessão. */
export async function autorizarSessaoDispositivo(sessao: SessaoPayload): Promise<boolean> {
  if (!sessao.sessaoId || !sessao.exp) return false
  const limite = new Date(sessao.exp * 1000)
  if (sessao.legada) return registrarSessaoLegada(sessao.sessaoId, sessao.sub, limite)
  if (sessao.papel !== "ALUNO") return validarSessaoDispositivo(sessao.sessaoId, sessao.sub)
  const expiraEm = new Date(Math.min(limite.getTime(), Date.now() + 30 * 86_400_000))
  return renovarSessaoDispositivo(sessao.sessaoId, sessao.sub, expiraEm)
}

import "server-only"
import type { Prisma } from "@prisma/client"

export const MOTIVO_VINCULO_PLANO_FAMILIA =
  "O plano família exige uma matrícula família aprovada com 2 a 4 participantes."

/** Preserva vínculos existentes e restringe novas associações ao cadastro coletivo. */
export async function validarNovoVinculoPlanoFamilia(
  cliente: Prisma.TransactionClient,
  params: { planoId?: string | null; planoAnteriorId?: string | null; alunoId?: string },
) {
  if (!params.planoId || params.planoId === params.planoAnteriorId) return true
  const plano = await cliente.plano.findUnique({
    where: { id: params.planoId },
    select: { familia: true },
  })
  if (!plano?.familia) return true
  if (!params.alunoId) return false
  const solicitacao = await cliente.solicitacaoMatricula.findUnique({
    where: { alunoId: params.alunoId },
    select: {
      status: true,
      matriculaFamilia: { select: { pessoas: { select: { status: true, alunoId: true } } } },
    },
  })
  const pessoas = solicitacao?.matriculaFamilia?.pessoas ?? []
  return (
    solicitacao?.status === "APROVADA" &&
    pessoas.length >= 2 &&
    pessoas.length <= 4 &&
    pessoas.every((pessoa) => pessoa.status === "APROVADA" && pessoa.alunoId !== null)
  )
}

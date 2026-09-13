import "server-only"
import { type OutraReceitaMensal, Prisma } from "@prisma/client"
import { db } from "@/lib/db"
import {
  competenciaOutrasReceitasSchema,
  type OutrasReceitasMensaisInput,
  obterOutrasReceitasPadrao,
  outrasReceitasMensaisSchema,
  totalizarOutrasReceitas,
  type ValoresOutrasReceitas,
} from "@/lib/financeiro/outras-receitas"
import { registrarLog } from "@/lib/services/auditoria.service"

function serializarReceitas(competencia: string, registro: OutraReceitaMensal | null) {
  const valores: ValoresOutrasReceitas = registro
    ? { aluguelHorario: Number(registro.aluguelHorario), outros: Number(registro.outros) }
    : obterOutrasReceitasPadrao(competencia)

  return {
    competencia,
    valores,
    personalizado: registro !== null,
    total: totalizarOutrasReceitas(valores),
  }
}

export async function obterOutrasReceitasMensais(competencia: string) {
  competenciaOutrasReceitasSchema.parse(competencia)
  const registro = await db.outraReceitaMensal.findUnique({ where: { competencia } })
  return serializarReceitas(competencia, registro)
}

export async function salvarOutrasReceitasMensais(
  autorId: string,
  dados: OutrasReceitasMensaisInput,
) {
  const { competencia, ...valores } = outrasReceitasMensaisSchema.parse(dados)

  return db.$transaction(
    async (tx) => {
      // Protege também o primeiro cadastro para que o log reflita o valor realmente substituído.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('OutraReceitaMensal'), hashtext(${competencia}))`
      const anterior = await tx.outraReceitaMensal.findUnique({ where: { competencia } })
      const registro = await tx.outraReceitaMensal.upsert({
        where: { competencia },
        create: { competencia, ...valores },
        update: valores,
      })
      const resultado = serializarReceitas(competencia, registro)

      await registrarLog(
        {
          autorId,
          acao: "CONFIGURACAO",
          entidade: "OutraReceitaMensal",
          entidadeId: competencia,
          valorAntigo: serializarReceitas(competencia, anterior),
          valorNovo: resultado,
        },
        tx,
      )
      return resultado
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted },
  )
}

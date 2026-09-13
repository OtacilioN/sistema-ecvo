import "server-only"
import { type CustoFixoMensal, Prisma } from "@prisma/client"
import { db } from "@/lib/db"
import {
  CUSTOS_FIXOS_PADRAO,
  type CustosFixosMensaisInput,
  competenciaCustosFixosSchema,
  custosFixosMensaisSchema,
  totalizarCustosFixos,
  type ValoresCustosFixos,
} from "@/lib/financeiro/custos-fixos"
import { registrarLog } from "@/lib/services/auditoria.service"

function serializarCustos(competencia: string, registro: CustoFixoMensal | null) {
  const valores: ValoresCustosFixos = registro
    ? {
        aluguel: Number(registro.aluguel),
        energia: Number(registro.energia),
        agua: Number(registro.agua),
        internet: Number(registro.internet),
        limpeza: Number(registro.limpeza),
        outros: Number(registro.outros),
      }
    : { ...CUSTOS_FIXOS_PADRAO }

  return {
    competencia,
    valores,
    personalizado: registro !== null,
    total: totalizarCustosFixos(valores),
  }
}

export async function obterCustosFixosMensais(competencia: string) {
  competenciaCustosFixosSchema.parse(competencia)
  const registro = await db.custoFixoMensal.findUnique({ where: { competencia } })
  return serializarCustos(competencia, registro)
}

export async function salvarCustosFixosMensais(autorId: string, dados: CustosFixosMensaisInput) {
  const { competencia, ...valores } = custosFixosMensaisSchema.parse(dados)

  return db.$transaction(
    async (tx) => {
      // O lock por competência protege também o primeiro cadastro, quando ainda não há linha.
      // Assim, alterações concorrentes registram o valorAntigo realmente substituído.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('CustoFixoMensal'), hashtext(${competencia}))`
      const anterior = await tx.custoFixoMensal.findUnique({ where: { competencia } })
      const registro = await tx.custoFixoMensal.upsert({
        where: { competencia },
        create: { competencia, ...valores },
        update: valores,
      })
      const resultado = serializarCustos(competencia, registro)

      await registrarLog(
        {
          autorId,
          acao: "CONFIGURACAO",
          entidade: "CustoFixoMensal",
          entidadeId: competencia,
          valorAntigo: serializarCustos(competencia, anterior),
          valorNovo: resultado,
        },
        tx,
      )

      return resultado
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted },
  )
}

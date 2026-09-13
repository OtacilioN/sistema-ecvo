import { revalidatePath } from "next/cache"
import { exigirPapel } from "@/lib/auth/dal"
import { ErroArquivoConciliacao, lerArquivosConciliacao } from "@/lib/conciliacao/arquivos"
import {
  ErroImportacaoConciliacao,
  importarPlanilhasConciliacao,
} from "@/lib/services/conciliacao.service"
import { importarConciliacaoSchema } from "@/lib/validations/conciliacao"

export async function POST(request: Request) {
  const usuario = await exigirPapel("GESTOR")
  const formData = await request.formData()
  const parsed = importarConciliacaoSchema.safeParse({
    plataforma: formData.get("plataforma"),
    competencia: formData.get("competencia"),
  })
  if (!parsed.success)
    return Response.json(
      { erro: parsed.error.issues[0]?.message ?? "Dados inválidos." },
      { status: 400 },
    )

  try {
    const resultado = await importarPlanilhasConciliacao({
      ...parsed.data,
      arquivos: await lerArquivosConciliacao(formData),
      autorId: usuario.id,
    })
    revalidatePath("/gestao/conciliacao")
    revalidatePath("/gestao/financeiro")
    revalidatePath("/gestao/financeiro/repasses")
    return Response.json({
      importacoes: resultado.map((importacao) => ({
        id: importacao.id,
        totalLinhas: importacao.totalLinhas,
      })),
    })
  } catch (erro) {
    return Response.json(
      {
        erro:
          erro instanceof ErroImportacaoConciliacao || erro instanceof ErroArquivoConciliacao
            ? erro.message
            : "Não foi possível importar as planilhas.",
      },
      { status: 400 },
    )
  }
}

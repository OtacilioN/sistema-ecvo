import { exigirPapel } from "@/lib/auth/dal"
import { importarPlanilhaConciliacao } from "@/lib/services/conciliacao.service"
import { importarConciliacaoSchema } from "@/lib/validations/conciliacao"

export async function POST(request: Request) {
  const usuario = await exigirPapel("GESTOR")
  const formData = await request.formData()
  const parsed = importarConciliacaoSchema.safeParse({
    plataforma: formData.get("plataforma"),
  })
  if (!parsed.success) return Response.json({ erro: "Dados inválidos." }, { status: 400 })

  const arquivo = formData.get("arquivo")
  if (!(arquivo instanceof File) || arquivo.size === 0) {
    return Response.json({ erro: "Envie um arquivo CSV ou XLSX." }, { status: 400 })
  }
  const tipoArquivo = tipoArquivoConciliacao(arquivo.name)
  if (!tipoArquivo) {
    return Response.json({ erro: "Envie uma planilha CSV ou XLSX." }, { status: 400 })
  }

  const importacao = await importarPlanilhaConciliacao({
    plataforma: parsed.data.plataforma,
    arquivo: arquivo.name,
    conteudo:
      tipoArquivo === "csv" ? await arquivo.text() : Buffer.from(await arquivo.arrayBuffer()),
    tipoArquivo,
    autorId: usuario.id,
  })

  return Response.json({ id: importacao.id, totalLinhas: importacao.totalLinhas })
}

function tipoArquivoConciliacao(nome: string): "csv" | "xlsx" | null {
  const arquivo = nome.toLowerCase()
  if (arquivo.endsWith(".csv")) return "csv"
  if (arquivo.endsWith(".xlsx")) return "xlsx"
  return null
}

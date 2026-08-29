import "server-only"
import { del, put } from "@vercel/blob"
import { extensaoComprovante } from "@/lib/comprovantes-matricula"

export async function salvarComprovanteMatricula(arquivo: File) {
  const idArquivo = crypto.randomUUID()
  const extensao = extensaoComprovante(arquivo.type)
  return put(`matriculas/${idArquivo}/comprovante.${extensao}`, arquivo, {
    access: "private",
    contentType: arquivo.type,
    addRandomSuffix: false,
  })
}

export async function excluirComprovanteMatriculaSeExistir(url: string | null | undefined) {
  if (!url) return
  try {
    await del(url)
  } catch (erro) {
    console.warn("Não foi possível excluir um comprovante de matrícula órfão.", erro)
  }
}

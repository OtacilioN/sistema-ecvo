export const LIMITE_ARQUIVOS_CONCILIACAO = 2
// Deixa margem para o multipart no limite de 4 MB das Server Actions.
export const LIMITE_BYTES_CONCILIACAO = 3 * 1024 * 1024

export class ErroArquivoConciliacao extends Error {}

export async function lerArquivosConciliacao(formData: FormData) {
  const arquivos = formData.getAll("arquivo")
  if (
    arquivos.length === 0 ||
    arquivos.some((arquivo) => !(arquivo instanceof File) || arquivo.size === 0)
  ) {
    throw new ErroArquivoConciliacao("Envie um ou dois arquivos CSV ou XLSX.")
  }
  if (arquivos.length > LIMITE_ARQUIVOS_CONCILIACAO) {
    throw new ErroArquivoConciliacao(
      "Envie no máximo dois arquivos por importação, ambos do mesmo mês.",
    )
  }
  const planilhas = arquivos as File[]
  if (planilhas.reduce((soma, arquivo) => soma + arquivo.size, 0) > LIMITE_BYTES_CONCILIACAO) {
    throw new ErroArquivoConciliacao("Os arquivos juntos devem ter no máximo 3 MB.")
  }
  return Promise.all(
    planilhas.map(async (arquivo) => {
      const nome = arquivo.name.toLowerCase()
      const tipoArquivo = nome.endsWith(".csv")
        ? ("csv" as const)
        : nome.endsWith(".xlsx")
          ? ("xlsx" as const)
          : null
      if (!tipoArquivo) throw new ErroArquivoConciliacao("Envie somente planilhas CSV ou XLSX.")
      return {
        arquivo: arquivo.name,
        tipoArquivo,
        conteudo:
          tipoArquivo === "csv" ? await arquivo.text() : Buffer.from(await arquivo.arrayBuffer()),
      }
    }),
  )
}

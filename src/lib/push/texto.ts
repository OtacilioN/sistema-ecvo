export const LIMITE_TITULO_PUSH = 60
export const LIMITE_MENSAGEM_PUSH = 180

export function resumirTextoPush(texto: string, limite: number): string {
  const normalizado = texto.replace(/\s+/g, " ").trim()
  const caracteres = Array.from(normalizado)
  if (caracteres.length <= limite) return normalizado

  const trecho = caracteres.slice(0, limite - 1).join("")
  const ultimoEspaco = trecho.lastIndexOf(" ")
  const corte = ultimoEspaco >= Math.floor(limite * 0.6) ? trecho.slice(0, ultimoEspaco) : trecho
  return `${corte.trimEnd()}…`
}

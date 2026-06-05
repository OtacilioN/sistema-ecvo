/** Formata valor numérico como moeda brasileira (R$). */
export function formatarBRL(valor: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(valor)
}

const formatadorCpf = (digitos: string) =>
  digitos.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4")

/** Formata um CPF (com ou sem máscara) como 000.000.000-00. */
export function formatarCPF(cpf: string): string {
  const digitos = cpf.replace(/\D/g, "")
  return digitos.length === 11 ? formatadorCpf(digitos) : cpf
}

/** Valida CPF pelos dígitos verificadores. */
export function cpfValido(cpf: string): boolean {
  const d = cpf.replace(/\D/g, "")
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false
  const calc = (fatorInicial: number) => {
    let soma = 0
    for (let i = 0; i < fatorInicial - 1; i++) soma += Number(d[i]) * (fatorInicial - i)
    const resto = (soma * 10) % 11
    return resto === 10 ? 0 : resto
  }
  return calc(10) === Number(d[9]) && calc(11) === Number(d[10])
}

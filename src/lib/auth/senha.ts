import "server-only"
import bcrypt from "bcryptjs"

// Hash de senha com bcrypt (pure-JS — compatível com qualquer runtime, inclusive serverless).
const SALT_ROUNDS = 10

export async function gerarHashSenha(senha: string): Promise<string> {
  return bcrypt.hash(senha, SALT_ROUNDS)
}

export async function verificarSenha(senha: string, hash: string): Promise<boolean> {
  return bcrypt.compare(senha, hash)
}

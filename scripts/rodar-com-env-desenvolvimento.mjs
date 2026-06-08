#!/usr/bin/env node
import { spawn } from "node:child_process"
import path from "node:path"
import nextEnv from "@next/env"

const { loadEnvConfig } = nextEnv

const projetoDir = process.cwd()
const binLocal = path.join(projetoDir, "node_modules", ".bin")
const separador = process.argv.indexOf("--")
const comando = separador === -1 ? [] : process.argv.slice(separador + 1)

loadEnvConfig(projetoDir, true)

const endpointsProducao = new Set(["ep-orange-unit-aqullk5v"])
const ambienteBanco = process.env.ECVO_DATABASE_ENV

function endpointDaUrl(valor) {
  if (!valor) {
    return null
  }

  try {
    const url = new URL(valor)
    if (!url.hostname.includes(".neon.tech")) {
      return { tipo: "outro", host: url.hostname }
    }

    const endpoint = url.hostname.split(".")[0]?.replace(/-pooler$/, "")
    return { tipo: "neon", endpoint, host: url.hostname }
  } catch {
    return { tipo: "invalido", host: null }
  }
}

function falhar(mensagem) {
  console.error(`\n[ambiente-banco] ${mensagem}\n`)
  process.exit(1)
}

function verificarUrl(nome, valor) {
  const info = endpointDaUrl(valor)

  if (!info) {
    falhar(
      `${nome} nao esta definido. Configure um banco de desenvolvimento antes de rodar este comando.`,
    )
  }

  if (info.tipo === "invalido") {
    falhar(`${nome} nao parece ser uma URL PostgreSQL valida.`)
  }

  if (info.tipo === "neon" && endpointsProducao.has(info.endpoint)) {
    falhar(
      `${nome} aponta para o endpoint Neon de producao (${info.endpoint}). Use uma branch Neon de desenvolvimento ou um Postgres local.`,
    )
  }

  return info
}

const databaseUrl = verificarUrl("DATABASE_URL", process.env.DATABASE_URL)
verificarUrl("DIRECT_URL", process.env.DIRECT_URL)

if (ambienteBanco === "production") {
  falhar("ECVO_DATABASE_ENV=production nao pode ser usado em comandos locais de desenvolvimento.")
}

if (databaseUrl.tipo === "neon" && ambienteBanco !== "development") {
  falhar(
    "Para usar Neon localmente, defina ECVO_DATABASE_ENV=development junto com URLs de uma branch que nao seja production.",
  )
}

if (comando.length === 0) {
  console.log("[ambiente-banco] Banco de desenvolvimento verificado.")
  process.exit(0)
}

const filho = spawn(comando[0], comando.slice(1), {
  env: {
    ...process.env,
    PATH: `${binLocal}${path.delimiter}${process.env.PATH ?? ""}`,
  },
  shell: process.platform === "win32",
  stdio: "inherit",
})

filho.on("exit", (codigo, sinal) => {
  if (sinal) {
    process.kill(process.pid, sinal)
    return
  }

  process.exit(codigo ?? 1)
})

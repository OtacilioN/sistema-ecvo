import { readFileSync } from "node:fs"
import { PrismaClient } from "@prisma/client"

const GRADUACOES_KICKBOXING = [
  "Branca",
  "Amarela",
  "Laranja",
  "Verde",
  "Azul",
  "Marrom",
  "Preta",
] as const

const GRADUACOES_LEGADAS = [
  ["Iniciante", "Branca"],
  ["Intermediário", "Amarela"],
  ["Avançado", "Laranja"],
] as const

function carregarEnv() {
  const env = readFileSync(".env", "utf8")
  for (const line of env.split(/\r?\n/)) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/)
    if (!match || process.env[match[1]]) continue
    process.env[match[1]] = match[2].replace(/^"|"$/g, "")
  }
}

async function main() {
  carregarEnv()

  const db = new PrismaClient()
  try {
    const modalidade = await db.modalidade.findUnique({
      where: { nome: "Kickboxing" },
      select: { id: true },
    })

    if (!modalidade) throw new Error("Modalidade Kickboxing não encontrada.")

    await db.$transaction(async (tx) => {
      for (const [nomeLegado, nomeAtual] of GRADUACOES_LEGADAS) {
        const [legado, atual] = await Promise.all([
          tx.graduacao.findUnique({
            where: { modalidadeId_nome: { modalidadeId: modalidade.id, nome: nomeLegado } },
            select: { id: true },
          }),
          tx.graduacao.findUnique({
            where: { modalidadeId_nome: { modalidadeId: modalidade.id, nome: nomeAtual } },
            select: { id: true },
          }),
        ])

        if (!legado) continue

        if (!atual) {
          await tx.graduacao.update({
            where: { id: legado.id },
            data: { nome: nomeAtual, minHoras: null },
          })
          continue
        }

        await tx.graduacaoAluno.updateMany({
          where: { graduacaoId: legado.id },
          data: { graduacaoId: atual.id },
        })
        await tx.graduacaoAluno.updateMany({
          where: { graduacaoAnteriorId: legado.id },
          data: { graduacaoAnteriorId: atual.id },
        })
        await tx.inscricaoExame.updateMany({
          where: { novaGraduacaoId: legado.id },
          data: { novaGraduacaoId: atual.id },
        })
        await tx.graduacao.delete({ where: { id: legado.id } })
      }

      for (const [index, nome] of GRADUACOES_KICKBOXING.entries()) {
        await tx.graduacao.upsert({
          where: { modalidadeId_nome: { modalidadeId: modalidade.id, nome } },
          update: { ordem: index + 1, minHoras: null },
          create: { modalidadeId: modalidade.id, nome, ordem: index + 1 },
        })
      }

      await tx.graduacao.deleteMany({
        where: {
          modalidadeId: modalidade.id,
          nome: { notIn: [...GRADUACOES_KICKBOXING] },
          historico: { none: {} },
          historicoAnterior: { none: {} },
          resultadosExame: { none: {} },
        },
      })
    })

    const graduacoes = await db.graduacao.findMany({
      where: { modalidadeId: modalidade.id },
      orderBy: [{ ordem: "asc" }, { nome: "asc" }],
      select: { nome: true, ordem: true },
    })

    console.log(graduacoes.map((graduacao) => `${graduacao.ordem}. ${graduacao.nome}`).join("\n"))
  } finally {
    await db.$disconnect()
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})

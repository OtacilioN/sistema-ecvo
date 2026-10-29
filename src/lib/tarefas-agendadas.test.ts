import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import { TAREFAS_AGENDADAS } from "./tarefas-agendadas"

describe("contrato de publicação das tarefas", () => {
  it("publica todos os jobs monitorados com horários consistentes e rotas existentes", () => {
    const config = JSON.parse(readFileSync("vercel.json", "utf8"))
    expect(config.crons).toHaveLength(TAREFAS_AGENDADAS.length)
    for (const tarefa of TAREFAS_AGENDADAS) {
      expect(config.crons).toContainEqual({
        path: `/api/tarefas/${tarefa.tarefa}`,
        schedule: tarefa.cron,
      })
      const route = readFileSync(`src/app/api/tarefas/${tarefa.tarefa}/route.ts`, "utf8")
      expect(route).toMatch(
        new RegExp(`responderTarefaAgendada\\(\\s*request,\\s*"${tarefa.tarefa}"`),
      )
      expect(route).toContain("export const maxDuration = 300")
    }
  })
})

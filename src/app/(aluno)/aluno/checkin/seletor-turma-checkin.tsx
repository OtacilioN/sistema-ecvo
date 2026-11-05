"use client"

import type { ReactNode } from "react"
import { useState } from "react"
import { cn } from "@/lib/utils"

export type OpcaoTurmaCheckin = {
  id: string
  nome: string
  horario: string
  conteudo: ReactNode
  checkinRegistrado: boolean
  bloqueadaPorLimiteDiario: boolean
}

export function SeletorTurmaCheckin({ aulas }: { aulas: OpcaoTurmaCheckin[] }) {
  const [aulaEscolhidaId, setAulaEscolhidaId] = useState<string | null>(null)
  const disponiveis = aulas.filter(
    (aula) => !aula.checkinRegistrado && !aula.bloqueadaPorLimiteDiario,
  )
  const exigeEscolha = disponiveis.length > 1
  const escolhida = exigeEscolha
    ? disponiveis.find((aula) => aula.id === aulaEscolhidaId)
    : disponiveis[0]

  return (
    <div className="grid gap-3">
      {exigeEscolha && (
        <fieldset className="min-w-0 rounded-lg border border-primary/40 bg-card p-4">
          <legend className="px-1 text-base font-semibold">Em qual turma você vai treinar?</legend>
          <p className="mb-4 text-sm text-muted-foreground">
            Há mais de uma aula com check-in liberado. Escolha a turma antes de confirmar sua
            entrada.
          </p>
          <div className="grid gap-3">
            {disponiveis.map((aula) => (
              <label
                key={aula.id}
                className={cn(
                  "flex cursor-pointer items-center gap-3 rounded-md border p-4 focus-within:ring-2 focus-within:ring-ring",
                  aula.id === escolhida?.id ? "border-primary bg-primary/5" : "border-border",
                )}
              >
                <input
                  type="radio"
                  name="turmaCheckin"
                  value={aula.id}
                  checked={aula.id === escolhida?.id}
                  onChange={() => setAulaEscolhidaId(aula.id)}
                  className="size-4 shrink-0 accent-primary"
                />
                <span className="min-w-0">
                  <span className="block font-semibold">{aula.nome}</span>
                  <span className="block text-sm text-muted-foreground">{aula.horario}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>
      )}
      {escolhida && <div key={escolhida.id}>{escolhida.conteudo}</div>}
      {aulas
        .filter((aula) => aula.checkinRegistrado || aula.bloqueadaPorLimiteDiario)
        .map((aula) => (
          <div key={aula.id}>{aula.conteudo}</div>
        ))}
    </div>
  )
}

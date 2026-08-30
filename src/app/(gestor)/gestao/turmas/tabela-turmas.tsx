"use client"

import { useMemo, useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { Select } from "@/components/ui/select"
import {
  correspondeFiltroAtividade,
  FILTRO_ATIVIDADE_PADRAO,
  type FiltroAtividade,
} from "@/lib/filtros/atividade"
import { formatarMinutos, rotuloDiaSemana } from "@/lib/utils/datas"
import { AcoesTurma } from "./acoes-turma"

type Opcao = { id: string; nome: string }

export type TurmaLista = {
  id: string
  modalidadeId: string
  modalidadeNome: string
  nome: string | null
  professorId: string | null
  professorNome: string | null
  diaSemana: number | null
  diasSemana: number[]
  horaInicio: string | null
  horaFim: string | null
  duracaoMin: number
  capacidade: number
  local: string | null
  nivel: string | null
  ativa: boolean
  aulas: number
}

function rotuloDiasSemana(diasSemana: number[], diaSemana: number | null): string {
  const dias = diasSemana.length > 0 ? diasSemana : diaSemana === null ? [] : [diaSemana]
  if (dias.length === 0) return "—"
  return dias.map(rotuloDiaSemana).join(", ")
}

export function TabelaTurmas({
  turmas,
  modalidades,
  professores,
  podeEditar,
}: {
  turmas: TurmaLista[]
  modalidades: Opcao[]
  professores: Opcao[]
  podeEditar: boolean
}) {
  const [filtroAtividade, setFiltroAtividade] = useState<FiltroAtividade>(FILTRO_ATIVIDADE_PADRAO)

  const filtradas = useMemo(
    () => turmas.filter((turma) => correspondeFiltroAtividade(turma.ativa, filtroAtividade)),
    [turmas, filtroAtividade],
  )
  const modalidadeIdsDisponiveis = useMemo(
    () => new Set(modalidades.map((modalidade) => modalidade.id)),
    [modalidades],
  )

  return (
    <Card>
      <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:items-center sm:justify-between">
        <Select
          aria-label="Filtrar turmas por status"
          className="sm:max-w-52"
          value={filtroAtividade}
          onChange={(evento) => setFiltroAtividade(evento.target.value as FiltroAtividade)}
        >
          <option value="ATIVAS">Somente ativas</option>
          <option value="INATIVAS">Somente inativas</option>
          <option value="TODAS">Todas</option>
        </Select>
        <span className="text-sm text-muted-foreground">
          {filtradas.length} de {turmas.length}
        </span>
      </div>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="tabela-responsiva w-full text-sm">
            <thead className="border-b border-border text-left text-muted-foreground">
              <tr>
                <th className="p-4 font-medium">Turma</th>
                <th className="p-4 font-medium">Modalidade</th>
                <th className="p-4 font-medium">Dia / horário</th>
                <th className="p-4 font-medium">Professor</th>
                <th className="p-4 text-center font-medium">Aulas</th>
                <th className="p-4 font-medium">Status</th>
                {podeEditar && (
                  <th className="p-4 text-right font-medium">
                    <span className="sr-only">Ações</span>
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {filtradas.map((turma) => {
                const diasSemana = rotuloDiasSemana(turma.diasSemana, turma.diaSemana)
                const diasSemanaEdicao =
                  turma.diasSemana.length > 0
                    ? turma.diasSemana
                    : turma.diaSemana === null
                      ? []
                      : [turma.diaSemana]
                const modalidadeAtualDisponivel = modalidadeIdsDisponiveis.has(turma.modalidadeId)
                const modalidadesEdicao = modalidadeAtualDisponivel
                  ? modalidades
                  : [
                      { id: turma.modalidadeId, nome: `${turma.modalidadeNome} (inativa)` },
                      ...modalidades,
                    ]

                return (
                  <tr
                    key={turma.id}
                    className="border-b border-border transition-colors last:border-0 hover:bg-muted/40"
                  >
                    <td className="p-4 font-medium" data-label="Turma">
                      {turma.nome ?? "—"}
                      {turma.local && (
                        <span className="block text-xs font-normal text-muted-foreground">
                          {turma.local}
                        </span>
                      )}
                    </td>
                    <td className="p-4" data-label="Modalidade">
                      <Badge variant="outline">{turma.modalidadeNome}</Badge>
                    </td>
                    <td className="p-4" data-label="Dia / horário">
                      {diasSemana} · {turma.horaInicio}–{turma.horaFim}
                      <span className="block text-xs text-muted-foreground">
                        {formatarMinutos(turma.duracaoMin)}
                        {turma.capacidade > 0 ? ` · ${turma.capacidade} vagas` : " · sem limite"}
                      </span>
                    </td>
                    <td className="p-4" data-label="Professor">
                      {turma.professorNome ?? "—"}
                    </td>
                    <td className="p-4 text-center tabular-nums" data-label="Aulas">
                      {turma.aulas}
                    </td>
                    <td className="p-4" data-label="Status">
                      <Badge variant={turma.ativa ? "success" : "secondary"}>
                        {turma.ativa ? "Ativa" : "Inativa"}
                      </Badge>
                    </td>
                    {podeEditar && (
                      <td className="p-4" data-label="Ações">
                        <div className="flex justify-end">
                          <AcoesTurma
                            modalidades={modalidadesEdicao}
                            professores={professores}
                            turma={{
                              id: turma.id,
                              rotulo: `${turma.modalidadeNome} · ${diasSemana} ${turma.horaInicio ?? ""}`,
                              modalidadeId: turma.modalidadeId,
                              nome: turma.nome,
                              professorId: turma.professorId,
                              diasSemana: diasSemanaEdicao,
                              horaInicio: turma.horaInicio,
                              horaFim: turma.horaFim,
                              capacidade: turma.capacidade,
                              local: turma.local,
                              nivel: turma.nivel,
                              ativa: turma.ativa,
                            }}
                          />
                        </div>
                      </td>
                    )}
                  </tr>
                )
              })}
              {filtradas.length === 0 && (
                <tr>
                  <td
                    colSpan={podeEditar ? 7 : 6}
                    className="p-10 text-center text-muted-foreground"
                  >
                    {turmas.length === 0
                      ? "Nenhuma turma cadastrada. Use “Nova turma” para começar."
                      : "Nenhuma turma corresponde ao filtro."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  )
}

"use client"

import { useMemo, useState } from "react"
import { Badge } from "@/components/ui/badge"
import { CampoBusca } from "@/components/ui/campo-busca"
import { Card, CardContent } from "@/components/ui/card"
import { formatarMinutos } from "@/lib/utils/datas"
import { AcoesModalidade, type ModalidadeLinha } from "./acoes-modalidade"

type Graduacao = {
  id: string
  nome: string
  ordem: number
  minHoras: number | null
  minFrequencia: number | null
  minTempoNoGrauDias: number | null
}

export type ModalidadeLista = ModalidadeLinha & {
  graduacoes: Graduacao[]
  professorNomes: string[]
  turmas: number
  alunos: number
}

export function TabelaModalidades({
  modalidades,
  podeEditar,
}: {
  modalidades: ModalidadeLista[]
  podeEditar: boolean
}) {
  const [busca, setBusca] = useState("")

  const filtradas = useMemo(() => {
    const termo = busca.trim().toLowerCase()
    if (!termo) return modalidades
    return modalidades.filter((m) =>
      [
        m.nome,
        m.descricao ?? "",
        m.ativa ? "ativa" : "inativa",
        ...m.professorNomes,
        ...m.graduacoes.map((g) => g.nome),
      ]
        .join(" ")
        .toLowerCase()
        .includes(termo),
    )
  }, [modalidades, busca])

  return (
    <Card>
      <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:items-center sm:justify-between">
        <CampoBusca valor={busca} aoMudar={setBusca} placeholder="Nome, professor, graduação…" />
        <span className="text-sm text-muted-foreground">
          {filtradas.length} de {modalidades.length}
        </span>
      </div>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="tabela-responsiva w-full text-sm">
            <thead className="border-b border-border text-left text-muted-foreground">
              <tr>
                <th className="p-4 font-medium">Modalidade</th>
                <th className="p-4 font-medium">Duração padrão</th>
                <th className="p-4 font-medium">Graduações</th>
                <th className="p-4 font-medium">Professores</th>
                <th className="p-4 font-medium">Regras</th>
                <th className="p-4 text-center font-medium">Turmas</th>
                <th className="p-4 text-center font-medium">Alunos</th>
                <th className="p-4 font-medium">Status</th>
                {podeEditar && (
                  <th className="p-4 text-right font-medium">
                    <span className="sr-only">Ações</span>
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {filtradas.map((m) => (
                <tr
                  key={m.id}
                  className="border-b border-border transition-colors last:border-0 hover:bg-muted/40"
                >
                  <td className="p-4 font-medium" data-label="Modalidade">
                    {m.nome}
                    {m.descricao && (
                      <span className="block text-xs font-normal text-muted-foreground">
                        {m.descricao}
                      </span>
                    )}
                  </td>
                  <td className="p-4" data-label="Duração">
                    {formatarMinutos(m.duracaoPadraoMin)}
                  </td>
                  <td className="p-4" data-label="Graduações">
                    <div className="flex max-w-sm flex-wrap gap-1">
                      {m.graduacoes.map((graduacao) => (
                        <Badge key={graduacao.id} variant="outline">
                          {graduacao.nome}
                          {criteriosGraduacao(graduacao)}
                        </Badge>
                      ))}
                      {m.graduacoes.length === 0 && (
                        <span className="text-xs text-muted-foreground">Sem catálogo</span>
                      )}
                    </div>
                  </td>
                  <td className="p-4" data-label="Professores">
                    <div className="flex max-w-xs flex-wrap gap-1">
                      {m.professorNomes.map((nome) => (
                        <Badge key={nome} variant="secondary">
                          {nome}
                        </Badge>
                      ))}
                      {m.professorNomes.length === 0 && (
                        <span className="text-xs text-muted-foreground">Sem professor</span>
                      )}
                    </div>
                  </td>
                  <td className="p-4 text-xs text-muted-foreground" data-label="Regras">
                    {resumoRegras(m).map((item) => (
                      <span key={item} className="block">
                        {item}
                      </span>
                    ))}
                  </td>
                  <td className="p-4 text-center tabular-nums" data-label="Turmas">
                    {m.turmas}
                  </td>
                  <td className="p-4 text-center tabular-nums" data-label="Alunos">
                    {m.alunos}
                  </td>
                  <td className="p-4" data-label="Status">
                    {m.ativa ? (
                      <Badge variant="success">Ativa</Badge>
                    ) : (
                      <Badge variant="secondary">Inativa</Badge>
                    )}
                  </td>
                  {podeEditar && (
                    <td className="p-4" data-label="Ações">
                      <div className="flex justify-end">
                        <AcoesModalidade modalidade={m} />
                      </div>
                    </td>
                  )}
                </tr>
              ))}
              {filtradas.length === 0 && (
                <tr>
                  <td
                    colSpan={podeEditar ? 9 : 8}
                    className="p-10 text-center text-muted-foreground"
                  >
                    {modalidades.length === 0
                      ? "Nenhuma modalidade cadastrada. Use “Nova modalidade” para começar."
                      : "Nenhuma modalidade corresponde à busca."}
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

function resumoRegras(modalidade: {
  janelaComparecimentoHoras: number | null
  prazoCancelamentoHoras: number | null
  exigirComparecimentoParaCheckin: boolean | null
  politicaCheckinSemComparecimento: string | null
  listaEsperaAtiva: boolean | null
}) {
  const regras = [
    modalidade.janelaComparecimentoHoras !== null
      ? `Janela: ${modalidade.janelaComparecimentoHoras}h`
      : null,
    modalidade.prazoCancelamentoHoras !== null
      ? `Cancelamento: ${modalidade.prazoCancelamentoHoras}h`
      : null,
    modalidade.exigirComparecimentoParaCheckin !== null
      ? `Exige comparecimento: ${modalidade.exigirComparecimentoParaCheckin ? "sim" : "não"}`
      : null,
    modalidade.politicaCheckinSemComparecimento
      ? `Sem comparecimento: ${rotuloPolitica(modalidade.politicaCheckinSemComparecimento)}`
      : null,
    modalidade.listaEsperaAtiva !== null
      ? `Lista de espera: ${modalidade.listaEsperaAtiva ? "ativa" : "inativa"}`
      : null,
  ].filter((item): item is string => Boolean(item))

  return regras.length > 0 ? regras : ["Herda regras globais"]
}

function rotuloPolitica(politica: string) {
  const rotulos: Record<string, string> = {
    PERMITIR: "permitir",
    BLOQUEAR: "bloquear",
    APENAS_COM_APROVACAO: "aprovação",
  }
  return rotulos[politica] ?? politica
}

function criteriosGraduacao(graduacao: { minHoras: number | null }) {
  return graduacao.minHoras !== null ? ` · ${graduacao.minHoras}h` : ""
}

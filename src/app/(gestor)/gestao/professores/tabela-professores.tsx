"use client"

import { useMemo, useState } from "react"
import { Badge } from "@/components/ui/badge"
import { CampoBusca } from "@/components/ui/campo-busca"
import { Card, CardContent } from "@/components/ui/card"
import { formatarCPF } from "@/lib/utils/formato"
import { AcoesProfessor, type ProfessorLinha } from "./acoes-professor"

type Modalidade = { id: string; nome: string }

export type ProfessorLista = ProfessorLinha & {
  email: string
  modalidadeNomes: string[]
  turmas: number
}

export function TabelaProfessores({
  professores,
  modalidades,
}: {
  professores: ProfessorLista[]
  modalidades: Modalidade[]
}) {
  const [busca, setBusca] = useState("")

  const filtrados = useMemo(() => {
    const termo = busca.trim().toLowerCase()
    if (!termo) return professores
    return professores.filter((p) =>
      [p.nome, p.email, p.cpf ?? "", p.ativo ? "ativo" : "inativo", ...p.modalidadeNomes]
        .join(" ")
        .toLowerCase()
        .includes(termo),
    )
  }, [professores, busca])

  return (
    <Card>
      <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:items-center sm:justify-between">
        <CampoBusca valor={busca} aoMudar={setBusca} placeholder="Nome, e-mail, modalidade…" />
        <span className="text-sm text-muted-foreground">
          {filtrados.length} de {professores.length}
        </span>
      </div>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="tabela-responsiva w-full text-sm">
            <thead className="border-b border-border text-left text-muted-foreground">
              <tr>
                <th className="p-4 font-medium">Professor</th>
                <th className="p-4 font-medium">Modalidades</th>
                <th className="p-4 text-center font-medium">Turmas</th>
                <th className="p-4 font-medium">Status</th>
                <th className="p-4 text-right font-medium">
                  <span className="sr-only">Ações</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {filtrados.map((p) => (
                <tr
                  key={p.id}
                  className="border-b border-border transition-colors last:border-0 hover:bg-muted/40"
                >
                  <td className="p-4" data-label="Professor">
                    <div className="flex items-center gap-3">
                      <FotoPerfil nome={p.nome} fotoUrl={p.fotoUrl} />
                      <div className="min-w-0">
                        <span className="font-medium">{p.nome}</span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {p.email}
                          {p.cpf ? ` · CPF ${formatarCPF(p.cpf)}` : ""}
                        </span>
                      </div>
                    </div>
                  </td>
                  <td className="p-4" data-label="Modalidades">
                    <div className="flex flex-wrap gap-1">
                      {p.modalidadeNomes.map((nome) => (
                        <Badge key={nome} variant="outline">
                          {nome}
                        </Badge>
                      ))}
                      {p.modalidadeNomes.length === 0 && (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </div>
                  </td>
                  <td className="p-4 text-center tabular-nums" data-label="Turmas">
                    {p.turmas}
                  </td>
                  <td className="p-4" data-label="Status">
                    {p.ativo ? (
                      <Badge variant="success">Ativo</Badge>
                    ) : (
                      <Badge variant="secondary">Inativo</Badge>
                    )}
                  </td>
                  <td className="p-4" data-label="Ações">
                    <div className="flex justify-end">
                      <AcoesProfessor professor={p} modalidades={modalidades} />
                    </div>
                  </td>
                </tr>
              ))}
              {filtrados.length === 0 && (
                <tr>
                  <td colSpan={5} className="p-10 text-center text-muted-foreground">
                    {professores.length === 0
                      ? "Nenhum professor cadastrado. Use “Novo professor” para começar."
                      : "Nenhum professor corresponde à busca."}
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

function FotoPerfil({ nome, fotoUrl }: { nome: string; fotoUrl?: string | null }) {
  return (
    <div
      role="img"
      aria-label={`Foto de ${nome}`}
      className="size-10 shrink-0 rounded-md border border-border bg-muted bg-cover bg-center text-xs font-semibold text-muted-foreground"
      style={fotoUrl ? { backgroundImage: `url(${fotoUrl})` } : undefined}
    >
      {!fotoUrl && <span className="flex size-full items-center justify-center">{nome[0]}</span>}
    </div>
  )
}

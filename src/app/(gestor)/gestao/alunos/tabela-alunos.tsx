"use client"

import { useMemo, useState } from "react"
import { Badge, type BadgeProps } from "@/components/ui/badge"
import { CampoBusca } from "@/components/ui/campo-busca"
import { Card, CardContent } from "@/components/ui/card"
import { AcoesAluno, type AlunoLinha } from "./acoes-aluno"

type Modalidade = { id: string; nome: string }
type StatusAluno = AlunoLinha["status"]

export type AlunoLista = AlunoLinha & {
  email: string
  modalidadeNomes: string[]
  documentos: number
}

const VARIANTE_STATUS: Record<StatusAluno, BadgeProps["variant"]> = {
  ATIVO: "success",
  INADIMPLENTE: "warning",
  SUSPENSO: "warning",
  INATIVO: "secondary",
  TRANCADO: "secondary",
  CANCELADO: "destructive",
}

export function TabelaAlunos({
  alunos,
  modalidades,
}: {
  alunos: AlunoLista[]
  modalidades: Modalidade[]
}) {
  const [busca, setBusca] = useState("")

  const filtrados = useMemo(() => {
    const termo = busca.trim().toLowerCase()
    if (!termo) return alunos
    return alunos.filter((a) =>
      [a.nome, a.email, a.tipo, a.status, String(a.diaVencimento), ...a.modalidadeNomes]
        .join(" ")
        .toLowerCase()
        .includes(termo),
    )
  }, [alunos, busca])

  return (
    <Card>
      <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:items-center sm:justify-between">
        <CampoBusca valor={busca} aoMudar={setBusca} placeholder="Nome, e-mail, modalidade…" />
        <span className="text-sm text-muted-foreground">
          {filtrados.length} de {alunos.length}
        </span>
      </div>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="tabela-responsiva w-full text-sm">
            <thead className="border-b border-border text-left text-muted-foreground">
              <tr>
                <th className="p-4 font-medium">Aluno</th>
                <th className="p-4 font-medium">Tipo</th>
                <th className="p-4 font-medium">Modalidades</th>
                <th className="p-4 font-medium">Venc.</th>
                <th className="p-4 text-center font-medium">Docs</th>
                <th className="p-4 font-medium">Status</th>
                <th className="p-4 text-right font-medium">
                  <span className="sr-only">Ações</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {filtrados.map((a) => (
                <tr
                  key={a.id}
                  className="border-b border-border transition-colors last:border-0 hover:bg-muted/40"
                >
                  <td className="p-4" data-label="Aluno">
                    <div className="flex items-center gap-3">
                      <FotoPerfil nome={a.nome} fotoUrl={a.fotoUrl} />
                      <div className="min-w-0">
                        <span className="font-medium">{a.nome}</span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {a.email}
                        </span>
                      </div>
                    </div>
                  </td>
                  <td className="p-4" data-label="Tipo">
                    <Badge variant="outline">{a.tipo}</Badge>
                  </td>
                  <td className="p-4" data-label="Modalidades">
                    <div className="flex flex-wrap gap-1">
                      {a.modalidadeNomes.map((nome) => (
                        <Badge key={nome} variant="secondary">
                          {nome}
                        </Badge>
                      ))}
                      {a.modalidadeNomes.length === 0 && (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </div>
                  </td>
                  <td className="p-4 tabular-nums" data-label="Venc.">
                    Dia {a.diaVencimento}
                  </td>
                  <td className="p-4 text-center font-semibold tabular-nums" data-label="Docs">
                    {a.documentos}
                  </td>
                  <td className="p-4" data-label="Status">
                    <Badge variant={VARIANTE_STATUS[a.status]}>{a.status}</Badge>
                  </td>
                  <td className="p-4" data-label="Ações">
                    <div className="flex justify-end">
                      <AcoesAluno aluno={a} modalidades={modalidades} />
                    </div>
                  </td>
                </tr>
              ))}
              {filtrados.length === 0 && (
                <tr>
                  <td colSpan={7} className="p-10 text-center text-muted-foreground">
                    {alunos.length === 0
                      ? "Nenhum aluno cadastrado. Use “Novo aluno” para começar."
                      : "Nenhum aluno corresponde à busca."}
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

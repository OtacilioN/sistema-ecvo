"use client"

import { useMemo, useState } from "react"
import { Badge } from "@/components/ui/badge"
import { CampoBusca } from "@/components/ui/campo-busca"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { formatarDataHora } from "@/lib/utils/datas"

export type LogLinha = {
  id: string
  criadoEm: Date
  acao: string
  autorNome: string
  autorPapel: string
  entidade: string
  entidadeId: string
  detalheEntidade?: string
  justificativa: string | null
  valorAntigo: unknown
  valorNovo: unknown
}

export function TabelaAuditoria({ logs }: { logs: LogLinha[] }) {
  const [busca, setBusca] = useState("")

  const filtrados = useMemo(() => {
    const termo = busca.trim().toLowerCase()
    if (!termo) return logs
    return logs.filter((log) =>
      [
        log.acao,
        log.autorNome,
        log.autorPapel,
        log.entidade,
        log.entidadeId,
        log.detalheEntidade,
        log.justificativa,
      ]
        .filter(Boolean)
        .some((campo) => (campo as string).toLowerCase().includes(termo)),
    )
  }, [logs, busca])

  return (
    <Card>
      <CardHeader className="gap-3 sm:flex-row sm:items-center sm:justify-between">
        <CardTitle>Eventos recentes</CardTitle>
        <CampoBusca valor={busca} aoMudar={setBusca} placeholder="Ação, autor, entidade…" />
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="tabela-responsiva w-full text-sm">
            <thead className="border-b border-border text-left text-muted-foreground">
              <tr>
                <th className="p-4 font-medium">Data</th>
                <th className="p-4 font-medium">Ação</th>
                <th className="p-4 font-medium">Autor</th>
                <th className="p-4 font-medium">Entidade</th>
                <th className="p-4 font-medium">Justificativa</th>
                <th className="p-4 font-medium">Valores</th>
              </tr>
            </thead>
            <tbody>
              {filtrados.map((log) => (
                <tr key={log.id} className="border-b border-border align-top last:border-0">
                  <td className="p-4" data-label="Data">
                    {formatarDataHora(log.criadoEm)}
                  </td>
                  <td className="p-4" data-label="Ação">
                    <Badge variant="outline">{log.acao}</Badge>
                  </td>
                  <td className="p-4" data-label="Autor">
                    <span className="font-medium">{log.autorNome}</span>
                    <span className="block text-xs text-muted-foreground">{log.autorPapel}</span>
                  </td>
                  <td className="p-4" data-label="Entidade">
                    <span>{log.entidade}</span>
                    {log.detalheEntidade ? (
                      <span className="block text-xs font-medium text-foreground">
                        {log.detalheEntidade}
                      </span>
                    ) : null}
                    <span className="block max-w-full truncate text-xs text-muted-foreground sm:max-w-40">
                      {log.entidadeId}
                    </span>
                  </td>
                  <td className="p-4" data-label="Justificativa">
                    {log.justificativa ?? "—"}
                  </td>
                  <td className="p-4" data-label="Valores">
                    <details>
                      <summary className="cursor-pointer text-xs text-primary">Ver JSON</summary>
                      <pre className="mt-2 max-w-full overflow-auto rounded-md bg-muted p-2 text-xs sm:max-w-80">
                        {JSON.stringify({ antigo: log.valorAntigo, novo: log.valorNovo }, null, 2)}
                      </pre>
                    </details>
                  </td>
                </tr>
              ))}
              {filtrados.length === 0 && (
                <tr>
                  <td colSpan={6} className="p-10 text-center text-muted-foreground">
                    {logs.length === 0
                      ? "Nenhum log registrado."
                      : "Nenhum log corresponde à busca."}
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

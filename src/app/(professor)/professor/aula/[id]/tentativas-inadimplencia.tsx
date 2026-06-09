import { ShieldAlert } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import type { TentativaInadimplenteAula } from "@/lib/aula-monitoramento"
import { formatarDataHora } from "@/lib/utils/datas"

export function TentativasInadimplencia({
  tentativas,
}: {
  tentativas: TentativaInadimplenteAula[]
}) {
  if (tentativas.length === 0) return null

  return (
    <Card className="border-warning/40 bg-warning/5">
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <ShieldAlert className="size-4 text-warning" />
            Tentativas bloqueadas
          </CardTitle>
          <Badge variant="warning">{tentativas.length} aluno(s)</Badge>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <table className="tabela-responsiva w-full text-sm">
          <thead className="border-b border-border text-left text-muted-foreground">
            <tr>
              <th className="p-4 font-medium">Aluno</th>
              <th className="p-4 font-medium">Motivo</th>
              <th className="p-4 font-medium">Última tentativa</th>
              <th className="p-4 text-right font-medium">Tentativas</th>
            </tr>
          </thead>
          <tbody>
            {tentativas.map((tentativa) => (
              <tr key={tentativa.alunoId} className="border-b border-border last:border-0">
                <td className="p-4 font-medium" data-label="Aluno">
                  {tentativa.nome}
                </td>
                <td className="p-4" data-label="Motivo">
                  {tentativa.motivo}
                </td>
                <td className="p-4" data-label="Última tentativa">
                  {formatarDataHora(tentativa.ultimaTentativaEm)}
                </td>
                <td className="p-4 text-right tabular-nums" data-label="Tentativas">
                  {tentativa.totalTentativas}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  )
}

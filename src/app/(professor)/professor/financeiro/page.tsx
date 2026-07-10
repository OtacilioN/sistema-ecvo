import type { StatusMensalidade } from "@prisma/client"
import { AlertTriangle, CalendarClock, CircleDollarSign } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { CabecalhoPagina } from "@/components/ui/cabecalho-pagina"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { exigirProfessor } from "@/lib/auth/dal"
import {
  listarMensalidadesAcompanhamentoProfessor,
  statusMensalidadeEfetivo,
} from "@/lib/services/financeiro.service"
import { cn } from "@/lib/utils"
import { formatarData } from "@/lib/utils/datas"
import { formatarBRL } from "@/lib/utils/formato"

export const dynamic = "force-dynamic"

const rotulosStatusMensalidade: Record<StatusMensalidade, string> = {
  EM_ABERTO: "Vence em breve",
  PAGA: "Paga",
  VENCIDA: "Vencida",
  CANCELADA: "Cancelada",
  ISENTA: "Isenta",
}

export default async function ProfessorFinanceiroPage() {
  const { professorId } = await exigirProfessor()
  const hoje = new Date()
  const mensalidades = await listarMensalidadesAcompanhamentoProfessor(professorId, undefined, {
    agora: hoje,
  })
  const mensalidadesComStatus = mensalidades.map((mensalidade) => ({
    ...mensalidade,
    statusEfetivo: statusMensalidadeEfetivo(mensalidade, hoje),
    valorNumero: Number(mensalidade.valor),
  }))
  const vencidas = mensalidadesComStatus.filter(
    (mensalidade) => mensalidade.statusEfetivo === "VENCIDA",
  )
  const aVencer = mensalidadesComStatus.filter(
    (mensalidade) => mensalidade.statusEfetivo === "EM_ABERTO",
  )
  const valorVencido = vencidas.reduce((total, mensalidade) => total + mensalidade.valorNumero, 0)

  return (
    <div className="space-y-6">
      <CabecalhoPagina
        titulo="Financeiro dos meus alunos"
        descricao="Mensalidades vencidas e vencimentos próximos dos alunos vinculados às suas modalidades."
      />

      <div className="grid gap-4 md:grid-cols-3">
        <IndicadorFinanceiro
          titulo="Inadimplentes"
          valor={vencidas.length.toString()}
          detalhe="mensalidades vencidas"
          icone={<AlertTriangle className="size-5" />}
          destaque="destructive"
        />
        <IndicadorFinanceiro
          titulo="Vencem até amanhã"
          valor={aVencer.length.toString()}
          detalhe="avisos preventivos"
          icone={<CalendarClock className="size-5" />}
        />
        <IndicadorFinanceiro
          titulo="Valor vencido"
          valor={formatarBRL(valorVencido)}
          detalhe="dos seus alunos"
          icone={<CircleDollarSign className="size-5" />}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Mensalidades em atenção</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="tabela-responsiva w-full text-sm">
              <thead className="border-b border-border text-left text-muted-foreground">
                <tr>
                  <th className="p-4 font-medium">Aluno</th>
                  <th className="p-4 font-medium">Plano</th>
                  <th className="p-4 font-medium">Competência</th>
                  <th className="p-4 font-medium">Vencimento</th>
                  <th className="p-4 font-medium">Valor</th>
                  <th className="p-4 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {mensalidadesComStatus.map((mensalidade) => {
                  const vencida = mensalidade.statusEfetivo === "VENCIDA"
                  return (
                    <tr
                      key={mensalidade.id}
                      className={cn(
                        "border-b border-border transition-colors last:border-0 hover:bg-muted/40",
                        vencida && "bg-destructive/5 hover:bg-destructive/10",
                      )}
                    >
                      <td className="p-4 font-medium" data-label="Aluno">
                        {mensalidade.aluno.usuario.nome}
                      </td>
                      <td className="p-4 text-muted-foreground" data-label="Plano">
                        {mensalidade.aluno.plano?.nome ?? "Sem plano"}
                      </td>
                      <td className="p-4 tabular-nums" data-label="Competência">
                        {mensalidade.competencia}
                      </td>
                      <td
                        className={cn(
                          "p-4 tabular-nums",
                          vencida && "font-semibold text-destructive",
                        )}
                        data-label="Vencimento"
                      >
                        {formatarData(mensalidade.vencimento)}
                      </td>
                      <td className="p-4 tabular-nums" data-label="Valor">
                        {formatarBRL(mensalidade.valorNumero)}
                      </td>
                      <td className="p-4" data-label="Status">
                        <Badge
                          variant={vencida ? "destructive" : "outline"}
                          className={cn(
                            "whitespace-nowrap",
                            !vencida && "border-sky-200 bg-sky-50 text-sky-800",
                          )}
                        >
                          {rotulosStatusMensalidade[mensalidade.statusEfetivo]}
                        </Badge>
                      </td>
                    </tr>
                  )
                })}
                {mensalidadesComStatus.length === 0 && (
                  <tr>
                    <td colSpan={6} className="p-10 text-center text-muted-foreground">
                      Nenhuma mensalidade vencida ou próxima do vencimento para seus alunos.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

function IndicadorFinanceiro({
  titulo,
  valor,
  detalhe,
  icone,
  destaque,
}: {
  titulo: string
  valor: string
  detalhe: string
  icone: React.ReactNode
  destaque?: "destructive"
}) {
  return (
    <Card className={cn(destaque === "destructive" && "border-destructive/25 bg-destructive/5")}>
      <CardHeader className="flex-row items-center justify-between gap-3 space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{titulo}</CardTitle>
        <div
          className={cn("text-muted-foreground", destaque === "destructive" && "text-destructive")}
        >
          {icone}
        </div>
      </CardHeader>
      <CardContent>
        <p
          className={cn(
            "break-words text-2xl font-bold tabular-nums",
            destaque === "destructive" && "text-destructive",
          )}
        >
          {valor}
        </p>
        <p className="text-xs text-muted-foreground">{detalhe}</p>
      </CardContent>
    </Card>
  )
}

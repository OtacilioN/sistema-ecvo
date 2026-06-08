import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { exigirAluno } from "@/lib/auth/dal"
import { db } from "@/lib/db"
import { mensalistaAdimplente, statusMensalidadeEfetivo } from "@/lib/services/financeiro.service"
import { formatarData } from "@/lib/utils/datas"
import { formatarBRL } from "@/lib/utils/formato"

export const dynamic = "force-dynamic"

export default async function Page() {
  const { alunoId } = await exigirAluno()
  const aluno = await db.aluno.findUnique({
    where: { id: alunoId },
    include: {
      plano: true,
      modalidadesPlano: { select: { modalidade: { select: { nome: true } } } },
      mensalidades: { orderBy: { vencimento: "desc" }, take: 12 },
      pagamentos: { orderBy: { criadoEm: "desc" }, take: 12 },
    },
  })

  if (!aluno) return null

  const temMensalidadeInterna = Boolean(aluno.planoId)
  const adimplente = temMensalidadeInterna ? mensalistaAdimplente(aluno.mensalidades) : true
  const tipoSomenteExterno =
    !temMensalidadeInterna && (aluno.tipo === "WELLHUB" || aluno.tipo === "TOTALPASS")

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold tracking-tight">Financeiro</h1>
        <p className="text-sm text-muted-foreground">Plano, mensalidades e pagamentos.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardContent className="py-5">
            <p className="text-xs text-muted-foreground">Tipo</p>
            <p className="mt-1 font-semibold">{aluno.tipo}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-5">
            <p className="text-xs text-muted-foreground">Situação</p>
            <Badge className="mt-2" variant={adimplente ? "success" : "warning"}>
              {adimplente ? "Em dia" : "Pendente"}
            </Badge>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-5">
            <p className="text-xs text-muted-foreground">Plano</p>
            <p className="mt-1 font-semibold">{aluno.plano?.nome ?? "—"}</p>
          </CardContent>
        </Card>
      </div>

      {tipoSomenteExterno && (
        <Card>
          <CardContent className="py-5 text-sm text-muted-foreground">
            Seu vínculo {aluno.tipo} está sem plano mensal interno. A conferência é feita por
            conciliação externa.
          </CardContent>
        </Card>
      )}

      {aluno.plano && (
        <Card>
          <CardHeader>
            <CardTitle>Plano contratado</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-3">
            <Campo rotulo="Valor" valor={formatarBRL(Number(aluno.plano.valor))} />
            <Campo rotulo="Vencimento" valor={`Dia ${aluno.diaVencimento}`} />
            <Campo
              rotulo="Modalidades contratadas"
              valor={aluno.modalidadesPlano.map((item) => item.modalidade.nome).join(", ")}
            />
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Mensalidades</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <table className="tabela-responsiva w-full text-sm">
            <thead className="border-b border-border text-left text-muted-foreground">
              <tr>
                <th className="p-4 font-medium">Competência</th>
                <th className="p-4 font-medium">Vencimento</th>
                <th className="p-4 font-medium">Valor</th>
                <th className="p-4 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {aluno.mensalidades.map((mensalidade) => {
                const status = statusMensalidadeEfetivo(mensalidade)
                return (
                  <tr key={mensalidade.id} className="border-b border-border last:border-0">
                    <td className="p-4" data-label="Competência">
                      {mensalidade.competencia}
                    </td>
                    <td className="p-4" data-label="Vencimento">
                      {formatarData(mensalidade.vencimento)}
                    </td>
                    <td className="p-4" data-label="Valor">
                      {formatarBRL(Number(mensalidade.valor))}
                    </td>
                    <td className="p-4" data-label="Status">
                      <Badge
                        variant={status === "PAGA" || status === "ISENTA" ? "success" : "warning"}
                      >
                        {status}
                      </Badge>
                    </td>
                  </tr>
                )
              })}
              {aluno.mensalidades.length === 0 && (
                <tr>
                  <td colSpan={4} className="p-8 text-center text-muted-foreground">
                    Nenhuma mensalidade registrada.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Pagamentos avulsos</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {aluno.pagamentos.map((pagamento) => (
            <div key={pagamento.id} className="border-b border-border pb-3 last:border-0 last:pb-0">
              <div className="flex items-center justify-between gap-3">
                <p className="font-medium">{pagamento.descricao ?? pagamento.tipo}</p>
                <Badge variant="outline">{pagamento.tipo}</Badge>
              </div>
              <p className="text-sm text-muted-foreground">
                {formatarBRL(Number(pagamento.valor))} · {formatarData(pagamento.criadoEm)}
              </p>
            </div>
          ))}
          {aluno.pagamentos.length === 0 && (
            <p className="text-sm text-muted-foreground">Nenhum pagamento avulso registrado.</p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function Campo({ rotulo, valor }: { rotulo: string; valor?: string | null }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{rotulo}</p>
      <p className="mt-1 text-sm font-medium">{valor && valor.length > 0 ? valor : "—"}</p>
    </div>
  )
}

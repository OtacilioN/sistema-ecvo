import Link from "next/link"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { CabecalhoPagina } from "@/components/ui/cabecalho-pagina"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { exigirPapel } from "@/lib/auth/dal"
import { db } from "@/lib/db"
import { statusMensalidadeEfetivo } from "@/lib/services/financeiro.service"
import { formatarData } from "@/lib/utils/datas"
import { formatarBRL } from "@/lib/utils/formato"
import { AcoesFinanceiro, AcoesMensalidade, AcoesPlano } from "./acoes-financeiro"

export const dynamic = "force-dynamic"

export default async function Page() {
  await exigirPapel("GESTOR")
  const [planos, alunos, mensalidades, pagamentos] = await Promise.all([
    db.plano.findMany({
      orderBy: { criadoEm: "desc" },
      include: { _count: { select: { alunos: true } } },
    }),
    db.aluno.findMany({
      orderBy: { usuario: { nome: "asc" } },
      include: {
        usuario: { select: { nome: true } },
        plano: { select: { nome: true } },
        modalidades: { select: { id: true, nome: true } },
        modalidadesPlano: { select: { modalidade: { select: { id: true, nome: true } } } },
      },
    }),
    db.mensalidade.findMany({
      orderBy: [{ status: "asc" }, { vencimento: "asc" }],
      take: 20,
      include: {
        aluno: { select: { usuario: { select: { nome: true } } } },
        plano: { select: { nome: true } },
      },
    }),
    db.pagamento.findMany({
      orderBy: { criadoEm: "desc" },
      take: 12,
      include: { aluno: { select: { usuario: { select: { nome: true } } } } },
    }),
  ])

  const alunosOpcao = alunos.map((aluno) => ({
    id: aluno.id,
    nome: aluno.usuario.nome,
    detalhe: aluno.plano
      ? `${aluno.tipo} · ${aluno.plano.nome} · venc. dia ${aluno.diaVencimento}`
      : `${aluno.tipo} · venc. dia ${aluno.diaVencimento}`,
    modalidades: aluno.modalidades.map((modalidade) => ({
      id: modalidade.id,
      nome: modalidade.nome,
    })),
    modalidadeContratadaIds: aluno.modalidadesPlano.map((item) => item.modalidade.id),
  }))
  const planosOpcao = planos.map((plano) => ({
    id: plano.id,
    nome: plano.nome,
    valor: Number(plano.valor),
    periodicidade: plano.periodicidade,
    limiteAulas: plano.limiteAulas,
    ativo: plano.ativo,
  }))

  return (
    <div className="space-y-6">
      <CabecalhoPagina titulo="Financeiro" descricao="Planos, mensalidades e pagamentos avulsos.">
        <Button asChild variant="outline">
          <Link href="/gestao/financeiro/repasses">Ver repasses</Link>
        </Button>
        <AcoesFinanceiro planos={planosOpcao} alunos={alunosOpcao} />
      </CabecalhoPagina>

      <div className="grid gap-4 xl:grid-cols-[1fr_0.9fr]">
        <Card>
          <CardHeader>
            <CardTitle>Mensalidades recentes</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="tabela-responsiva w-full text-sm">
                <thead className="border-b border-border text-left text-muted-foreground">
                  <tr>
                    <th className="p-4 font-medium">Aluno</th>
                    <th className="p-4 font-medium">Competência</th>
                    <th className="p-4 font-medium">Vencimento</th>
                    <th className="p-4 font-medium">Valor</th>
                    <th className="p-4 font-medium">Status</th>
                    <th className="p-4 text-right font-medium">
                      <span className="sr-only">Ações</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {mensalidades.map((mensalidade) => {
                    const status = statusMensalidadeEfetivo(mensalidade)
                    const quitada = status === "PAGA" || status === "ISENTA"
                    return (
                      <tr
                        key={mensalidade.id}
                        className="border-b border-border transition-colors last:border-0 hover:bg-muted/40"
                      >
                        <td className="p-4 font-medium" data-label="Aluno">
                          {mensalidade.aluno.usuario.nome}
                        </td>
                        <td className="p-4" data-label="Competência">
                          {mensalidade.competencia}
                        </td>
                        <td className="p-4" data-label="Vencimento">
                          {formatarData(mensalidade.vencimento)}
                        </td>
                        <td className="p-4 tabular-nums" data-label="Valor">
                          {formatarBRL(Number(mensalidade.valor))}
                        </td>
                        <td className="p-4" data-label="Status">
                          <Badge variant={quitada ? "success" : "warning"}>{status}</Badge>
                        </td>
                        <td className="p-4" data-label="Ações">
                          <div className="flex justify-end">
                            <AcoesMensalidade
                              mensalidadeId={mensalidade.id}
                              status={mensalidade.status}
                              formaPagamento={mensalidade.formaPagamento}
                              observacao={mensalidade.observacao}
                              quitada={quitada}
                            />
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                  {mensalidades.length === 0 && (
                    <tr>
                      <td colSpan={6} className="p-10 text-center text-muted-foreground">
                        Nenhuma mensalidade registrada.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Planos</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {planos.map((plano) => (
                <div key={plano.id} className="border-b border-border pb-3 last:border-0 last:pb-0">
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-medium">{plano.nome}</p>
                    <div className="flex items-center gap-2">
                      <Badge variant={plano.ativo ? "success" : "secondary"}>
                        {plano.ativo ? "Ativo" : "Inativo"}
                      </Badge>
                      <AcoesPlano
                        plano={{
                          id: plano.id,
                          nome: plano.nome,
                          valor: Number(plano.valor),
                          periodicidade: plano.periodicidade,
                          limiteAulas: plano.limiteAulas,
                          ativo: plano.ativo,
                        }}
                        planos={planosOpcao}
                        alunosVinculados={plano._count.alunos}
                      />
                    </div>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {formatarBRL(Number(plano.valor))} · {plano._count.alunos} aluno(s)
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Disponível para qualquer modalidade
                  </p>
                </div>
              ))}
              {planos.length === 0 && (
                <p className="text-sm text-muted-foreground">Nenhum plano.</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Pagamentos avulsos</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {pagamentos.map((pagamento) => (
                <div
                  key={pagamento.id}
                  className="border-b border-border pb-3 last:border-0 last:pb-0"
                >
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-medium">{pagamento.aluno?.usuario.nome ?? "Sem aluno"}</p>
                    <Badge variant="outline">{pagamento.tipo}</Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {formatarBRL(Number(pagamento.valor))} · {formatarData(pagamento.criadoEm)}
                  </p>
                  {pagamento.descricao && (
                    <p className="text-xs text-muted-foreground">{pagamento.descricao}</p>
                  )}
                </div>
              ))}
              {pagamentos.length === 0 && (
                <p className="text-sm text-muted-foreground">Nenhum pagamento avulso.</p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}

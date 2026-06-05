import Link from "next/link"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { CabecalhoPagina } from "@/components/ui/cabecalho-pagina"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { exigirPapel } from "@/lib/auth/dal"
import { db } from "@/lib/db"
import { formatarData, minutosParaHoras } from "@/lib/utils/datas"
import { formatarBRL } from "@/lib/utils/formato"

export const dynamic = "force-dynamic"

type SearchParams = Promise<Record<string, string | string[] | undefined>>

function valorUnico(valor: string | string[] | undefined) {
  return Array.isArray(valor) ? valor[0] : valor
}

function inicioDiaLocal(valor: string | undefined) {
  if (!valor) return undefined
  const data = new Date(`${valor}T00:00:00-03:00`)
  return Number.isNaN(data.getTime()) ? undefined : data
}

function fimDiaLocalExclusivo(valor: string | undefined) {
  if (!valor) return undefined
  const data = new Date(`${valor}T00:00:00-03:00`)
  if (Number.isNaN(data.getTime())) return undefined
  data.setDate(data.getDate() + 1)
  return data
}

function intervaloDatas(de: Date | undefined, ate: Date | undefined) {
  if (!de && !ate) return undefined
  return {
    ...(de ? { gte: de } : {}),
    ...(ate ? { lt: ate } : {}),
  }
}

export default async function Page({ searchParams }: { searchParams: SearchParams }) {
  await exigirPapel("GESTOR")
  const params = await searchParams
  const deParam = valorUnico(params.de)
  const ateParam = valorUnico(params.ate)
  const de = inicioDiaLocal(deParam)
  const ate = fimDiaLocalExclusivo(ateParam)
  const periodo = intervaloDatas(de, ate)
  const periodoLegivel =
    de || ate
      ? `${de ? formatarData(de) : "início"} até ${ate ? formatarData(new Date(ate.getTime() - 1)) : "hoje"}`
      : "Todo o histórico"

  const [
    alunosAtivos,
    professoresAtivos,
    aulasRealizadas,
    checkinsValidos,
    comparecimentos,
    movimentosHoras,
    graduacoes,
    mensalidadesAbertas,
    pagamentos,
    importacoes,
    horasPorModalidade,
    alunosPorTipo,
    configuracao,
    rankingHoras,
    alunosPorStatus,
    comparecimentosPorStatus,
    checkinsPorStatus,
    checkinsPorOrigem,
    conciliacaoPorStatus,
  ] = await Promise.all([
    db.aluno.count({ where: { status: "ATIVO" } }),
    db.professor.count({ where: { ativo: true } }),
    db.aula.count({ where: { fim: { lt: new Date() }, ...(periodo ? { inicio: periodo } : {}) } }),
    db.checkin.count({ where: { status: "VALIDO", ...(periodo ? { criadoEm: periodo } : {}) } }),
    db.comparecimento.count({ where: periodo ? { criadoEm: periodo } : undefined }),
    db.movimentoHoras.aggregate({
      where: periodo ? { criadoEm: periodo } : undefined,
      _sum: { minutos: true },
    }),
    db.graduacaoAluno.count({ where: periodo ? { concedidaEm: periodo } : undefined }),
    db.mensalidade.aggregate({
      where: {
        status: { in: ["EM_ABERTO", "VENCIDA"] },
        ...(periodo ? { vencimento: periodo } : {}),
      },
      _sum: { valor: true },
      _count: true,
    }),
    db.pagamento.aggregate({
      where: periodo ? { criadoEm: periodo } : undefined,
      _sum: { valor: true },
      _count: true,
    }),
    db.importacao.aggregate({
      where: periodo ? { criadoEm: periodo } : undefined,
      _sum: { totalLinhas: true, totalConciliados: true, totalDivergencias: true },
      _count: true,
    }),
    db.movimentoHoras.groupBy({
      by: ["modalidadeId"],
      where: periodo ? { criadoEm: periodo } : undefined,
      _sum: { minutos: true },
      orderBy: { _sum: { minutos: "desc" } },
      take: 8,
    }),
    db.aluno.groupBy({ by: ["tipo"], _count: true }),
    db.configuracaoAcademia.findUnique({
      where: { id: "default" },
      select: { rankingHorasAtivo: true },
    }),
    db.movimentoHoras.groupBy({
      by: ["alunoId"],
      _sum: { minutos: true },
      orderBy: { _sum: { minutos: "desc" } },
      take: 10,
    }),
    db.aluno.groupBy({ by: ["status"], _count: true }),
    db.comparecimento.groupBy({
      by: ["status"],
      where: periodo ? { criadoEm: periodo } : undefined,
      _count: true,
    }),
    db.checkin.groupBy({
      by: ["status"],
      where: periodo ? { criadoEm: periodo } : undefined,
      _count: true,
    }),
    db.checkin.groupBy({
      by: ["origem"],
      where: periodo ? { criadoEm: periodo } : undefined,
      _count: { _all: true },
    }),
    db.registroImportado.groupBy({
      by: ["statusConciliacao"],
      where: periodo ? { importacao: { criadoEm: periodo } } : undefined,
      _count: true,
    }),
  ])

  const modalidades = await db.modalidade.findMany({
    where: { id: { in: horasPorModalidade.map((h) => h.modalidadeId) } },
    select: { id: true, nome: true },
  })
  const nomeModalidade = new Map(modalidades.map((m) => [m.id, m.nome]))
  const rankingVisivel = Boolean(configuracao?.rankingHorasAtivo)
  const rankingComHoras = rankingHoras.filter((item) => (item._sum.minutos ?? 0) > 0)
  const alunosRanking = rankingVisivel
    ? await db.aluno.findMany({
        where: { id: { in: rankingComHoras.map((item) => item.alunoId) } },
        select: { id: true, usuario: { select: { nome: true } } },
      })
    : []
  const nomeAluno = new Map(alunosRanking.map((aluno) => [aluno.id, aluno.usuario.nome]))
  const checkinsPorOrigemOrdenado = [...checkinsPorOrigem].sort(
    (a, b) => (b._count?._all ?? 0) - (a._count?._all ?? 0),
  )

  return (
    <div className="space-y-6">
      <CabecalhoPagina
        titulo="Relatórios"
        descricao="Indicadores operacionais, presença, horas, graduação, financeiro e conciliação."
      />

      <Card>
        <CardContent className="py-4">
          <form className="grid gap-3 md:grid-cols-[1fr_1fr_auto_auto] md:items-end">
            <div className="grid gap-2">
              <Label htmlFor="de">De</Label>
              <Input id="de" type="date" name="de" defaultValue={deParam} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="ate">Até</Label>
              <Input id="ate" type="date" name="ate" defaultValue={ateParam} />
            </div>
            <Button type="submit">Filtrar</Button>
            <Button asChild variant="outline">
              <Link href="/gestao/relatorios">Limpar</Link>
            </Button>
          </form>
          <p className="mt-3 text-xs text-muted-foreground">Período aplicado: {periodoLegivel}</p>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-4">
        <Resumo rotulo="Alunos ativos" valor={alunosAtivos} />
        <Resumo rotulo="Professores" valor={professoresAtivos} />
        <Resumo rotulo="Check-ins válidos" valor={checkinsValidos} />
        <Resumo
          rotulo="Horas treinadas"
          valor={`${minutosParaHoras(movimentosHoras._sum.minutos ?? 0)}h`}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Operação de treino</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Linha rotulo="Aulas realizadas" valor={aulasRealizadas} />
            <Linha rotulo="Comparecimentos" valor={comparecimentos} />
            <Linha rotulo="Presenças por check-in" valor={checkinsValidos} />
            <Linha rotulo="Registros de graduação" valor={graduacoes} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Financeiro</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Linha rotulo="Mensalidades pendentes" valor={mensalidadesAbertas._count} />
            <Linha
              rotulo="Valor pendente"
              valor={formatarBRL(Number(mensalidadesAbertas._sum.valor ?? 0))}
            />
            <Linha rotulo="Pagamentos avulsos" valor={pagamentos._count} />
            <Linha rotulo="Valor avulso" valor={formatarBRL(Number(pagamentos._sum.valor ?? 0))} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Conciliação</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Linha rotulo="Importações" valor={importacoes._count} />
            <Linha rotulo="Linhas importadas" valor={importacoes._sum.totalLinhas ?? 0} />
            <Linha rotulo="Conciliadas" valor={importacoes._sum.totalConciliados ?? 0} />
            <Linha rotulo="Divergências" valor={importacoes._sum.totalDivergencias ?? 0} />
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_0.8fr]">
        <Card>
          <CardHeader>
            <CardTitle>Horas por modalidade</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {horasPorModalidade.map((item) => (
              <Linha
                key={item.modalidadeId}
                rotulo={nomeModalidade.get(item.modalidadeId) ?? "Modalidade"}
                valor={`${minutosParaHoras(item._sum.minutos ?? 0)}h`}
              />
            ))}
            {horasPorModalidade.length === 0 && (
              <p className="text-sm text-muted-foreground">Sem horas registradas.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Alunos por tipo</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {alunosPorTipo.map((item) => (
              <div key={item.tipo} className="flex items-center justify-between">
                <Badge variant="outline">{item.tipo}</Badge>
                <span className="font-semibold tabular-nums">{item._count}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-4">
        <Card>
          <CardHeader>
            <CardTitle>Alunos por status</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {alunosPorStatus.map((item) => (
              <Linha key={item.status} rotulo={item.status} valor={item._count} />
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Comparecimentos por status</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {comparecimentosPorStatus.map((item) => (
              <Linha key={item.status} rotulo={item.status} valor={item._count} />
            ))}
            {comparecimentosPorStatus.length === 0 && (
              <p className="text-sm text-muted-foreground">Sem registros no período.</p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Check-ins por status</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {checkinsPorStatus.map((item) => (
              <Linha key={item.status} rotulo={item.status} valor={item._count} />
            ))}
            {checkinsPorStatus.length === 0 && (
              <p className="text-sm text-muted-foreground">Sem registros no período.</p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Check-ins por origem</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {checkinsPorOrigemOrdenado.map((item) => (
              <Linha key={item.origem} rotulo={item.origem} valor={item._count?._all ?? 0} />
            ))}
            {checkinsPorOrigem.length === 0 && (
              <p className="text-sm text-muted-foreground">Sem registros no período.</p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Conciliação por status</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {conciliacaoPorStatus.map((item) => (
              <Linha
                key={item.statusConciliacao}
                rotulo={item.statusConciliacao}
                valor={item._count}
              />
            ))}
            {conciliacaoPorStatus.length === 0 && (
              <p className="text-sm text-muted-foreground">Sem registros no período.</p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Ranking de horas</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {!rankingVisivel ? (
            <p className="text-sm text-muted-foreground">
              Ranking desativado nas configurações da academia.
            </p>
          ) : rankingComHoras.length > 0 ? (
            rankingComHoras.map((item, index) => (
              <div
                key={item.alunoId}
                className="flex items-center justify-between gap-4 border-b border-border pb-2 last:border-0 last:pb-0"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <Badge variant="outline">{index + 1}</Badge>
                  <span className="truncate text-sm font-medium">
                    {nomeAluno.get(item.alunoId) ?? "Aluno"}
                  </span>
                </div>
                <span className="font-semibold tabular-nums">
                  {minutosParaHoras(item._sum.minutos ?? 0)}h
                </span>
              </div>
            ))
          ) : (
            <p className="text-sm text-muted-foreground">Sem horas registradas para ranking.</p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function Resumo({ rotulo, valor }: { rotulo: string; valor: number | string }) {
  return (
    <Card>
      <CardContent className="py-5">
        <p className="text-xs text-muted-foreground">{rotulo}</p>
        <p className="mt-1 text-2xl font-bold tabular-nums">{valor}</p>
      </CardContent>
    </Card>
  )
}

function Linha({ rotulo, valor }: { rotulo: string; valor: number | string }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-border pb-2 last:border-0 last:pb-0">
      <span className="text-sm text-muted-foreground">{rotulo}</span>
      <span className="font-semibold tabular-nums">{valor}</span>
    </div>
  )
}

import type { LucideIcon } from "lucide-react"
import {
  Activity,
  BadgeCheck,
  CalendarRange,
  Clock,
  FileSpreadsheet,
  Layers,
  Medal,
  Trophy,
  UserRound,
  Users,
  Wallet,
} from "lucide-react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { CabecalhoPagina } from "@/components/ui/cabecalho-pagina"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { STATUS_ALUNO_OPERACIONAIS } from "@/lib/alunos/status"
import { exigirGestao } from "@/lib/auth/dal"
import { db } from "@/lib/db"
import { cn } from "@/lib/utils"
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
  await exigirGestao()
  const params = await searchParams
  const deParam = valorUnico(params.de)
  const ateParam = valorUnico(params.ate)
  const de = inicioDiaLocal(deParam)
  const ate = fimDiaLocalExclusivo(ateParam)
  const periodo = intervaloDatas(de, ate)
  const temPeriodo = Boolean(de || ate)
  const statusAlunosOperacionais = [...STATUS_ALUNO_OPERACIONAIS]
  const periodoLegivel = temPeriodo
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
    db.aluno.count({ where: { status: { in: statusAlunosOperacionais } } }),
    db.professor.count({ where: { ativo: true } }),
    db.aula.count({ where: { fim: { lt: new Date() }, ...(periodo ? { inicio: periodo } : {}) } }),
    db.checkin.count({
      where: {
        status: "VALIDO",
        aluno: { status: { in: statusAlunosOperacionais } },
        ...(periodo ? { criadoEm: periodo } : {}),
      },
    }),
    db.comparecimento.count({
      where: {
        aluno: { status: { in: statusAlunosOperacionais } },
        ...(periodo ? { criadoEm: periodo } : {}),
      },
    }),
    db.movimentoHoras.aggregate({
      where: {
        aluno: { status: { in: statusAlunosOperacionais } },
        ...(periodo ? { criadoEm: periodo } : {}),
      },
      _sum: { minutos: true },
    }),
    db.graduacaoAluno.count({
      where: {
        aluno: { status: { in: statusAlunosOperacionais } },
        ...(periodo ? { concedidaEm: periodo } : {}),
      },
    }),
    db.mensalidade.aggregate({
      where: {
        status: { in: ["EM_ABERTO", "VENCIDA"] },
        aluno: { status: { in: statusAlunosOperacionais } },
        ...(periodo ? { vencimento: periodo } : {}),
      },
      _sum: { valor: true },
      _count: true,
    }),
    db.pagamento.aggregate({
      where: {
        OR: [{ alunoId: null }, { aluno: { status: { in: statusAlunosOperacionais } } }],
        ...(periodo ? { criadoEm: periodo } : {}),
      },
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
      where: {
        aluno: { status: { in: statusAlunosOperacionais } },
        ...(periodo ? { criadoEm: periodo } : {}),
      },
      _sum: { minutos: true },
      orderBy: { _sum: { minutos: "desc" } },
      take: 8,
    }),
    db.aluno.groupBy({
      by: ["tipo"],
      where: { status: { in: statusAlunosOperacionais } },
      _count: true,
    }),
    db.configuracaoAcademia.findUnique({
      where: { id: "default" },
      select: { rankingHorasAtivo: true },
    }),
    db.movimentoHoras.groupBy({
      by: ["alunoId"],
      where: { aluno: { status: { in: statusAlunosOperacionais } } },
      _sum: { minutos: true },
      orderBy: { _sum: { minutos: "desc" } },
      take: 10,
    }),
    db.aluno.groupBy({
      by: ["status"],
      where: { status: { in: statusAlunosOperacionais } },
      _count: true,
    }),
    db.comparecimento.groupBy({
      by: ["status"],
      where: {
        aluno: { status: { in: statusAlunosOperacionais } },
        ...(periodo ? { criadoEm: periodo } : {}),
      },
      _count: true,
    }),
    db.checkin.groupBy({
      by: ["status"],
      where: {
        aluno: { status: { in: statusAlunosOperacionais } },
        ...(periodo ? { criadoEm: periodo } : {}),
      },
      _count: true,
    }),
    db.checkin.groupBy({
      by: ["origem"],
      where: {
        aluno: { status: { in: statusAlunosOperacionais } },
        ...(periodo ? { criadoEm: periodo } : {}),
      },
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
        where: {
          id: { in: rankingComHoras.map((item) => item.alunoId) },
          status: { in: statusAlunosOperacionais },
        },
        select: { id: true, usuario: { select: { nome: true } } },
      })
    : []
  const nomeAluno = new Map(alunosRanking.map((aluno) => [aluno.id, aluno.usuario.nome]))
  const checkinsPorOrigemOrdenado = [...checkinsPorOrigem].sort(
    (a, b) => (b._count?._all ?? 0) - (a._count?._all ?? 0),
  )

  const itensModalidade = horasPorModalidade.map((item) => ({
    chave: item.modalidadeId,
    rotulo: nomeModalidade.get(item.modalidadeId) ?? "Modalidade",
    minutos: item._sum.minutos ?? 0,
  }))
  const maiorHoraModalidade = Math.max(0, ...itensModalidade.map((i) => i.minutos))
  const horasTotais = minutosParaHoras(movimentosHoras._sum.minutos ?? 0)
  const valorPendente = Number(mensalidadesAbertas._sum.valor ?? 0)
  const maiorHoraRanking = Math.max(0, ...rankingComHoras.map((i) => i._sum.minutos ?? 0))

  return (
    <div className="space-y-6">
      <CabecalhoPagina
        titulo="Relatórios"
        descricao="Indicadores operacionais, presença, horas, graduação, financeiro e conciliação."
      />

      <Card>
        <CardContent className="p-4 sm:p-5">
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
          <p className="mt-3 inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            <CalendarRange className="size-3.5" />
            Período aplicado:
            <span className="font-medium text-foreground">{periodoLegivel}</span>
          </p>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Kpi icone={Users} rotulo="Alunos ativos" valor={alunosAtivos} tom="primary" />
        <Kpi icone={UserRound} rotulo="Professores" valor={professoresAtivos} tom="neutro" />
        <Kpi icone={BadgeCheck} rotulo="Check-ins válidos" valor={checkinsValidos} tom="positivo" />
        <Kpi icone={Clock} rotulo="Horas treinadas" valor={`${horasTotais}h`} tom="primary" />
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <SecaoCard icone={Activity} titulo="Operação de treino">
          <Linha rotulo="Aulas realizadas" valor={aulasRealizadas} />
          <Linha rotulo="Agendamentos" valor={comparecimentos} />
          <Linha rotulo="Presenças por check-in" valor={checkinsValidos} />
          <Linha rotulo="Registros de graduação" valor={graduacoes} />
        </SecaoCard>

        <SecaoCard icone={Wallet} titulo="Financeiro">
          <Linha rotulo="Mensalidades pendentes" valor={mensalidadesAbertas._count} />
          <Linha rotulo="Valor pendente" valor={formatarBRL(valorPendente)} tom="atencao" />
          <Linha rotulo="Pagamentos avulsos" valor={pagamentos._count} />
          <Linha rotulo="Valor avulso" valor={formatarBRL(Number(pagamentos._sum.valor ?? 0))} />
        </SecaoCard>

        <SecaoCard icone={FileSpreadsheet} titulo="Conciliação">
          <Linha rotulo="Importações" valor={importacoes._count} />
          <Linha rotulo="Linhas importadas" valor={importacoes._sum.totalLinhas ?? 0} />
          <Linha
            rotulo="Conciliadas"
            valor={importacoes._sum.totalConciliados ?? 0}
            tom="positivo"
          />
          <Linha
            rotulo="Divergências"
            valor={importacoes._sum.totalDivergencias ?? 0}
            tom={(importacoes._sum.totalDivergencias ?? 0) > 0 ? "negativo" : "neutro"}
          />
        </SecaoCard>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_0.8fr]">
        <SecaoCard icone={Clock} titulo="Horas por modalidade">
          {itensModalidade.length > 0 ? (
            <div className="space-y-4">
              {itensModalidade.map((item) => (
                <Barra
                  key={item.chave}
                  rotulo={item.rotulo}
                  valor={`${minutosParaHoras(item.minutos)}h`}
                  proporcao={maiorHoraModalidade > 0 ? item.minutos / maiorHoraModalidade : 0}
                  tom="primary"
                />
              ))}
            </div>
          ) : (
            <Vazio>Sem horas registradas no período.</Vazio>
          )}
        </SecaoCard>

        <SecaoCard icone={Layers} titulo="Alunos por tipo">
          <Distribuicao
            itens={alunosPorTipo.map((item) => ({
              chave: item.tipo,
              rotulo: rotular(item.tipo),
              valor: item._count,
              tom: tomDe(item.tipo),
            }))}
            vazio="Sem alunos cadastrados."
          />
        </SecaoCard>
      </div>

      <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
        <SecaoCard icone={Users} titulo="Alunos por status">
          <Distribuicao
            itens={alunosPorStatus.map((item) => ({
              chave: item.status,
              rotulo: rotular(item.status),
              valor: item._count,
              tom: tomDe(item.status),
            }))}
            vazio="Sem alunos cadastrados."
          />
        </SecaoCard>

        <SecaoCard icone={Activity} titulo="Agendamentos por status">
          <Distribuicao
            itens={comparecimentosPorStatus.map((item) => ({
              chave: item.status,
              rotulo: rotular(item.status),
              valor: item._count,
              tom: tomDe(item.status),
            }))}
            vazio="Sem registros no período."
          />
        </SecaoCard>

        <SecaoCard icone={BadgeCheck} titulo="Check-ins por status">
          <Distribuicao
            itens={checkinsPorStatus.map((item) => ({
              chave: item.status,
              rotulo: rotular(item.status),
              valor: item._count,
              tom: tomDe(item.status),
            }))}
            vazio="Sem registros no período."
          />
        </SecaoCard>

        <SecaoCard icone={Activity} titulo="Check-ins por origem">
          <Distribuicao
            itens={checkinsPorOrigemOrdenado.map((item) => ({
              chave: item.origem,
              rotulo: rotular(item.origem),
              valor: item._count?._all ?? 0,
              tom: "neutro" as const,
            }))}
            vazio="Sem registros no período."
          />
        </SecaoCard>

        <SecaoCard icone={FileSpreadsheet} titulo="Conciliação por status">
          <Distribuicao
            itens={conciliacaoPorStatus.map((item) => ({
              chave: item.statusConciliacao,
              rotulo: rotular(item.statusConciliacao),
              valor: item._count,
              tom: tomDe(item.statusConciliacao),
            }))}
            vazio="Sem registros no período."
          />
        </SecaoCard>
      </div>

      <SecaoCard icone={Trophy} titulo="Ranking de horas">
        {!rankingVisivel ? (
          <Vazio>Ranking desativado nas configurações da academia.</Vazio>
        ) : rankingComHoras.length > 0 ? (
          <div className="space-y-2">
            {rankingComHoras.map((item, index) => {
              const minutos = item._sum.minutos ?? 0
              const proporcao = maiorHoraRanking > 0 ? minutos / maiorHoraRanking : 0
              return (
                <div
                  key={item.alunoId}
                  className="relative flex items-center gap-3 overflow-hidden rounded-md border border-border px-3 py-2.5"
                >
                  <div
                    aria-hidden
                    className="absolute inset-y-0 left-0 bg-accent/60"
                    style={{ width: `${Math.max(proporcao * 100, 6)}%` }}
                  />
                  <span
                    className={cn(
                      "relative z-10 flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-bold",
                      corPosicao(index),
                    )}
                  >
                    {index === 0 ? <Medal className="size-4" /> : index + 1}
                  </span>
                  <span className="relative z-10 min-w-0 flex-1 truncate text-sm font-medium">
                    {nomeAluno.get(item.alunoId) ?? "Aluno"}
                  </span>
                  <span className="relative z-10 shrink-0 font-semibold tabular-nums">
                    {minutosParaHoras(minutos)}h
                  </span>
                </div>
              )
            })}
          </div>
        ) : (
          <Vazio>Sem horas registradas para ranking.</Vazio>
        )}
      </SecaoCard>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Apresentação                                                        */
/* ------------------------------------------------------------------ */

type Tom = "primary" | "positivo" | "atencao" | "negativo" | "neutro"

/** Rótulos legíveis (pt-BR) para os enums do domínio exibidos em relatórios. */
const ROTULOS: Record<string, string> = {
  // Tipo de aluno
  MENSALISTA: "Mensalistas",
  WELLHUB: "Wellhub",
  TOTALPASS: "TotalPass",
  AVULSO: "Avulsos",
  // Status de aluno
  ATIVO: "Ativos",
  CANCELADO: "Cancelados",
  INADIMPLENTE: "Inadimplentes",
  TRANCADO: "Trancados",
  // Status de check-in
  VALIDO: "Válidos",
  PENDENTE_REVISAO: "Pendentes de revisão",
  INVALIDADO: "Invalidados",
  EXCLUIDO: "Excluídos",
  // Origem de check-in
  BOTAO: "Botão",
  QR_CODE: "QR Code",
  LANCADO_GESTOR: "Lançado pelo gestor",
  LANCADO_PROFESSOR: "Lançado pelo professor",
  // Status de agendamento
  CONFIRMADO: "Confirmados",
  LISTA_ESPERA: "Lista de espera",
  CANCELADO_ALUNO: "Cancelado (aluno)",
  CANCELADO_GESTOR: "Cancelado (gestor)",
  CONVERTIDO_CHECKIN: "Convertido em check-in",
  AUSENTE: "Ausentes",
  NO_SHOW: "No-show",
  // Conciliação
  CONCILIADO: "Conciliados",
  NAO_ENCONTRADO: "Não encontrados",
  ALUNO_NAO_IDENTIFICADO: "Aluno não identificado",
  DIVERGENCIA_DATA: "Divergência de data",
  DIVERGENCIA_HORARIO: "Divergência de horário",
  CHECKIN_INVALIDADO: "Check-in invalidado",
  DUPLICADO_PLANILHA: "Duplicado (planilha)",
  DUPLICADO_SISTEMA: "Duplicado (sistema)",
  PENDENTE: "Pendentes",
}

function rotular(valor: string) {
  return ROTULOS[valor] ?? valor
}

/** Mapeia um valor de enum para um tom semântico de cor. */
const TONS: Record<string, Tom> = {
  ATIVO: "positivo",
  VALIDO: "positivo",
  CONFIRMADO: "positivo",
  CONCILIADO: "positivo",
  CONVERTIDO_CHECKIN: "positivo",
  PENDENTE_REVISAO: "atencao",
  LISTA_ESPERA: "atencao",
  PENDENTE: "atencao",
  TRANCADO: "atencao",
  CANCELADO: "negativo",
  CANCELADO_ALUNO: "negativo",
  CANCELADO_GESTOR: "negativo",
  INADIMPLENTE: "negativo",
  INVALIDADO: "negativo",
  EXCLUIDO: "negativo",
  AUSENTE: "negativo",
  NO_SHOW: "negativo",
  NAO_ENCONTRADO: "negativo",
  ALUNO_NAO_IDENTIFICADO: "negativo",
  DIVERGENCIA_DATA: "negativo",
  DIVERGENCIA_HORARIO: "negativo",
  CHECKIN_INVALIDADO: "negativo",
  DUPLICADO_PLANILHA: "negativo",
  DUPLICADO_SISTEMA: "negativo",
}

function tomDe(valor: string): Tom {
  return TONS[valor] ?? "neutro"
}

const COR_TILE: Record<Tom, string> = {
  primary: "bg-primary/10 text-primary",
  positivo: "bg-success/10 text-success",
  atencao: "bg-warning/10 text-warning",
  negativo: "bg-destructive/10 text-destructive",
  neutro: "bg-accent text-accent-foreground",
}

const COR_BARRA: Record<Tom, string> = {
  primary: "bg-primary",
  positivo: "bg-success",
  atencao: "bg-warning",
  negativo: "bg-destructive",
  neutro: "bg-muted-foreground/50",
}

const COR_VALOR: Record<Tom, string> = {
  primary: "text-foreground",
  positivo: "text-success",
  atencao: "text-warning",
  negativo: "text-destructive",
  neutro: "text-foreground",
}

function Kpi({
  icone: Icone,
  rotulo,
  valor,
  tom = "neutro",
}: {
  icone: LucideIcon
  rotulo: string
  valor: number | string
  tom?: Tom
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-4 px-4 pb-5 pt-5 sm:px-5 sm:pb-6 sm:pt-6">
        <div
          className={cn(
            "flex size-11 shrink-0 items-center justify-center rounded-md",
            COR_TILE[tom],
          )}
        >
          <Icone className="size-5" />
        </div>
        <div className="min-w-0">
          <div className="truncate text-2xl font-bold tabular-nums">{valor}</div>
          <div className="text-xs text-muted-foreground">{rotulo}</div>
        </div>
      </CardContent>
    </Card>
  )
}

function SecaoCard({
  icone: Icone,
  titulo,
  children,
}: {
  icone: LucideIcon
  titulo: string
  children: React.ReactNode
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Icone className="size-4 text-muted-foreground" />
          {titulo}
        </CardTitle>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  )
}

function Linha({
  rotulo,
  valor,
  tom = "neutro",
}: {
  rotulo: string
  valor: number | string
  tom?: Tom
}) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-border py-2.5 first:pt-0 last:border-0 last:pb-0">
      <span className="text-sm text-muted-foreground">{rotulo}</span>
      <span className={cn("font-semibold tabular-nums", COR_VALOR[tom])}>{valor}</span>
    </div>
  )
}

function Barra({
  rotulo,
  valor,
  proporcao,
  tom = "neutro",
}: {
  rotulo: string
  valor: number | string
  proporcao: number
  tom?: Tom
}) {
  const largura = proporcao > 0 ? Math.max(proporcao * 100, 4) : 0
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-3 text-sm">
        <span className="min-w-0 truncate text-muted-foreground">{rotulo}</span>
        <span className="shrink-0 font-semibold tabular-nums">{valor}</span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
        <div
          className={cn("h-full rounded-full transition-all", COR_BARRA[tom])}
          style={{ width: `${largura}%` }}
        />
      </div>
    </div>
  )
}

type ItemDistribuicao = {
  chave: string
  rotulo: string
  valor: number
  tom: Tom
}

function Distribuicao({ itens, vazio }: { itens: ItemDistribuicao[]; vazio: string }) {
  const itensVisiveis = itens.filter((item) => item.valor > 0)
  if (itensVisiveis.length === 0) return <Vazio>{vazio}</Vazio>
  const maior = Math.max(...itensVisiveis.map((item) => item.valor))
  return (
    <div className="space-y-4">
      {itensVisiveis.map((item) => (
        <Barra
          key={item.chave}
          rotulo={item.rotulo}
          valor={item.valor}
          proporcao={maior > 0 ? item.valor / maior : 0}
          tom={item.tom}
        />
      ))}
    </div>
  )
}

function Vazio({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-md border border-dashed border-border py-6 text-center text-sm text-muted-foreground">
      {children}
    </p>
  )
}

function corPosicao(index: number) {
  if (index === 0) return "bg-[#f5c518] text-black"
  if (index === 1) return "bg-[#c4c4c8] text-black"
  if (index === 2) return "bg-[#cd7f32] text-white"
  return "bg-muted text-muted-foreground"
}

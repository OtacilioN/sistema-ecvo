import type { StatusAluno, StatusMensalidade } from "@prisma/client"
import {
  AlertTriangle,
  ArrowRight,
  CalendarClock,
  CalendarDays,
  CheckCircle2,
  DollarSign,
  GraduationCap,
  type LucideIcon,
  TrendingUp,
  UserRound,
  Users,
  WalletCards,
} from "lucide-react"
import Link from "next/link"
import { LembreteAtivarNotificacoes } from "@/components/lembrete-ativar-notificacoes"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { CabecalhoPagina } from "@/components/ui/cabecalho-pagina"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { db } from "@/lib/db"
import { statusMensalidadeEfetivo } from "@/lib/services/financeiro.service"
import { cn } from "@/lib/utils"
import {
  formatarData,
  formatarDataExtenso,
  inicioDoDiaAcademia,
  paraFusoAcademia,
} from "@/lib/utils/datas"
import { formatarBRL } from "@/lib/utils/formato"

export const dynamic = "force-dynamic"

const MS_DIA = 24 * 60 * 60 * 1000
const statusMonitorados: StatusAluno[] = ["ATIVO", "INADIMPLENTE"]

const rotulosStatusMensalidade: Record<StatusMensalidade, string> = {
  EM_ABERTO: "Em aberto",
  PAGA: "Paga",
  VENCIDA: "Vencida",
  CANCELADA: "Cancelada",
  ISENTA: "Isenta",
}

function somarValores(itens: Array<{ valor: unknown }>) {
  return itens.reduce((total, item) => total + Number(item.valor), 0)
}

function adicionarDias(data: Date, dias: number) {
  return new Date(data.getTime() + dias * MS_DIA)
}

function obterInicioSemana(data: Date) {
  const inicioHoje = inicioDoDiaAcademia(data)
  const diaSemana = paraFusoAcademia(inicioHoje).getDay()
  return adicionarDias(inicioHoje, -diaSemana)
}

function indiceDiaSemana(data: Date, inicioSemana: Date) {
  return Math.floor((inicioDoDiaAcademia(data).getTime() - inicioSemana.getTime()) / MS_DIA)
}

function nomeCurtoDia(dia: Date) {
  return formatarDataExtenso(dia).split("-")[0]?.slice(0, 3) ?? ""
}

export default async function GestaoInicio() {
  const hoje = new Date()
  const inicioHoje = inicioDoDiaAcademia(hoje)
  const inicioSemana = obterInicioSemana(hoje)
  const fimSemanaExclusivo = adicionarDias(inicioSemana, 7)
  const fimSemana = adicionarDias(fimSemanaExclusivo, -1)

  const [
    alunosMonitorados,
    professores,
    modalidades,
    turmas,
    mensalidadesPendentes,
    mensalidadesRecebidasSemana,
    pagamentosAvulsosSemana,
  ] = await Promise.all([
    db.aluno.findMany({
      where: { status: { in: statusMonitorados } },
      select: {
        id: true,
        tipo: true,
        modalidadesPlano: { select: { plataformaExterna: true } },
      },
    }),
    db.professor.count({ where: { ativo: true } }),
    db.modalidade.count({ where: { ativa: true } }),
    db.turma.count({ where: { ativa: true } }),
    db.mensalidade.findMany({
      where: {
        status: { in: ["EM_ABERTO", "VENCIDA"] },
        aluno: { status: { in: statusMonitorados } },
      },
      orderBy: [{ vencimento: "asc" }, { criadoEm: "asc" }],
      select: {
        id: true,
        alunoId: true,
        competencia: true,
        valor: true,
        vencimento: true,
        status: true,
        aluno: { select: { usuario: { select: { nome: true } } } },
      },
    }),
    db.mensalidade.findMany({
      where: {
        status: "PAGA",
        pagoEm: { gte: inicioSemana, lt: fimSemanaExclusivo },
      },
      select: { valor: true, pagoEm: true },
    }),
    db.pagamento.findMany({
      where: { criadoEm: { gte: inicioSemana, lt: fimSemanaExclusivo } },
      select: { valor: true, criadoEm: true },
    }),
  ])

  const mensalidadesComStatus = mensalidadesPendentes.map((mensalidade) => ({
    ...mensalidade,
    statusEfetivo: statusMensalidadeEfetivo(mensalidade, hoje),
    valorNumero: Number(mensalidade.valor),
  }))

  const mensalidadesVencidas = mensalidadesComStatus.filter(
    (mensalidade) => mensalidade.statusEfetivo === "VENCIDA",
  )
  const mensalidadesVencemSemana = mensalidadesComStatus.filter(
    (mensalidade) =>
      mensalidade.statusEfetivo === "EM_ABERTO" &&
      mensalidade.vencimento.getTime() >= inicioHoje.getTime() &&
      mensalidade.vencimento.getTime() < fimSemanaExclusivo.getTime(),
  )
  const proximosVencimentos = mensalidadesComStatus
    .filter(
      (mensalidade) =>
        mensalidade.statusEfetivo === "EM_ABERTO" &&
        mensalidade.vencimento.getTime() >= inicioHoje.getTime(),
    )
    .slice(0, 5)
  const inadimplentesIds = new Set(mensalidadesVencidas.map((mensalidade) => mensalidade.alunoId))
  const vencemSemanaIds = new Set(
    mensalidadesVencemSemana.map((mensalidade) => mensalidade.alunoId),
  )
  const totalAlunosMonitorados = alunosMonitorados.length
  const alunosInternosIds = new Set(
    alunosMonitorados
      .filter((aluno) => aluno.tipo !== "WELLHUB" && aluno.tipo !== "TOTALPASS")
      .map((aluno) => aluno.id),
  )
  const alunosWellhubIds = new Set(
    alunosMonitorados
      .filter(
        (aluno) =>
          aluno.tipo === "WELLHUB" ||
          aluno.modalidadesPlano.some((modalidade) => modalidade.plataformaExterna === "WELLHUB"),
      )
      .map((aluno) => aluno.id),
  )
  const alunosTotalpassIds = new Set(
    alunosMonitorados
      .filter(
        (aluno) =>
          aluno.tipo === "TOTALPASS" ||
          aluno.modalidadesPlano.some((modalidade) => modalidade.plataformaExterna === "TOTALPASS"),
      )
      .map((aluno) => aluno.id),
  )
  const totalAlunosInternosMonitorados = alunosInternosIds.size
  const alunosInadimplentes = Array.from(inadimplentesIds).filter((alunoId) =>
    alunosInternosIds.has(alunoId),
  ).length
  const alunosAdimplentes = Math.max(totalAlunosInternosMonitorados - alunosInadimplentes, 0)
  const percentualAdimplencia =
    totalAlunosInternosMonitorados > 0
      ? Math.round((alunosAdimplentes / totalAlunosInternosMonitorados) * 100)
      : 0
  const valorVencido = mensalidadesVencidas.reduce(
    (total, mensalidade) => total + mensalidade.valorNumero,
    0,
  )
  const valorPrevistoSemana = mensalidadesVencemSemana.reduce(
    (total, mensalidade) => total + mensalidade.valorNumero,
    0,
  )
  const valorRecebidoSemana =
    somarValores(mensalidadesRecebidasSemana) + somarValores(pagamentosAvulsosSemana)

  const diasSemana = Array.from({ length: 7 }, (_, indice) => {
    const dia = adicionarDias(inicioSemana, indice)
    return {
      dia,
      rotulo: nomeCurtoDia(dia),
      previsto: 0,
      recebido: 0,
    }
  })

  for (const mensalidade of mensalidadesVencemSemana) {
    const indice = indiceDiaSemana(mensalidade.vencimento, inicioSemana)
    if (diasSemana[indice]) diasSemana[indice].previsto += mensalidade.valorNumero
  }
  for (const mensalidade of mensalidadesRecebidasSemana) {
    if (!mensalidade.pagoEm) continue
    const indice = indiceDiaSemana(mensalidade.pagoEm, inicioSemana)
    if (diasSemana[indice]) diasSemana[indice].recebido += Number(mensalidade.valor)
  }
  for (const pagamento of pagamentosAvulsosSemana) {
    const indice = indiceDiaSemana(pagamento.criadoEm, inicioSemana)
    if (diasSemana[indice]) diasSemana[indice].recebido += Number(pagamento.valor)
  }

  const maiorValorDia = Math.max(1, ...diasSemana.flatMap((dia) => [dia.previsto, dia.recebido]))

  const cardsOperacao = [
    { rotulo: "Alunos monitorados", valor: totalAlunosMonitorados, icone: Users },
    { rotulo: "Professores", valor: professores, icone: UserRound },
    { rotulo: "Modalidades", valor: modalidades, icone: GraduationCap },
    { rotulo: "Turmas ativas", valor: turmas, icone: CalendarDays },
  ]

  return (
    <div className="space-y-6">
      <CabecalhoPagina
        titulo="Painel da gestão"
        descricao={`Semana de ${formatarData(inicioSemana)} a ${formatarData(fimSemana)}.`}
      >
        <Button asChild>
          <Link href="/gestao/financeiro">
            Abrir financeiro
            <ArrowRight className="size-4" />
          </Link>
        </Button>
      </CabecalhoPagina>
      <LembreteAtivarNotificacoes />

      <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
        <Card className="border-destructive/25 bg-card shadow-sm">
          <CardContent className="grid gap-5 p-5 sm:p-6 lg:grid-cols-[1fr_0.95fr]">
            <div className="space-y-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Saúde financeira</p>
                  <h2 className="mt-1 text-3xl font-bold tracking-tight sm:text-4xl">
                    {percentualAdimplencia}%
                  </h2>
                  <p className="text-sm text-muted-foreground">
                    dos alunos internos monitorados adimplentes
                  </p>
                </div>
                <div className="flex size-12 shrink-0 items-center justify-center rounded-md bg-success/10 text-success">
                  <CheckCircle2 className="size-6" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <ResumoFinanceiro
                  rotulo="Adimplentes"
                  valor={alunosAdimplentes.toString()}
                  detalhe={`${totalAlunosInternosMonitorados} internos no acompanhamento`}
                  tom="positivo"
                />
                <ResumoFinanceiro
                  rotulo="Inadimplentes"
                  valor={alunosInadimplentes.toString()}
                  detalhe={formatarBRL(valorVencido)}
                  tom="negativo"
                />
                <ResumoFinanceiro
                  rotulo="Wellhub"
                  valor={alunosWellhubIds.size.toString()}
                  detalhe="cobrança externa"
                  tom="neutro"
                />
                <ResumoFinanceiro
                  rotulo="TotalPass"
                  valor={alunosTotalpassIds.size.toString()}
                  detalhe="cobrança externa"
                  tom="neutro"
                />
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
              <KpiCard
                titulo="Previsto na semana"
                valor={formatarBRL(valorPrevistoSemana)}
                descricao={`${vencemSemanaIds.size} aluno${
                  vencemSemanaIds.size === 1 ? "" : "s"
                } com vencimento até sábado`}
                icone={CalendarClock}
                tom="atencao"
              />
              <KpiCard
                titulo="Recebido na semana"
                valor={formatarBRL(valorRecebidoSemana)}
                descricao="Mensalidades pagas e vendas avulsas"
                icone={TrendingUp}
                tom="positivo"
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <AlertTriangle className="size-4 text-destructive" />
              Inadimplência
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-3xl font-bold text-destructive">{mensalidadesVencidas.length}</p>
                <p className="text-xs text-muted-foreground">mensalidades vencidas</p>
              </div>
              <div>
                <p className="text-3xl font-bold">{formatarBRL(valorVencido)}</p>
                <p className="text-xs text-muted-foreground">valor em atraso</p>
              </div>
            </div>
            <div className="space-y-2">
              {mensalidadesVencidas.slice(0, 4).map((mensalidade) => (
                <LinhaMensalidade
                  key={mensalidade.id}
                  nome={mensalidade.aluno.usuario.nome}
                  valor={mensalidade.valorNumero}
                  data={mensalidade.vencimento}
                  status={mensalidade.statusEfetivo}
                />
              ))}
              {mensalidadesVencidas.length === 0 && (
                <p className="rounded-md border border-success/20 bg-success/5 p-3 text-sm text-success">
                  Nenhuma mensalidade vencida no momento.
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_0.85fr]">
        <Card>
          <CardHeader>
            <CardTitle>Resumo semanal</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid gap-3 sm:grid-cols-3">
              <MiniIndicador
                rotulo="Alunos vencem esta semana"
                valor={vencemSemanaIds.size.toString()}
                detalhe={formatarBRL(valorPrevistoSemana)}
                icone={WalletCards}
                tom="atencao"
              />
              <MiniIndicador
                rotulo="Recebidas"
                valor={mensalidadesRecebidasSemana.length.toString()}
                detalhe="mensalidades pagas"
                icone={DollarSign}
                tom="positivo"
              />
              <MiniIndicador
                rotulo="Vendas avulsas"
                valor={pagamentosAvulsosSemana.length.toString()}
                detalhe={formatarBRL(somarValores(pagamentosAvulsosSemana))}
                icone={TrendingUp}
                tom="neutro"
              />
            </div>

            <div>
              <div className="mb-3 flex items-center justify-between gap-3 text-xs text-muted-foreground">
                <span>Fluxo diário</span>
                <div className="flex items-center gap-3">
                  <span className="inline-flex items-center gap-1">
                    <span className="size-2 rounded-full bg-warning" />
                    Previsto
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <span className="size-2 rounded-full bg-success" />
                    Recebido
                  </span>
                </div>
              </div>
              <div className="grid h-44 grid-cols-7 items-end gap-2 rounded-md border border-border bg-muted/30 p-3">
                {diasSemana.map((dia) => (
                  <div key={dia.dia.toISOString()} className="flex h-full min-w-0 flex-col">
                    <div className="flex flex-1 items-end justify-center gap-1">
                      <BarraDia valor={dia.previsto} maiorValor={maiorValorDia} tom="atencao" />
                      <BarraDia valor={dia.recebido} maiorValor={maiorValorDia} tom="positivo" />
                    </div>
                    <span className="mt-2 truncate text-center text-xs text-muted-foreground">
                      {dia.rotulo}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="gap-3 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle>Próximos vencimentos</CardTitle>
            <Button asChild variant="outline" size="sm">
              <Link href="/gestao/financeiro">Ver todos</Link>
            </Button>
          </CardHeader>
          <CardContent className="space-y-2">
            {proximosVencimentos.map((mensalidade) => (
              <LinhaMensalidade
                key={mensalidade.id}
                nome={mensalidade.aluno.usuario.nome}
                valor={mensalidade.valorNumero}
                data={mensalidade.vencimento}
                status={mensalidade.statusEfetivo}
              />
            ))}
            {proximosVencimentos.length === 0 && (
              <p className="rounded-md border border-border bg-muted/40 p-3 text-sm text-muted-foreground">
                Nenhum vencimento em aberto nos próximos dias.
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Visão operacional</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-4 pt-0 lg:grid-cols-4">
          {cardsOperacao.map(({ rotulo, valor, icone: Icone }) => (
            <div
              key={rotulo}
              className="flex items-center gap-4 rounded-md border border-border bg-muted/30 p-4"
            >
              <div className="flex size-11 shrink-0 items-center justify-center rounded-md bg-accent text-accent-foreground">
                <Icone className="size-5" />
              </div>
              <div>
                <div className="text-2xl font-bold">{valor}</div>
                <div className="text-xs text-muted-foreground">{rotulo}</div>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  )
}

function ResumoFinanceiro({
  rotulo,
  valor,
  detalhe,
  tom,
}: {
  rotulo: string
  valor: string
  detalhe: string
  tom: "positivo" | "negativo" | "neutro"
}) {
  return (
    <div
      className={cn(
        "rounded-md border p-3",
        tom === "positivo" && "border-success/20 bg-success/5",
        tom === "negativo" && "border-destructive/20 bg-destructive/5",
        tom === "neutro" && "border-border bg-muted/30",
      )}
    >
      <p
        className={cn(
          "text-2xl font-bold",
          tom === "positivo" && "text-success",
          tom === "negativo" && "text-destructive",
        )}
      >
        {valor}
      </p>
      <p className="text-sm font-medium">{rotulo}</p>
      <p className="mt-1 text-xs text-muted-foreground">{detalhe}</p>
    </div>
  )
}

function KpiCard({
  titulo,
  valor,
  descricao,
  icone: Icone,
  tom,
}: {
  titulo: string
  valor: string
  descricao: string
  icone: LucideIcon
  tom: "positivo" | "atencao"
}) {
  return (
    <div className="rounded-md border border-border bg-muted/30 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm text-muted-foreground">{titulo}</p>
          <p className="mt-1 text-2xl font-bold tabular-nums">{valor}</p>
        </div>
        <div
          className={cn(
            "flex size-10 shrink-0 items-center justify-center rounded-md",
            tom === "positivo" && "bg-success/10 text-success",
            tom === "atencao" && "bg-warning/10 text-warning",
          )}
        >
          <Icone className="size-5" />
        </div>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">{descricao}</p>
    </div>
  )
}

function MiniIndicador({
  rotulo,
  valor,
  detalhe,
  icone: Icone,
  tom,
}: {
  rotulo: string
  valor: string
  detalhe: string
  icone: LucideIcon
  tom: "positivo" | "atencao" | "neutro"
}) {
  return (
    <div className="rounded-md border border-border p-3">
      <div className="flex items-center justify-between gap-3">
        <div
          className={cn(
            "flex size-9 items-center justify-center rounded-md",
            tom === "positivo" && "bg-success/10 text-success",
            tom === "atencao" && "bg-warning/10 text-warning",
            tom === "neutro" && "bg-accent text-accent-foreground",
          )}
        >
          <Icone className="size-4" />
        </div>
        <p className="text-2xl font-bold tabular-nums">{valor}</p>
      </div>
      <p className="mt-3 text-sm font-medium">{rotulo}</p>
      <p className="text-xs text-muted-foreground">{detalhe}</p>
    </div>
  )
}

function BarraDia({
  valor,
  maiorValor,
  tom,
}: {
  valor: number
  maiorValor: number
  tom: "positivo" | "atencao"
}) {
  const altura = valor > 0 ? Math.max(10, Math.round((valor / maiorValor) * 100)) : 3
  return (
    <div
      title={formatarBRL(valor)}
      className={cn(
        "w-full max-w-5 rounded-t-sm transition-colors",
        tom === "positivo" && "bg-success",
        tom === "atencao" && "bg-warning",
        valor === 0 && "opacity-25",
      )}
      style={{ height: `${altura}%` }}
    />
  )
}

function LinhaMensalidade({
  nome,
  valor,
  data,
  status,
}: {
  nome: string
  valor: number
  data: Date
  status: StatusMensalidade
}) {
  const vencida = status === "VENCIDA"
  return (
    <div className="flex items-center justify-between gap-3 rounded-md border border-border p-3">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium">{nome}</p>
        <p className="text-xs text-muted-foreground">
          {formatarData(data)} · {formatarBRL(valor)}
        </p>
      </div>
      <Badge
        variant={vencida ? "destructive" : "outline"}
        className={cn(!vencida && "border-warning/30 bg-warning/10 text-warning")}
      >
        {rotulosStatusMensalidade[status]}
      </Badge>
    </div>
  )
}

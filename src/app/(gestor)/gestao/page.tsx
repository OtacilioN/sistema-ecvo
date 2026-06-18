import type { StatusMensalidade } from "@prisma/client"
import {
  AlertTriangle,
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
import type { CSSProperties } from "react"
import { LembreteAtivarNotificacoes } from "@/components/lembrete-ativar-notificacoes"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { CabecalhoPagina } from "@/components/ui/cabecalho-pagina"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { alunoContaOperacionalmente, STATUS_ALUNO_OPERACIONAIS } from "@/lib/alunos/status"
import { db } from "@/lib/db"
import { statusMensalidadeEfetivo } from "@/lib/services/financeiro.service"
import { cn } from "@/lib/utils"
import {
  chaveCompetencia,
  dataCivilParaDate,
  formatarData,
  inicioDoDiaAcademia,
  paraFusoAcademia,
  TIMEZONE,
} from "@/lib/utils/datas"
import { formatarBRL } from "@/lib/utils/formato"

export const dynamic = "force-dynamic"

const MS_DIA = 24 * 60 * 60 * 1000
const ROTA_FINANCEIRO = "/gestao/financeiro"
const statusMonitorados = [...STATUS_ALUNO_OPERACIONAIS]
const rotulosPapelAniversario = {
  ALUNO: "Aluno",
  PROFESSOR: "Professor",
  GESTOR: "Gestor",
} as const

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

function formatarBRLGrafico(valor: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    notation: "compact",
    maximumFractionDigits: 1,
    minimumFractionDigits: 0,
  }).format(valor)
}

function adicionarDias(data: Date, dias: number) {
  return new Date(data.getTime() + dias * MS_DIA)
}

function obterInicioSemana(data: Date) {
  const inicioHoje = inicioDoDiaAcademia(data)
  const diaSemana = paraFusoAcademia(inicioHoje).getDay()
  return adicionarDias(inicioHoje, -diaSemana)
}

function obterIntervaloMes(data: Date) {
  const [ano, mes] = chaveCompetencia(data).split("-").map(Number)
  const proximoAno = mes === 12 ? ano + 1 : ano
  const proximoMes = mes === 12 ? 1 : mes + 1

  return {
    inicioMes: dataCivilParaDate(`${ano}-${String(mes).padStart(2, "0")}-01`),
    inicioProximoMes: dataCivilParaDate(`${proximoAno}-${String(proximoMes).padStart(2, "0")}-01`),
  }
}

function formatarDiaMes(data: Date) {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    timeZone: TIMEZONE,
  }).format(data)
}

function indiceSemanaMes(data: Date, inicioMes: Date) {
  const diasDesdeInicio = Math.floor(
    (inicioDoDiaAcademia(data).getTime() - inicioMes.getTime()) / MS_DIA,
  )
  return Math.floor(Math.max(diasDesdeInicio, 0) / 7)
}

function dataAniversarioNoAno(dataNascimento: Date, ano: number) {
  const nascimentoNoFuso = paraFusoAcademia(dataNascimento)
  const mes = nascimentoNoFuso.getMonth()
  const dia = nascimentoNoFuso.getDate()
  const aniversario = dataCivilParaDate(
    `${ano}-${String(mes + 1).padStart(2, "0")}-${String(dia).padStart(2, "0")}`,
  )

  return paraFusoAcademia(aniversario).getMonth() === mes
    ? aniversario
    : dataCivilParaDate(`${ano}-02-28`)
}

function proximoAniversario(dataNascimento: Date, inicioHoje: Date) {
  const anoAtual = paraFusoAcademia(inicioHoje).getFullYear()
  const aniversarioEsteAno = inicioDoDiaAcademia(dataAniversarioNoAno(dataNascimento, anoAtual))
  const data =
    aniversarioEsteAno.getTime() >= inicioHoje.getTime()
      ? aniversarioEsteAno
      : inicioDoDiaAcademia(dataAniversarioNoAno(dataNascimento, anoAtual + 1))

  return {
    data,
    diasAte: Math.round((data.getTime() - inicioHoje.getTime()) / MS_DIA),
  }
}

function hrefPessoaAniversario(papel: keyof typeof rotulosPapelAniversario) {
  if (papel === "ALUNO") return "/gestao/alunos"
  if (papel === "PROFESSOR") return "/gestao/professores"
  return "/gestao/gestores"
}

export default async function GestaoInicio() {
  const hoje = new Date()
  const inicioHoje = inicioDoDiaAcademia(hoje)
  const inicioSemana = obterInicioSemana(hoje)
  const fimSemanaExclusivo = adicionarDias(inicioSemana, 7)
  const { inicioMes, inicioProximoMes } = obterIntervaloMes(hoje)
  const fimMes = adicionarDias(inicioProximoMes, -1)

  const [
    alunosMonitorados,
    professores,
    modalidades,
    turmas,
    mensalidadesPendentes,
    mensalidadesRecebidasSemana,
    mensalidadesRecebidasMes,
    usuariosComNascimento,
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
    db.mensalidade.findMany({
      where: {
        status: "PAGA",
        pagoEm: { gte: inicioMes, lt: inicioProximoMes },
      },
      select: { valor: true, pagoEm: true },
    }),
    db.usuario.findMany({
      where: {
        ativo: true,
        dataNascimento: { not: null },
        papel: { in: ["ALUNO", "PROFESSOR", "GESTOR"] },
      },
      orderBy: { nome: "asc" },
      select: {
        id: true,
        nome: true,
        papel: true,
        dataNascimento: true,
        aluno: { select: { status: true } },
        professor: { select: { ativo: true } },
      },
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
  const valorRecebidoSemana = somarValores(mensalidadesRecebidasSemana)
  const valorRecebidoMes = somarValores(mensalidadesRecebidasMes)
  const mensalidadesVencemMes = mensalidadesComStatus.filter(
    (mensalidade) =>
      mensalidade.statusEfetivo === "EM_ABERTO" &&
      mensalidade.vencimento.getTime() >= inicioHoje.getTime() &&
      mensalidade.vencimento.getTime() < inicioProximoMes.getTime(),
  )
  const valorPrevistoMes = mensalidadesVencemMes.reduce(
    (total, mensalidade) => total + mensalidade.valorNumero,
    0,
  )

  const totalSemanasMes = Math.ceil((inicioProximoMes.getTime() - inicioMes.getTime()) / MS_DIA / 7)
  const semanasMes = Array.from({ length: totalSemanasMes }, (_, indice) => ({
    rotulo: `Sem ${indice + 1}`,
    previsto: 0,
    recebido: 0,
  }))

  for (const mensalidade of mensalidadesVencemMes) {
    const indice = indiceSemanaMes(mensalidade.vencimento, inicioMes)
    if (semanasMes[indice]) semanasMes[indice].previsto += mensalidade.valorNumero
  }
  for (const mensalidade of mensalidadesRecebidasMes) {
    if (!mensalidade.pagoEm) continue
    const indice = indiceSemanaMes(mensalidade.pagoEm, inicioMes)
    if (semanasMes[indice]) semanasMes[indice].recebido += Number(mensalidade.valor)
  }

  const maiorValorSemanaMes = Math.max(
    1,
    ...semanasMes.flatMap((semana) => [semana.previsto, semana.recebido]),
  )

  const cardsOperacao = [
    {
      rotulo: "Alunos monitorados",
      valor: totalAlunosMonitorados,
      icone: Users,
      href: "/gestao/alunos",
    },
    { rotulo: "Professores", valor: professores, icone: UserRound, href: "/gestao/professores" },
    {
      rotulo: "Modalidades",
      valor: modalidades,
      icone: GraduationCap,
      href: "/gestao/modalidades",
    },
    { rotulo: "Turmas ativas", valor: turmas, icone: CalendarDays, href: "/gestao/turmas" },
  ]
  const proximosAniversariantes = usuariosComNascimento
    .filter((usuario) => {
      if (!usuario.dataNascimento) return false
      if (usuario.papel === "ALUNO")
        return Boolean(usuario.aluno?.status && alunoContaOperacionalmente(usuario.aluno.status))
      if (usuario.papel === "PROFESSOR") return Boolean(usuario.professor?.ativo)
      return usuario.papel === "GESTOR"
    })
    .map((usuario) => ({
      id: usuario.id,
      nome: usuario.nome,
      papel: usuario.papel as keyof typeof rotulosPapelAniversario,
      dataNascimento: usuario.dataNascimento as Date,
      ...proximoAniversario(usuario.dataNascimento as Date, inicioHoje),
    }))
    .sort((a, b) => a.diasAte - b.diasAte || a.nome.localeCompare(b.nome))
    .slice(0, 5)

  return (
    <div className="space-y-6">
      <CabecalhoPagina
        titulo="Painel da gestão"
        descricao={`Mês de ${formatarData(inicioMes)} a ${formatarData(fimMes)}.`}
      />
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
                  href={ROTA_FINANCEIRO}
                />
                <ResumoFinanceiro
                  rotulo="Inadimplentes"
                  valor={alunosInadimplentes.toString()}
                  detalhe={formatarBRL(valorVencido)}
                  tom="negativo"
                  href={ROTA_FINANCEIRO}
                />
                <ResumoFinanceiro
                  rotulo="Wellhub"
                  valor={alunosWellhubIds.size.toString()}
                  detalhe="cobrança externa"
                  tom="neutro"
                  href={ROTA_FINANCEIRO}
                />
                <ResumoFinanceiro
                  rotulo="TotalPass"
                  valor={alunosTotalpassIds.size.toString()}
                  detalhe="cobrança externa"
                  tom="neutro"
                  href={ROTA_FINANCEIRO}
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
                href={ROTA_FINANCEIRO}
              />
              <KpiCard
                titulo="Recebido na semana"
                valor={formatarBRL(valorRecebidoSemana)}
                descricao="Mensalidades pagas"
                detalheSecundario={`Este mês: ${formatarBRL(valorRecebidoMes)}`}
                icone={TrendingUp}
                tom="positivo"
                href={ROTA_FINANCEIRO}
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
                  href={ROTA_FINANCEIRO}
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
            <CardTitle>Resumo mensal</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid gap-3 sm:grid-cols-3">
              <MiniIndicador
                rotulo="Alunos vencendo esta semana"
                valor={vencemSemanaIds.size.toString()}
                detalhe={formatarBRL(valorPrevistoSemana)}
                icone={WalletCards}
                tom="atencao"
                href={ROTA_FINANCEIRO}
              />
              <MiniIndicador
                rotulo="Mensalidades pagas"
                valor={mensalidadesRecebidasMes.length.toString()}
                detalhe={`Esta semana ${mensalidadesRecebidasSemana.length}`}
                icone={DollarSign}
                tom="positivo"
                href={ROTA_FINANCEIRO}
              />
              <MiniIndicador
                rotulo="A receber ainda este mês"
                valor={formatarBRL(valorPrevistoMes)}
                detalhe={`Esta semana ${formatarBRL(valorPrevistoSemana)}`}
                icone={CalendarClock}
                tom="atencao"
                href={ROTA_FINANCEIRO}
              />
            </div>

            <div>
              <div className="mb-3 flex items-center justify-between gap-3 text-xs text-muted-foreground">
                <span>Fluxo do mês</span>
                <div className="flex items-center gap-3">
                  <span className="inline-flex items-center gap-1">
                    <span className="size-2 rounded-full bg-warning" />A receber
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <span className="size-2 rounded-full bg-success" />
                    Recebido
                  </span>
                </div>
              </div>
              <div
                className="grid h-56 items-end gap-2 rounded-md border border-border bg-muted/30 p-3"
                style={{ gridTemplateColumns: `repeat(${semanasMes.length}, minmax(0, 1fr))` }}
              >
                {semanasMes.map((semana) => (
                  <div key={semana.rotulo} className="flex h-full min-w-0 flex-col">
                    <div className="flex flex-1 items-end justify-center gap-1">
                      <BarraDia
                        valor={semana.previsto}
                        maiorValor={maiorValorSemanaMes}
                        tom="atencao"
                      />
                      <BarraDia
                        valor={semana.recebido}
                        maiorValor={maiorValorSemanaMes}
                        tom="positivo"
                      />
                    </div>
                    <div className="mt-2 space-y-1 text-center">
                      <p className="truncate text-xs font-medium text-muted-foreground">
                        {semana.rotulo}
                      </p>
                      <ValorSemanaGrafico
                        rotulo="A receber"
                        valor={semana.previsto}
                        tom="atencao"
                      />
                      <ValorSemanaGrafico
                        rotulo="Recebido"
                        valor={semana.recebido}
                        tom="positivo"
                      />
                    </div>
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
              <Link href={ROTA_FINANCEIRO}>Ver todos</Link>
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
                href={ROTA_FINANCEIRO}
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
          {cardsOperacao.map(({ rotulo, valor, icone: Icone, href }) => (
            <Link
              key={rotulo}
              href={href}
              className="group flex items-center gap-4 rounded-md border border-border bg-muted/30 p-4 transition-colors hover:border-primary/40 hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
            >
              <div className="flex size-11 shrink-0 items-center justify-center rounded-md bg-accent text-accent-foreground">
                <Icone className="size-5" />
              </div>
              <div>
                <div className="text-2xl font-bold">{valor}</div>
                <div className="text-xs text-muted-foreground">{rotulo}</div>
              </div>
            </Link>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Próximos aniversariantes</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {proximosAniversariantes.map((aniversariante) => (
            <LinhaAniversariante
              key={aniversariante.id}
              nome={aniversariante.nome}
              papel={aniversariante.papel}
              dataNascimento={aniversariante.dataNascimento}
              dataAniversario={aniversariante.data}
              diasAte={aniversariante.diasAte}
            />
          ))}
          {proximosAniversariantes.length === 0 && (
            <p className="rounded-md border border-border bg-muted/40 p-3 text-sm text-muted-foreground">
              Nenhum aniversariante cadastrado com data de nascimento.
            </p>
          )}
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
  href,
}: {
  rotulo: string
  valor: string
  detalhe: string
  tom: "positivo" | "negativo" | "neutro"
  href: string
}) {
  return (
    <Link
      href={href}
      className={cn(
        "block rounded-md border p-3 transition-colors hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
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
    </Link>
  )
}

function KpiCard({
  titulo,
  valor,
  descricao,
  detalheSecundario,
  icone: Icone,
  tom,
  href,
}: {
  titulo: string
  valor: string
  descricao: string
  detalheSecundario?: string
  icone: LucideIcon
  tom: "positivo" | "atencao"
  href: string
}) {
  return (
    <Link
      href={href}
      className="block rounded-md border border-border bg-muted/30 p-4 transition-colors hover:border-primary/40 hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
    >
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
      {detalheSecundario && (
        <p className="mt-3 border-t border-border pt-3 text-sm font-medium tabular-nums">
          {detalheSecundario}
        </p>
      )}
    </Link>
  )
}

function MiniIndicador({
  rotulo,
  valor,
  detalhe,
  icone: Icone,
  tom,
  href,
}: {
  rotulo: string
  valor: string
  detalhe: string
  icone: LucideIcon
  tom: "positivo" | "atencao" | "neutro"
  href: string
}) {
  return (
    <Link
      href={href}
      className="block rounded-md border border-border p-3 transition-colors hover:border-primary/40 hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
    >
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
    </Link>
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
  const valorFormatado = formatarBRL(valor)
  const rotulo = tom === "positivo" ? "Recebido" : "A receber"

  return (
    <button
      aria-label={`${rotulo}: ${valorFormatado}`}
      className="group relative flex h-full w-full max-w-5 cursor-default appearance-none items-end justify-center rounded-sm border-0 bg-transparent p-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
      style={{ "--altura-barra": `${altura}%` } as CSSProperties}
      type="button"
    >
      <div
        className={cn(
          "w-full rounded-t-sm transition-colors",
          tom === "positivo" && "bg-success",
          tom === "atencao" && "bg-warning",
          valor === 0 && "opacity-25",
        )}
        style={{ height: "var(--altura-barra)" }}
      />
      <span className="pointer-events-none absolute bottom-[calc(var(--altura-barra)+0.5rem)] left-1/2 z-10 -translate-x-1/2 whitespace-nowrap rounded-md border border-border bg-popover px-2 py-1 text-xs font-medium text-popover-foreground opacity-0 shadow-md transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
        {valorFormatado}
      </span>
    </button>
  )
}

function ValorSemanaGrafico({
  rotulo,
  valor,
  tom,
}: {
  rotulo: string
  valor: number
  tom: "positivo" | "atencao"
}) {
  return (
    <p
      title={`${rotulo}: ${formatarBRL(valor)}`}
      className="flex min-w-0 items-center justify-center gap-1 text-[10px] leading-tight text-muted-foreground"
    >
      <span
        className={cn(
          "size-1.5 shrink-0 rounded-full",
          tom === "positivo" && "bg-success",
          tom === "atencao" && "bg-warning",
        )}
      />
      <span className="truncate tabular-nums">{formatarBRLGrafico(valor)}</span>
    </p>
  )
}

function LinhaMensalidade({
  nome,
  valor,
  data,
  status,
  href,
}: {
  nome: string
  valor: number
  data: Date
  status: StatusMensalidade
  href: string
}) {
  const vencida = status === "VENCIDA"
  return (
    <Link
      href={href}
      className="group flex items-center justify-between gap-3 rounded-md border border-border p-3 transition-colors hover:border-primary/40 hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
    >
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
    </Link>
  )
}

function LinhaAniversariante({
  nome,
  papel,
  dataNascimento,
  dataAniversario,
  diasAte,
}: {
  nome: string
  papel: keyof typeof rotulosPapelAniversario
  dataNascimento: Date
  dataAniversario: Date
  diasAte: number
}) {
  const quando = diasAte === 0 ? "Hoje" : diasAte === 1 ? "Amanhã" : `Em ${diasAte.toString()} dias`

  return (
    <Link
      href={hrefPessoaAniversario(papel)}
      className="group flex items-center justify-between gap-3 rounded-md border border-border p-3 transition-colors hover:border-primary/40 hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
    >
      <div className="min-w-0">
        <p className="truncate text-sm font-medium">{nome}</p>
        <p className="text-xs text-muted-foreground">
          {rotulosPapelAniversario[papel]} · {formatarDiaMes(dataNascimento)}
        </p>
      </div>
      <Badge variant={diasAte <= 7 ? "success" : "outline"} className="shrink-0">
        {quando} · {formatarDiaMes(dataAniversario)}
      </Badge>
    </Link>
  )
}

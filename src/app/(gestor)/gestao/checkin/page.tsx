import { addDays, format } from "date-fns"
import { fromZonedTime } from "date-fns-tz"
import {
  AlertTriangle,
  Check,
  CheckCheck,
  Circle,
  Clock3,
  QrCode,
  ShieldAlert,
  UsersRound,
} from "lucide-react"
import Link from "next/link"
import { AcoesCardAlunoCheckin } from "@/components/checkin/acoes-card-aluno"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { CabecalhoPagina } from "@/components/ui/cabecalho-pagina"
import { type LinhaMonitoramentoAula, ROTULO_STATUS_LINHA } from "@/lib/aula-monitoramento"
import { exigirGestao } from "@/lib/auth/dal"
import { db } from "@/lib/db"
import { carregarMonitoramentoAula } from "@/lib/services/aula-monitoramento.service"
import { cn } from "@/lib/utils"
import {
  formatarDataExtenso,
  formatarDataHora,
  formatarHora,
  formatarMinutos,
  paraFusoAcademia,
  TIMEZONE,
} from "@/lib/utils/datas"
import { type OpcaoAulaCheckin, SeletorAulaCheckin } from "./seletor-aula-checkin"

export const dynamic = "force-dynamic"

type SearchParams = Promise<{ aulaId?: string | string[] }>

type AulaDoDia = {
  id: string
  inicio: Date
  fim: Date
  duracaoMin: number
  cancelada: boolean
  professor: { usuario: { nome: string } } | null
  turma: {
    nome: string | null
    local: string | null
    ehEvento: boolean
    modalidade: { nome: string }
    professor: { usuario: { nome: string } } | null
  }
}

type StatusPainel =
  | "INADIMPLENTE"
  | "CHECKIN_COMPARECIMENTO"
  | "CHECKIN"
  | "COMPARECIMENTO"
  | "AUSENTE"

type LinhaPainel = {
  alunoId: string
  nome: string
  statusPainel: StatusPainel
  badges: string[]
  detalhe: string
  observacoesTecnicas: string | null
  totalTentativasInadimplencia: number
}

const prioridadePainel: Record<StatusPainel, number> = {
  INADIMPLENTE: 0,
  CHECKIN_COMPARECIMENTO: 1,
  CHECKIN: 2,
  COMPARECIMENTO: 3,
  AUSENTE: 4,
}

const visualPainel: Record<
  StatusPainel,
  {
    titulo: string
    resumo: string
    className: string
    badgeClassName: string
    Icone: typeof Check
  }
> = {
  INADIMPLENTE: {
    titulo: "Inadimplência",
    resumo: "Check-in barrado",
    className: "border-red-600 bg-red-50 text-red-950 shadow-[0_10px_26px_rgba(185,28,28,0.16)]",
    badgeClassName: "border-red-700 bg-red-700 text-white",
    Icone: ShieldAlert,
  },
  CHECKIN_COMPARECIMENTO: {
    titulo: "Check-in + comparecimento",
    resumo: "Presença ideal",
    className:
      "border-emerald-500 bg-emerald-50 text-emerald-950 shadow-[0_12px_30px_rgba(16,185,129,0.22)] ring-2 ring-emerald-300/70",
    badgeClassName: "border-emerald-700 bg-emerald-700 text-white",
    Icone: CheckCheck,
  },
  CHECKIN: {
    titulo: "Check-in",
    resumo: "Presente",
    className:
      "border-green-500 bg-green-50 text-green-950 shadow-[0_10px_24px_rgba(34,197,94,0.14)]",
    badgeClassName: "border-green-700 bg-green-700 text-white",
    Icone: Check,
  },
  COMPARECIMENTO: {
    titulo: "Comparecimento",
    resumo: "Intenção marcada",
    className: "border-sky-500 bg-sky-50 text-sky-950 shadow-[0_10px_24px_rgba(14,165,233,0.13)]",
    badgeClassName: "border-sky-700 bg-sky-700 text-white",
    Icone: Clock3,
  },
  AUSENTE: {
    titulo: "Ausente",
    resumo: "Nada marcado",
    className: "border-zinc-200 bg-zinc-50 text-zinc-500 opacity-80",
    badgeClassName: "border-zinc-300 bg-white text-zinc-500",
    Icone: Circle,
  },
}

function parametroUnico(valor: string | string[] | undefined) {
  if (Array.isArray(valor)) return valor[0]
  return valor
}

function rotuloAula(aula: AulaDoDia) {
  return aula.turma.nome ?? (aula.turma.ehEvento ? "Aula avulsa" : "Aula recorrente")
}

function professorDaAula(aula: AulaDoDia) {
  return aula.professor?.usuario.nome ?? aula.turma.professor?.usuario.nome ?? "Sem professor"
}

function estadoDaAula(aula: AulaDoDia, agora: Date): OpcaoAulaCheckin["estado"] {
  if (aula.cancelada) return "cancelada"
  if (aula.inicio.getTime() <= agora.getTime() && aula.fim.getTime() >= agora.getTime()) {
    return "em_andamento"
  }
  return aula.inicio.getTime() > agora.getTime() ? "proxima" : "encerrada"
}

function ordenarAulasParaEscolha(
  aulas: AulaDoDia[],
  aulaSelecionadaId: string | null,
  agora: Date,
) {
  return [...aulas].sort((a, b) => {
    if (a.id === aulaSelecionadaId) return -1
    if (b.id === aulaSelecionadaId) return 1

    const estadoA = estadoDaAula(a, agora)
    const estadoB = estadoDaAula(b, agora)
    const prioridadeEstado = {
      em_andamento: 0,
      proxima: 1,
      encerrada: 2,
      cancelada: 3,
    }
    const prioridade = prioridadeEstado[estadoA] - prioridadeEstado[estadoB]
    if (prioridade !== 0) return prioridade

    if (estadoA === "encerrada") return b.inicio.getTime() - a.inicio.getTime()
    return a.inicio.getTime() - b.inicio.getTime()
  })
}

function selecionarAulaPadrao(aulas: AulaDoDia[], aulaIdParam: string | undefined, agora: Date) {
  const aulaDoParam = aulas.find((aula) => aula.id === aulaIdParam)
  if (aulaDoParam) return aulaDoParam

  const ativas = aulas.filter((aula) => !aula.cancelada)
  return (
    ativas.find(
      (aula) => aula.inicio.getTime() <= agora.getTime() && aula.fim.getTime() >= agora.getTime(),
    ) ??
    ativas.find((aula) => aula.inicio.getTime() > agora.getTime()) ??
    ativas.toSorted((a, b) => b.fim.getTime() - a.fim.getTime())[0] ??
    aulas[0] ??
    null
  )
}

function montarLinhaPainel(
  linha: LinhaMonitoramentoAula,
  tentativaInadimplente?: { totalTentativas: number },
): LinhaPainel {
  const temCheckin = linha.status === "PRESENTE"
  const temComparecimento = linha.temComparecimento || linha.status === "COMPARECEU"
  const rotuloStatus = ROTULO_STATUS_LINHA[linha.status]

  if (tentativaInadimplente) {
    return {
      alunoId: linha.alunoId,
      nome: linha.nome,
      statusPainel: "INADIMPLENTE",
      badges: [
        "Inadimplência",
        tentativaInadimplente.totalTentativas > 1
          ? `${tentativaInadimplente.totalTentativas} tentativas`
          : "1 tentativa",
      ],
      detalhe: "Tentou fazer check-in e foi barrado.",
      observacoesTecnicas: linha.observacoesTecnicas,
      totalTentativasInadimplencia: tentativaInadimplente.totalTentativas,
    }
  }

  if (temCheckin && temComparecimento) {
    return {
      alunoId: linha.alunoId,
      nome: linha.nome,
      statusPainel: "CHECKIN_COMPARECIMENTO",
      badges: ["Check-in", "Comparecimento"],
      detalhe: "Presença confirmada e comparecimento marcado.",
      observacoesTecnicas: linha.observacoesTecnicas,
      totalTentativasInadimplencia: 0,
    }
  }

  if (temCheckin) {
    return {
      alunoId: linha.alunoId,
      nome: linha.nome,
      statusPainel: "CHECKIN",
      badges: ["Check-in"],
      detalhe: "Presença confirmada sem comparecimento prévio.",
      observacoesTecnicas: linha.observacoesTecnicas,
      totalTentativasInadimplencia: 0,
    }
  }

  if (temComparecimento || linha.status === "LISTA_ESPERA") {
    return {
      alunoId: linha.alunoId,
      nome: linha.nome,
      statusPainel: "COMPARECIMENTO",
      badges: [rotuloStatus.texto],
      detalhe: "Ainda sem check-in válido.",
      observacoesTecnicas: linha.observacoesTecnicas,
      totalTentativasInadimplencia: 0,
    }
  }

  return {
    alunoId: linha.alunoId,
    nome: linha.nome,
    statusPainel: "AUSENTE",
    badges: [rotuloStatus.texto],
    detalhe:
      linha.status === "AUSENTE"
        ? "Sem comparecimento e sem check-in."
        : "Sem presença válida para esta aula.",
    observacoesTecnicas: linha.observacoesTecnicas,
    totalTentativasInadimplencia: 0,
  }
}

function contarPorStatus(linhas: LinhaPainel[]) {
  return linhas.reduce(
    (acc, linha) => {
      acc[linha.statusPainel]++
      return acc
    },
    {
      INADIMPLENTE: 0,
      CHECKIN_COMPARECIMENTO: 0,
      CHECKIN: 0,
      COMPARECIMENTO: 0,
      AUSENTE: 0,
    } satisfies Record<StatusPainel, number>,
  )
}

export default async function CheckinGestaoPage({ searchParams }: { searchParams: SearchParams }) {
  const usuario = await exigirGestao()
  const podeEditar = usuario.papel === "GESTOR"
  const params = await searchParams
  const agora = new Date()
  const hojeAcademia = paraFusoAcademia(agora)
  const chaveHoje = format(hojeAcademia, "yyyy-MM-dd")
  const chaveAmanha = format(addDays(hojeAcademia, 1), "yyyy-MM-dd")
  const inicioHoje = fromZonedTime(`${chaveHoje}T00:00:00`, TIMEZONE)
  const inicioAmanha = fromZonedTime(`${chaveAmanha}T00:00:00`, TIMEZONE)

  const aulas = await db.aula.findMany({
    where: { inicio: { gte: inicioHoje, lt: inicioAmanha } },
    orderBy: { inicio: "asc" },
    include: {
      professor: { select: { usuario: { select: { nome: true } } } },
      turma: {
        include: {
          modalidade: { select: { nome: true } },
          professor: { select: { usuario: { select: { nome: true } } } },
        },
      },
    },
  })

  const aulaSelecionada = selecionarAulaPadrao(aulas, parametroUnico(params.aulaId), agora)
  const monitoramento = aulaSelecionada ? await carregarMonitoramentoAula(aulaSelecionada.id) : null

  const tentativasPorAluno = new Map(
    monitoramento?.tentativasInadimplentes.map((tentativa) => [tentativa.alunoId, tentativa]) ?? [],
  )
  const idsMonitorados = new Set(monitoramento?.lista.map((linha) => linha.alunoId) ?? [])
  const linhasBase =
    monitoramento?.lista.map((linha) =>
      montarLinhaPainel(linha, tentativasPorAluno.get(linha.alunoId)),
    ) ?? []
  const linhasSomenteInadimplencia =
    monitoramento?.tentativasInadimplentes
      .filter((tentativa) => !idsMonitorados.has(tentativa.alunoId))
      .map(
        (tentativa): LinhaPainel => ({
          alunoId: tentativa.alunoId,
          nome: tentativa.nome,
          statusPainel: "INADIMPLENTE",
          badges: [
            "Inadimplência",
            tentativa.totalTentativas > 1
              ? `${tentativa.totalTentativas} tentativas`
              : "1 tentativa",
          ],
          detalhe: "Tentou fazer check-in e foi barrado.",
          observacoesTecnicas: null,
          totalTentativasInadimplencia: tentativa.totalTentativas,
        }),
      ) ?? []
  const linhasPainel = [...linhasBase, ...linhasSomenteInadimplencia].sort(
    (a, b) =>
      prioridadePainel[a.statusPainel] - prioridadePainel[b.statusPainel] ||
      a.nome.localeCompare(b.nome),
  )
  const contadores = contarPorStatus(linhasPainel)
  const aulasOrdenadas = ordenarAulasParaEscolha(aulas, aulaSelecionada?.id ?? null, agora)
  const opcoesAulas: OpcaoAulaCheckin[] = aulasOrdenadas.map((aula) => ({
    id: aula.id,
    rotulo: `${rotuloAula(aula)} · ${aula.turma.modalidade.nome}`,
    horario: `${formatarHora(aula.inicio)}-${formatarHora(aula.fim)}`,
    detalhe: professorDaAula(aula),
    estado: estadoDaAula(aula, agora),
  }))

  return (
    <div className="space-y-6">
      <CabecalhoPagina
        titulo="Check-in"
        descricao="Painel visual das aulas do dia, com presença, comparecimento, inadimplência e ausências."
      >
        <Button asChild variant="outline">
          <Link href="/gestao/checkin/qrcode">
            <QrCode className="size-4" /> Consultar QR Code
          </Link>
        </Button>
      </CabecalhoPagina>

      <section className="grid gap-4 rounded-md border border-border bg-card p-4 shadow-sm xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="min-w-0">
          {aulaSelecionada ? (
            <>
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <Badge variant={aulaSelecionada.cancelada ? "destructive" : "outline"}>
                  {aulaSelecionada.turma.modalidade.nome}
                </Badge>
                <Badge variant="secondary">
                  {formatarHora(aulaSelecionada.inicio)}-{formatarHora(aulaSelecionada.fim)}
                </Badge>
                {aulaSelecionada.cancelada && <Badge variant="destructive">Cancelada</Badge>}
              </div>
              <h2 className="text-2xl font-black tracking-tight sm:text-3xl">
                {rotuloAula(aulaSelecionada)}
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {formatarDataExtenso(aulaSelecionada.inicio)} ·{" "}
                {formatarMinutos(aulaSelecionada.duracaoMin)} · {professorDaAula(aulaSelecionada)}
                {aulaSelecionada.turma.local ? ` · ${aulaSelecionada.turma.local}` : ""}
              </p>
            </>
          ) : (
            <>
              <h2 className="text-2xl font-black tracking-tight">Nenhuma aula hoje</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Gere ou cadastre aulas para acompanhar os check-ins neste painel.
              </p>
            </>
          )}
        </div>
        <SeletorAulaCheckin aulas={opcoesAulas} aulaSelecionadaId={aulaSelecionada?.id ?? null} />
      </section>

      {aulaSelecionada && (
        <>
          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            {(
              [
                "INADIMPLENTE",
                "CHECKIN_COMPARECIMENTO",
                "CHECKIN",
                "COMPARECIMENTO",
                "AUSENTE",
              ] as const
            ).map((status) => {
              const visual = visualPainel[status]
              const Icone = visual.Icone
              return (
                <div
                  key={status}
                  className={cn("rounded-md border p-3 shadow-sm", visual.className)}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-bold uppercase">{visual.titulo}</span>
                    <Icone className="size-4" />
                  </div>
                  <p className="mt-2 text-3xl font-black tabular-nums">{contadores[status]}</p>
                  <p className="text-xs font-medium opacity-75">{visual.resumo}</p>
                </div>
              )
            })}
          </section>

          <section className="space-y-3">
            <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
                  <UsersRound className="size-4" /> Alunos da aula
                </h2>
                <p className="text-sm text-muted-foreground">
                  Ordenado por inadimplência, check-in com comparecimento, check-in, comparecimento
                  e ausentes.
                </p>
              </div>
              <Badge variant="secondary">{linhasPainel.length} aluno(s)</Badge>
            </div>

            {linhasPainel.length > 0 ? (
              <div className="grid auto-rows-fr gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
                {linhasPainel.map((linha) => {
                  const visual = visualPainel[linha.statusPainel]
                  const Icone = visual.Icone
                  return (
                    <article
                      key={linha.alunoId}
                      className={cn(
                        "flex min-h-44 flex-col justify-between rounded-md border p-4 transition-transform hover:-translate-y-0.5",
                        visual.className,
                      )}
                    >
                      <div className="space-y-3">
                        <div className="flex items-start justify-between gap-3">
                          <h3 className="text-lg font-black leading-tight">{linha.nome}</h3>
                          <div className="flex shrink-0 items-center gap-2">
                            <div className="flex size-10 items-center justify-center rounded-md bg-white/70">
                              <Icone className="size-5" />
                            </div>
                            {podeEditar && (
                              <AcoesCardAlunoCheckin
                                aulaId={aulaSelecionada.id}
                                alunoId={linha.alunoId}
                                nome={linha.nome}
                                observacoesTecnicas={linha.observacoesTecnicas}
                                checkinLancado={
                                  linha.statusPainel === "CHECKIN" ||
                                  linha.statusPainel === "CHECKIN_COMPARECIMENTO"
                                }
                              />
                            )}
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {linha.badges.map((badge) => (
                            <span
                              key={badge}
                              className={cn(
                                "rounded-full border px-2 py-0.5 text-[11px] font-bold",
                                visual.badgeClassName,
                              )}
                            >
                              {badge}
                            </span>
                          ))}
                        </div>
                      </div>

                      <div className="mt-5 space-y-2">
                        <p className="text-sm font-semibold">{linha.detalhe}</p>
                        {linha.observacoesTecnicas && (
                          <p className="line-clamp-2 rounded-md bg-white/60 px-2 py-1 text-xs">
                            {linha.observacoesTecnicas}
                          </p>
                        )}
                      </div>
                    </article>
                  )
                })}
              </div>
            ) : (
              <div className="rounded-md border border-dashed border-border bg-card p-8 text-center text-sm text-muted-foreground">
                Nenhum aluno matriculado nesta modalidade.
              </div>
            )}
          </section>
        </>
      )}

      {monitoramento && monitoramento.tentativasInadimplentes.length > 0 && (
        <section className="rounded-md border border-red-200 bg-red-50 p-4 text-red-950">
          <h2 className="flex items-center gap-2 text-sm font-bold uppercase">
            <AlertTriangle className="size-4" /> Bloqueios por inadimplência
          </h2>
          <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {monitoramento.tentativasInadimplentes.map((tentativa) => (
              <div
                key={tentativa.alunoId}
                className="rounded-md border border-red-200 bg-white p-3"
              >
                <p className="font-semibold">{tentativa.nome}</p>
                <p className="text-xs text-red-800">
                  {tentativa.totalTentativas} tentativa(s) · última em{" "}
                  {formatarDataHora(tentativa.ultimaTentativaEm)}
                </p>
                <p className="mt-1 text-xs text-red-900">{tentativa.motivo}</p>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}

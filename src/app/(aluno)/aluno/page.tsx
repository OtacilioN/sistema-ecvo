import { CalendarCheck, CalendarClock, CalendarX, Clock, MapPin } from "lucide-react"
import { LembreteAtivarNotificacoes } from "@/components/lembrete-ativar-notificacoes"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { alunoContaOperacionalmente } from "@/lib/alunos/status"
import { exigirAluno } from "@/lib/auth/dal"
import { db } from "@/lib/db"
import { podeMarcarComparecimento } from "@/lib/services/comparecimento.service"
import { formatarDataExtenso, formatarDataInput, formatarHora } from "@/lib/utils/datas"
import { AcoesAula } from "./acoes-aula"

export const dynamic = "force-dynamic"

export default async function AlunoAgenda() {
  const { alunoId, usuario } = await exigirAluno()

  const [aluno, config] = await Promise.all([
    db.aluno.findUnique({
      where: { id: alunoId },
      select: { status: true, modalidades: { select: { id: true } } },
    }),
    db.configuracaoAcademia.findUnique({
      where: { id: "default" },
      select: { janelaComparecimentoHoras: true },
    }),
  ])
  const alunoOperacional = Boolean(aluno && alunoContaOperacionalmente(aluno.status))
  const modalidadeIds = alunoOperacional ? (aluno?.modalidades.map((m) => m.id) ?? []) : []
  const agora = new Date()
  const janelaHoras = config?.janelaComparecimentoHoras ?? 24

  const aulas = await db.aula.findMany({
    where: {
      cancelada: false,
      fim: { gte: agora },
      turma: { modalidadeId: { in: modalidadeIds } },
    },
    orderBy: { inicio: "asc" },
    take: 12,
    include: {
      turma: { select: { nome: true, local: true, modalidade: { select: { nome: true } } } },
      comparecimentos: { where: { alunoId }, select: { status: true } },
      checkins: { where: { alunoId }, select: { status: true } },
    },
  })
  const chaveHoje = formatarDataInput(agora)
  const aulasHoje = aulas.filter((aula) => formatarDataInput(aula.inicio) === chaveHoje)
  const aulasFuturas = aulas.filter((aula) => formatarDataInput(aula.inicio) !== chaveHoje)
  const aulasFuturasPorDia = agruparAulasPorDia(aulasFuturas)

  function CardAula({
    aula,
    destaque = false,
  }: {
    aula: (typeof aulas)[number]
    destaque?: boolean
  }) {
    const comp = aula.comparecimentos[0]
    const temComparecimento = comp?.status === "CONFIRMADO"
    const emListaEspera = comp?.status === "LISTA_ESPERA"
    const presente = aula.checkins.some((c) => c.status === "VALIDO")
    const pendenteRevisao = aula.checkins.some((c) => c.status === "PENDENTE_REVISAO")
    const janelaAberta = podeMarcarComparecimento({
      agora,
      inicioAula: aula.inicio,
      janelaHoras,
    })

    return (
      <Card className="overflow-hidden">
        <CardContent className="grid gap-4 p-4 sm:grid-cols-[auto_1fr] sm:items-center">
          <div className="flex items-center gap-3 sm:block sm:text-center">
            <div
              className={
                destaque
                  ? "flex min-h-16 min-w-20 flex-col justify-center rounded-md bg-primary px-3 py-2 text-primary-foreground"
                  : "flex min-h-16 min-w-20 flex-col justify-center rounded-md border border-border bg-background px-3 py-2"
              }
            >
              <span className="text-lg font-bold tabular-nums">{formatarHora(aula.inicio)}</span>
              <span className="text-xs opacity-80">{formatarHora(aula.fim)}</span>
            </div>
            <Badge variant="outline" className="sm:mt-2">
              {aula.turma.modalidade.nome}
            </Badge>
          </div>

          <div className="min-w-0 space-y-3">
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                {temComparecimento && !presente && (
                  <Badge variant="secondary">Agendamento marcado</Badge>
                )}
                {emListaEspera && !presente && <Badge variant="warning">Lista de espera</Badge>}
                {pendenteRevisao && !presente && (
                  <Badge variant="warning">Pendente de revisão</Badge>
                )}
                {presente && <Badge variant="success">Presente</Badge>}
              </div>
              <div>
                <p className="font-semibold">{aula.turma.nome}</p>
                <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
                  <span className="inline-flex items-center gap-1">
                    <Clock className="size-3.5" />
                    {formatarHora(aula.inicio)}-{formatarHora(aula.fim)}
                  </span>
                  {aula.turma.local && (
                    <span className="inline-flex items-center gap-1">
                      <MapPin className="size-3.5" />
                      {aula.turma.local}
                    </span>
                  )}
                </p>
              </div>
            </div>

            <AcoesAula
              aulaId={aula.id}
              temComparecimento={temComparecimento}
              emListaEspera={emListaEspera}
              presente={presente}
              pendenteRevisao={pendenteRevisao}
              janelaAberta={janelaAberta}
            />
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Olá, {usuario.nome.split(" ")[0]}!</h1>
          <p className="text-sm text-muted-foreground">Suas próximas aulas.</p>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:w-56">
          <div className="rounded-md border border-border bg-card p-3">
            <p className="text-xs text-muted-foreground">Hoje</p>
            <p className="mt-1 text-2xl font-bold tabular-nums">{aulasHoje.length}</p>
          </div>
          <div className="rounded-md border border-border bg-card p-3">
            <p className="text-xs text-muted-foreground">Próximas</p>
            <p className="mt-1 text-2xl font-bold tabular-nums">{aulasFuturas.length}</p>
          </div>
        </div>
      </div>

      <LembreteAtivarNotificacoes />

      {aulas.length === 0 && (
        <Card>
          <CardContent className="flex items-center gap-3 py-8 text-muted-foreground">
            <CalendarX className="size-5 shrink-0" />
            <span className="text-sm">
              {alunoOperacional
                ? "Nenhuma aula disponível nas suas modalidades."
                : "Matrícula trancada. Procure a gestão para retomar os treinos."}
            </span>
          </CardContent>
        </Card>
      )}

      {aulasHoje.length > 0 && (
        <section className="space-y-3" aria-labelledby="aulas-hoje">
          <div className="flex items-center gap-2">
            <CalendarCheck className="size-5 text-primary" />
            <h2 id="aulas-hoje" className="font-semibold">
              Aulas de hoje
            </h2>
          </div>
          <div className="grid gap-3">
            {aulasHoje.map((aula) => (
              <CardAula key={aula.id} aula={aula} destaque />
            ))}
          </div>
        </section>
      )}

      {aulasFuturasPorDia.length > 0 && (
        <section className="space-y-4" aria-labelledby="proximas-aulas">
          <div className="flex items-center gap-2">
            <CalendarClock className="size-5 text-muted-foreground" />
            <h2 id="proximas-aulas" className="font-semibold">
              Próximos dias
            </h2>
          </div>

          <div className="space-y-5">
            {aulasFuturasPorDia.map((grupo) => (
              <div key={grupo.chave} className="space-y-3">
                <div className="sticky top-14 z-10 border-y border-border bg-background/95 py-2 backdrop-blur md:top-16">
                  <p className="text-sm font-semibold capitalize">
                    {formatarDataExtenso(grupo.data)}
                  </p>
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  {grupo.aulas.map((aula) => (
                    <CardAula key={aula.id} aula={aula} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}

function agruparAulasPorDia<T extends { inicio: Date }>(aulas: T[]) {
  const grupos = new Map<string, { chave: string; data: Date; aulas: T[] }>()

  for (const aula of aulas) {
    const chave = formatarDataInput(aula.inicio)
    const grupo = grupos.get(chave)

    if (grupo) {
      grupo.aulas.push(aula)
    } else {
      grupos.set(chave, { chave, data: aula.inicio, aulas: [aula] })
    }
  }

  return Array.from(grupos.values())
}

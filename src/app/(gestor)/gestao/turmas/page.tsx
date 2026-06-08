import { addDays, format } from "date-fns"
import { fromZonedTime } from "date-fns-tz"
import { Badge } from "@/components/ui/badge"
import { CabecalhoPagina } from "@/components/ui/cabecalho-pagina"
import { Card, CardContent } from "@/components/ui/card"
import { exigirPapel } from "@/lib/auth/dal"
import { db } from "@/lib/db"
import { listarModalidades } from "@/lib/services/modalidade.service"
import { listarProfessores } from "@/lib/services/professor.service"
import {
  formatarDataExtenso,
  formatarDataHora,
  formatarMinutos,
  paraFusoAcademia,
  rotuloDiaSemana,
  TIMEZONE,
} from "@/lib/utils/datas"
import { AcoesAula, AcoesTurma, BotaoAulaAvulsa, BotaoNovaTurma } from "./acoes-turma"

export const dynamic = "force-dynamic"

function rotuloDiasSemana(diasSemana: number[], diaSemana: number | null): string {
  const dias = diasSemana.length > 0 ? diasSemana : diaSemana === null ? [] : [diaSemana]
  if (dias.length === 0) return "—"
  return dias.map(rotuloDiaSemana).join(", ")
}

export default async function TurmasPage() {
  await exigirPapel("GESTOR")
  const agora = new Date()
  const hojeAcademia = paraFusoAcademia(agora)
  const chaveHoje = format(hojeAcademia, "yyyy-MM-dd")
  const chaveAmanha = format(addDays(hojeAcademia, 1), "yyyy-MM-dd")
  const inicioHoje = fromZonedTime(`${chaveHoje}T00:00:00`, TIMEZONE)
  const inicioAmanha = fromZonedTime(`${chaveAmanha}T00:00:00`, TIMEZONE)
  const [turmas, aulas, modalidades, professores] = await Promise.all([
    db.turma.findMany({
      where: { ehEvento: false },
      orderBy: [{ diaSemana: "asc" }, { horaInicio: "asc" }],
      include: {
        modalidade: { select: { nome: true } },
        professor: { select: { usuario: { select: { nome: true } } } },
        _count: { select: { aulas: true } },
      },
    }),
    db.aula.findMany({
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
        _count: { select: { comparecimentos: true, checkins: true } },
      },
    }),
    listarModalidades({ apenasAtivas: true }),
    listarProfessores(),
  ])

  const modalidadesOpcao = modalidades.map((m) => ({ id: m.id, nome: m.nome }))
  const professoresOpcao = professores.map((p) => ({ id: p.id, nome: p.usuario.nome }))

  return (
    <div className="space-y-6">
      <CabecalhoPagina
        titulo="Turmas e horários"
        descricao="Grade recorrente, aulas avulsas, substituições e cancelamentos."
      >
        <BotaoAulaAvulsa modalidades={modalidadesOpcao} professores={professoresOpcao} />
        <BotaoNovaTurma modalidades={modalidadesOpcao} professores={professoresOpcao} />
      </CabecalhoPagina>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-muted-foreground">Grade recorrente</h2>
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="tabela-responsiva w-full text-sm">
                <thead className="border-b border-border text-left text-muted-foreground">
                  <tr>
                    <th className="p-4 font-medium">Turma</th>
                    <th className="p-4 font-medium">Modalidade</th>
                    <th className="p-4 font-medium">Dia / horário</th>
                    <th className="p-4 font-medium">Professor</th>
                    <th className="p-4 text-center font-medium">Aulas</th>
                    <th className="p-4 font-medium">Status</th>
                    <th className="p-4 text-right font-medium">
                      <span className="sr-only">Ações</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {turmas.map((t) => {
                    const diasSemana = rotuloDiasSemana(t.diasSemana, t.diaSemana)
                    return (
                      <tr
                        key={t.id}
                        className="border-b border-border transition-colors last:border-0 hover:bg-muted/40"
                      >
                        <td className="p-4 font-medium" data-label="Turma">
                          {t.nome ?? "—"}
                          {t.local && (
                            <span className="block text-xs font-normal text-muted-foreground">
                              {t.local}
                            </span>
                          )}
                        </td>
                        <td className="p-4" data-label="Modalidade">
                          <Badge variant="outline">{t.modalidade.nome}</Badge>
                        </td>
                        <td className="p-4" data-label="Dia / horário">
                          {diasSemana} · {t.horaInicio}–{t.horaFim}
                          <span className="block text-xs text-muted-foreground">
                            {formatarMinutos(t.duracaoMin)}
                            {t.capacidade > 0 ? ` · ${t.capacidade} vagas` : " · sem limite"}
                          </span>
                        </td>
                        <td className="p-4" data-label="Professor">
                          {t.professor?.usuario.nome ?? "—"}
                        </td>
                        <td className="p-4 text-center tabular-nums" data-label="Aulas">
                          {t._count.aulas}
                        </td>
                        <td className="p-4" data-label="Status">
                          <Badge variant={t.ativa ? "success" : "secondary"}>
                            {t.ativa ? "Ativa" : "Inativa"}
                          </Badge>
                        </td>
                        <td className="p-4" data-label="Ações">
                          <div className="flex justify-end">
                            <AcoesTurma
                              modalidades={modalidadesOpcao}
                              professores={professoresOpcao}
                              turma={{
                                id: t.id,
                                rotulo: `${t.modalidade.nome} · ${diasSemana} ${t.horaInicio ?? ""}`,
                                modalidadeId: t.modalidadeId,
                                nome: t.nome,
                                professorId: t.professorId,
                                diasSemana:
                                  t.diasSemana.length > 0
                                    ? t.diasSemana
                                    : t.diaSemana === null
                                      ? []
                                      : [t.diaSemana],
                                horaInicio: t.horaInicio,
                                horaFim: t.horaFim,
                                capacidade: t.capacidade,
                                local: t.local,
                                nivel: t.nivel,
                                ativa: t.ativa,
                              }}
                            />
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                  {turmas.length === 0 && (
                    <tr>
                      <td colSpan={7} className="p-10 text-center text-muted-foreground">
                        Nenhuma turma cadastrada. Use “Nova turma” para começar.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </section>

      <section className="mt-10 space-y-4 border-t border-border pt-8">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-sm font-semibold text-foreground">Aulas de hoje</h2>
            <p className="text-sm text-muted-foreground">{formatarDataExtenso(agora)}</p>
          </div>
          <Badge variant="secondary">{aulas.length} aula(s)</Badge>
        </div>
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="tabela-responsiva w-full text-sm">
                <thead className="border-b border-border text-left text-muted-foreground">
                  <tr>
                    <th className="p-4 font-medium">Aula</th>
                    <th className="p-4 font-medium">Modalidade</th>
                    <th className="p-4 font-medium">Professor efetivo</th>
                    <th className="p-4 font-medium">Comparecimentos</th>
                    <th className="p-4 font-medium">Status</th>
                    <th className="p-4 text-right font-medium">
                      <span className="sr-only">Ações</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {aulas.map((aula) => (
                    <tr
                      key={aula.id}
                      className="border-b border-border transition-colors last:border-0 hover:bg-muted/40"
                    >
                      <td className="p-4 font-medium" data-label="Aula">
                        {aula.turma.nome ??
                          (aula.turma.ehEvento ? "Aula avulsa" : "Aula recorrente")}
                        <span className="block text-xs font-normal text-muted-foreground">
                          {formatarDataHora(aula.inicio)} · {formatarMinutos(aula.duracaoMin)}
                          {aula.turma.local ? ` · ${aula.turma.local}` : ""}
                        </span>
                      </td>
                      <td className="p-4" data-label="Modalidade">
                        <Badge variant={aula.turma.ehEvento ? "success" : "outline"}>
                          {aula.turma.modalidade.nome}
                        </Badge>
                      </td>
                      <td className="p-4" data-label="Professor">
                        {aula.professor?.usuario.nome ??
                          aula.turma.professor?.usuario.nome ??
                          "Sem professor"}
                      </td>
                      <td className="p-4" data-label="Comparecimentos">
                        {aula._count.comparecimentos} intenção(ões)
                        <span className="block text-xs text-muted-foreground">
                          {aula._count.checkins} check-in(s)
                        </span>
                      </td>
                      <td className="p-4" data-label="Status">
                        <Badge variant={aula.cancelada ? "destructive" : "success"}>
                          {aula.cancelada ? "Cancelada" : "Ativa"}
                        </Badge>
                      </td>
                      <td className="p-4" data-label="Ações">
                        <div className="flex justify-end">
                          <AcoesAula
                            aulaId={aula.id}
                            cancelada={aula.cancelada}
                            professores={professoresOpcao}
                            rotulo={`${formatarDataHora(aula.inicio)} · ${aula.turma.modalidade.nome}`}
                          />
                        </div>
                      </td>
                    </tr>
                  ))}
                  {aulas.length === 0 && (
                    <tr>
                      <td colSpan={6} className="p-10 text-center text-muted-foreground">
                        Nenhuma aula gerada para hoje.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </section>
    </div>
  )
}

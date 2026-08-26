import { addDays, format } from "date-fns"
import { fromZonedTime } from "date-fns-tz"
import { Badge } from "@/components/ui/badge"
import { CabecalhoPagina } from "@/components/ui/cabecalho-pagina"
import { Card, CardContent } from "@/components/ui/card"
import { exigirGestao } from "@/lib/auth/dal"
import { db } from "@/lib/db"
import { listarModalidades } from "@/lib/services/modalidade.service"
import { listarProfessores } from "@/lib/services/professor.service"
import {
  formatarDataExtenso,
  formatarDataHora,
  formatarMinutos,
  paraFusoAcademia,
  TIMEZONE,
} from "@/lib/utils/datas"
import { AcoesAula, BotaoAulaAvulsa, BotaoNovaTurma } from "./acoes-turma"
import { TabelaTurmas } from "./tabela-turmas"

export const dynamic = "force-dynamic"

export default async function TurmasPage() {
  const usuario = await exigirGestao()
  const podeEditar = usuario.papel === "GESTOR"
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
    listarModalidades(),
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
        {podeEditar && (
          <>
            <BotaoAulaAvulsa modalidades={modalidadesOpcao} professores={professoresOpcao} />
            <BotaoNovaTurma modalidades={modalidadesOpcao} professores={professoresOpcao} />
          </>
        )}
      </CabecalhoPagina>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-muted-foreground">Grade recorrente</h2>
        <TabelaTurmas
          podeEditar={podeEditar}
          modalidades={modalidadesOpcao}
          professores={professoresOpcao}
          turmas={turmas.map((turma) => ({
            id: turma.id,
            modalidadeId: turma.modalidadeId,
            modalidadeNome: turma.modalidade.nome,
            nome: turma.nome,
            professorId: turma.professorId,
            professorNome: turma.professor?.usuario.nome ?? null,
            diaSemana: turma.diaSemana,
            diasSemana: turma.diasSemana,
            horaInicio: turma.horaInicio,
            horaFim: turma.horaFim,
            duracaoMin: turma.duracaoMin,
            capacidade: turma.capacidade,
            local: turma.local,
            nivel: turma.nivel,
            ativa: turma.ativa,
            aulas: turma._count.aulas,
          }))}
        />
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
                    <th className="p-4 font-medium">Agendamentos</th>
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
                      <td className="p-4" data-label="Agendamentos">
                        {aula._count.comparecimentos}{" "}
                        {aula._count.comparecimentos === 1 ? "agendamento" : "agendamentos"}
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
                            somenteLeitura={!podeEditar}
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

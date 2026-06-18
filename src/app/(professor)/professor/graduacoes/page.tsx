import { Badge } from "@/components/ui/badge"
import { CabecalhoPagina } from "@/components/ui/cabecalho-pagina"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { STATUS_ALUNO_OPERACIONAIS } from "@/lib/alunos/status"
import { exigirProfessor } from "@/lib/auth/dal"
import { db } from "@/lib/db"
import {
  avaliarElegibilidade,
  graduacaoInicial,
  proximaGraduacao,
} from "@/lib/services/graduacao.service"
import { formatarData, formatarDataHora, minutosParaHoras } from "@/lib/utils/datas"
import { formatarBRL } from "@/lib/utils/formato"
import { AcoesGraduacoesProfessor } from "./acoes-graduacoes"
import { FormResultadoExame } from "./form-resultado-exame"

export const dynamic = "force-dynamic"

export default async function Page() {
  const { professorId } = await exigirProfessor()
  const professor = await db.professor.findUnique({
    where: { id: professorId },
    include: {
      modalidades: {
        orderBy: { nome: "asc" },
        include: { graduacoes: { orderBy: [{ ordem: "asc" }, { nome: "asc" }] } },
      },
    },
  })

  if (!professor) return null

  const modalidadeIds = professor.modalidades.map((m) => m.id)
  const [alunos, exames] = await Promise.all([
    db.aluno.findMany({
      where: {
        status: { in: [...STATUS_ALUNO_OPERACIONAIS] },
        modalidades: { some: { id: { in: modalidadeIds } } },
      },
      orderBy: { usuario: { nome: "asc" } },
      include: {
        usuario: { select: { nome: true } },
        modalidades: { where: { id: { in: modalidadeIds } }, select: { id: true, nome: true } },
        movimentosHoras: { select: { modalidadeId: true, minutos: true } },
        graduacoes: {
          orderBy: { concedidaEm: "desc" },
          include: {
            concedidaPor: { select: { usuario: { select: { nome: true } } } },
            graduacao: { include: { modalidade: true } },
          },
        },
      },
    }),
    db.exame.findMany({
      where: { professorId },
      orderBy: { data: "desc" },
      take: 10,
      include: {
        modalidade: { select: { id: true, nome: true } },
        inscricoes: {
          orderBy: { aluno: { usuario: { nome: "asc" } } },
          include: {
            aluno: {
              select: {
                usuario: { select: { nome: true } },
              },
            },
          },
        },
        _count: { select: { inscricoes: true } },
      },
    }),
  ])

  const graduacoes = professor.modalidades.flatMap((modalidade) =>
    modalidade.graduacoes.map((graduacao) => ({
      id: graduacao.id,
      rotulo: `${modalidade.nome} · ${graduacao.nome}`,
    })),
  )

  const alunosOpcao = alunos.map((aluno) => ({
    id: aluno.id,
    nome: aluno.usuario.nome,
    detalhe: aluno.modalidades.map((m) => m.nome).join(", "),
    modalidades: aluno.modalidades.map((modalidade) => ({
      id: modalidade.id,
      nome: modalidade.nome,
    })),
  }))

  const atuais = alunos.flatMap((aluno) =>
    aluno.graduacoes
      .filter((registro) => registro.atual)
      .map((registro) => ({
        id: registro.id,
        aluno: aluno.usuario.nome,
        modalidade: registro.graduacao.modalidade.nome,
        graduacao: registro.graduacao.nome,
        concedidaEm: registro.concedidaEm,
        professor: registro.concedidaPor.usuario.nome,
      })),
  )

  const catalogoPorModalidade = new Map(
    professor.modalidades.map((modalidade) => [modalidade.id, modalidade.graduacoes]),
  )
  const graduacoesPorModalidade = new Map(
    professor.modalidades.map((modalidade) => [
      modalidade.id,
      modalidade.graduacoes.map((graduacao) => ({
        id: graduacao.id,
        nome: graduacao.nome,
      })),
    ]),
  )

  const elegibilidades = alunos
    .flatMap((aluno) => {
      const minutosPorModalidade = new Map<string, number>()
      for (const movimento of aluno.movimentosHoras) {
        minutosPorModalidade.set(
          movimento.modalidadeId,
          (minutosPorModalidade.get(movimento.modalidadeId) ?? 0) + movimento.minutos,
        )
      }

      return aluno.modalidades.flatMap((modalidade) => {
        const catalogo = catalogoPorModalidade.get(modalidade.id) ?? []
        const atual = aluno.graduacoes.find(
          (registro) => registro.atual && registro.graduacao.modalidadeId === modalidade.id,
        )
        const graduacaoAtual = atual?.graduacao ?? graduacaoInicial(catalogo)
        const proxima = proximaGraduacao(catalogo, graduacaoAtual)

        if (!proxima) return []

        const avaliacao = avaliarElegibilidade({
          graduacao: proxima,
          minutosNaModalidade: minutosPorModalidade.get(modalidade.id) ?? 0,
          concedidaEmAtual: atual?.concedidaEm ?? null,
        })

        return {
          aluno: aluno.usuario.nome,
          modalidade: modalidade.nome,
          atual: graduacaoAtual?.nome ?? "Sem graduação",
          proxima: proxima.nome,
          avaliacao,
        }
      })
    })
    .sort((a, b) => Number(b.avaliacao.elegivel) - Number(a.avaliacao.elegivel))
    .slice(0, 12)

  const horasPorAlunoModalidade = alunos
    .flatMap((aluno) => {
      const minutosPorModalidade = new Map<string, number>()
      for (const movimento of aluno.movimentosHoras) {
        minutosPorModalidade.set(
          movimento.modalidadeId,
          (minutosPorModalidade.get(movimento.modalidadeId) ?? 0) + movimento.minutos,
        )
      }

      return aluno.modalidades.map((modalidade) => ({
        aluno: aluno.usuario.nome,
        modalidade: modalidade.nome,
        minutos: minutosPorModalidade.get(modalidade.id) ?? 0,
      }))
    })
    .filter((item) => item.minutos > 0)
    .sort((a, b) => b.minutos - a.minutos || a.aluno.localeCompare(b.aluno))
    .slice(0, 12)

  return (
    <div className="space-y-6">
      <CabecalhoPagina
        titulo="Graduações"
        descricao="Histórico por modalidade, elegibilidade e exames sob sua responsabilidade."
      >
        <AcoesGraduacoesProfessor
          alunos={alunosOpcao}
          graduacoes={graduacoes}
          modalidades={professor.modalidades.map((m) => ({ id: m.id, nome: m.nome }))}
        />
      </CabecalhoPagina>

      <Card>
        <CardHeader>
          <CardTitle>Graduação atual por aluno</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <table className="tabela-responsiva w-full text-sm">
            <thead className="border-b border-border text-left text-muted-foreground">
              <tr>
                <th className="p-4 font-medium">Aluno</th>
                <th className="p-4 font-medium">Modalidade</th>
                <th className="p-4 font-medium">Graduação</th>
                <th className="p-4 font-medium">Concedida em</th>
                <th className="p-4 font-medium">Professor</th>
              </tr>
            </thead>
            <tbody>
              {atuais.map((registro) => (
                <tr key={registro.id} className="border-b border-border last:border-0">
                  <td className="p-4 font-medium" data-label="Aluno">
                    {registro.aluno}
                  </td>
                  <td className="p-4" data-label="Modalidade">
                    {registro.modalidade}
                  </td>
                  <td className="p-4" data-label="Graduação">
                    <Badge variant="outline">{registro.graduacao}</Badge>
                  </td>
                  <td className="p-4" data-label="Concedida em">
                    {formatarData(registro.concedidaEm)}
                  </td>
                  <td className="p-4" data-label="Professor">
                    {registro.professor}
                  </td>
                </tr>
              ))}
              {atuais.length === 0 && (
                <tr>
                  <td colSpan={5} className="p-8 text-center text-muted-foreground">
                    Nenhuma graduação atual registrada.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Horas por modalidade</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {horasPorAlunoModalidade.map((item) => (
            <div
              key={`${item.aluno}-${item.modalidade}`}
              className="flex items-center justify-between gap-4 border-b border-border pb-3 last:border-0 last:pb-0"
            >
              <div>
                <p className="font-medium">{item.aluno}</p>
                <p className="text-sm text-muted-foreground">{item.modalidade}</p>
              </div>
              <span className="font-semibold tabular-nums">{minutosParaHoras(item.minutos)}h</span>
            </div>
          ))}
          {horasPorAlunoModalidade.length === 0 && (
            <p className="text-sm text-muted-foreground">
              Sem horas registradas nas suas modalidades.
            </p>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 xl:grid-cols-[1fr_0.9fr]">
        <Card>
          <CardHeader>
            <CardTitle>Elegibilidade sugerida</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {elegibilidades.map((item) => (
              <div
                key={`${item.aluno}-${item.modalidade}-${item.proxima}`}
                className="flex items-center justify-between gap-4 border-b border-border pb-3 last:border-0 last:pb-0"
              >
                <div>
                  <p className="font-medium">{item.aluno}</p>
                  <p className="text-sm text-muted-foreground">
                    {item.modalidade} · {item.atual} → {item.proxima}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {item.avaliacao.horasAtuais}h
                    {item.avaliacao.horasMinimas !== null
                      ? ` / ${item.avaliacao.horasMinimas}h mín.`
                      : ""}
                  </p>
                </div>
                <Badge variant={item.avaliacao.elegivel ? "success" : "secondary"}>
                  {item.avaliacao.elegivel ? "Elegível" : "Acompanhar"}
                </Badge>
              </div>
            ))}
            {elegibilidades.length === 0 && (
              <p className="text-sm text-muted-foreground">
                Sem critérios cadastrados para avaliar.
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Exames</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {exames.map((exame) => (
              <div key={exame.id} className="border-b border-border pb-3 last:border-0 last:pb-0">
                <div className="flex items-center justify-between gap-3">
                  <p className="font-medium">{exame.modalidade.nome}</p>
                  <Badge variant="secondary">{exame._count.inscricoes} inscrito(s)</Badge>
                </div>
                <p className="text-sm text-muted-foreground">{formatarDataHora(exame.data)}</p>
                {exame.taxa !== null && (
                  <p className="text-xs text-muted-foreground">{formatarBRL(Number(exame.taxa))}</p>
                )}
                {exame.descricao && <p className="mt-1 text-sm">{exame.descricao}</p>}
                <div className="mt-3 space-y-3">
                  {exame.inscricoes.map((inscricao) => (
                    <div key={inscricao.id} className="rounded-md border border-border p-3">
                      <div className="mb-2 flex items-center justify-between gap-3">
                        <p className="text-sm font-medium">{inscricao.aluno.usuario.nome}</p>
                        <Badge
                          variant={
                            inscricao.aprovado === null
                              ? "secondary"
                              : inscricao.aprovado
                                ? "success"
                                : "destructive"
                          }
                        >
                          {inscricao.aprovado === null
                            ? "Pendente"
                            : inscricao.aprovado
                              ? "Aprovado"
                              : "Não aprovado"}
                        </Badge>
                      </div>
                      <FormResultadoExame
                        inscricaoExameId={inscricao.id}
                        aprovado={inscricao.aprovado}
                        resultado={inscricao.resultado}
                        novaGraduacaoId={inscricao.novaGraduacaoId}
                        graduacoes={graduacoesPorModalidade.get(exame.modalidade.id) ?? []}
                      />
                    </div>
                  ))}
                  {exame.inscricoes.length === 0 && (
                    <p className="text-xs text-muted-foreground">
                      Nenhum aluno inscrito neste exame.
                    </p>
                  )}
                </div>
              </div>
            ))}
            {exames.length === 0 && (
              <p className="text-sm text-muted-foreground">Nenhum exame cadastrado.</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

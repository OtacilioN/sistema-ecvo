import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { exigirAluno } from "@/lib/auth/dal"
import { db } from "@/lib/db"
import {
  avaliarElegibilidade,
  graduacaoInicial,
  proximaGraduacao,
} from "@/lib/services/graduacao.service"
import { formatarData, formatarDataHora } from "@/lib/utils/datas"
import { formatarBRL } from "@/lib/utils/formato"
import { FormInscricaoExame } from "./form-inscricao-exame"

export const dynamic = "force-dynamic"

export default async function Page() {
  const { alunoId } = await exigirAluno()
  const aluno = await db.aluno.findUnique({
    where: { id: alunoId },
    include: {
      modalidades: {
        orderBy: { nome: "asc" },
        include: { graduacoes: { orderBy: [{ ordem: "asc" }, { nome: "asc" }] } },
      },
      movimentosHoras: { select: { modalidadeId: true, minutos: true } },
      graduacoes: {
        orderBy: { concedidaEm: "desc" },
        include: {
          concedidaPor: { select: { usuario: { select: { nome: true } } } },
          graduacaoAnterior: { select: { nome: true } },
          graduacao: { include: { modalidade: true } },
        },
      },
    },
  })

  if (!aluno) return null

  const modalidadeIds = aluno.modalidades.map((m) => m.id)
  const [exames, inscricoesExame] = await Promise.all([
    db.exame.findMany({
      where: { modalidadeId: { in: modalidadeIds }, data: { gte: new Date() } },
      orderBy: { data: "asc" },
      take: 8,
      include: {
        modalidade: { select: { nome: true } },
        professor: { select: { usuario: { select: { nome: true } } } },
        inscricoes: {
          where: { alunoId },
          select: { id: true, aprovado: true, resultado: true },
        },
        _count: { select: { inscricoes: true } },
      },
    }),
    db.inscricaoExame.findMany({
      where: { alunoId },
      orderBy: { exame: { data: "desc" } },
      take: 12,
      include: {
        exame: {
          include: {
            modalidade: { select: { nome: true } },
            professor: { select: { usuario: { select: { nome: true } } } },
          },
        },
      },
    }),
  ])

  const minutosPorModalidade = new Map<string, number>()
  for (const movimento of aluno.movimentosHoras) {
    minutosPorModalidade.set(
      movimento.modalidadeId,
      (minutosPorModalidade.get(movimento.modalidadeId) ?? 0) + movimento.minutos,
    )
  }

  const atuais = aluno.modalidades.map((modalidade) => {
    const atual = aluno.graduacoes.find(
      (registro) => registro.atual && registro.graduacao.modalidadeId === modalidade.id,
    )
    const graduacaoAtual = atual?.graduacao ?? graduacaoInicial(modalidade.graduacoes)
    const proxima = proximaGraduacao(modalidade.graduacoes, graduacaoAtual)
    const avaliacao = proxima
      ? avaliarElegibilidade({
          graduacao: proxima,
          minutosNaModalidade: minutosPorModalidade.get(modalidade.id) ?? 0,
          concedidaEmAtual: atual?.concedidaEm ?? null,
        })
      : null

    return {
      modalidade: modalidade.nome,
      atual: graduacaoAtual?.nome ?? "Sem graduação",
      concedidaEm: atual?.concedidaEm ?? null,
      professor: atual?.concedidaPor.usuario.nome ?? null,
      proxima: proxima?.nome ?? null,
      avaliacao,
    }
  })

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold tracking-tight">Minhas graduações</h1>
        <p className="text-sm text-muted-foreground">Graduação atual, histórico e exames.</p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {atuais.map((item) => (
          <Card key={item.modalidade}>
            <CardHeader>
              <div className="flex items-center justify-between gap-3">
                <CardTitle>{item.modalidade}</CardTitle>
                <Badge variant="outline">{item.atual}</Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <Campo
                  rotulo="Concedida em"
                  valor={item.concedidaEm ? formatarData(item.concedidaEm) : null}
                />
                <Campo rotulo="Professor" valor={item.professor} />
              </div>
              {item.proxima && item.avaliacao && (
                <div className="rounded-md border border-border p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium">Próxima: {item.proxima}</p>
                      <p className="text-xs text-muted-foreground">
                        {item.avaliacao.horasAtuais}h
                        {item.avaliacao.horasMinimas !== null
                          ? ` / ${item.avaliacao.horasMinimas}h mín.`
                          : ""}
                      </p>
                    </div>
                    <Badge variant={item.avaliacao.elegivel ? "success" : "secondary"}>
                      {item.avaliacao.elegivel ? "Elegível" : "Em evolução"}
                    </Badge>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        ))}
        {atuais.length === 0 && (
          <Card>
            <CardContent className="py-8 text-center text-sm text-muted-foreground">
              Nenhuma modalidade vinculada.
            </CardContent>
          </Card>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Histórico</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <table className="tabela-responsiva w-full text-sm">
            <thead className="border-b border-border text-left text-muted-foreground">
              <tr>
                <th className="p-4 font-medium">Data</th>
                <th className="p-4 font-medium">Modalidade</th>
                <th className="p-4 font-medium">Anterior</th>
                <th className="p-4 font-medium">Nova</th>
                <th className="p-4 font-medium">Professor</th>
                <th className="p-4 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {aluno.graduacoes.map((registro) => (
                <tr key={registro.id} className="border-b border-border last:border-0">
                  <td className="p-4" data-label="Data">
                    {formatarData(registro.concedidaEm)}
                  </td>
                  <td className="p-4" data-label="Modalidade">
                    {registro.graduacao.modalidade.nome}
                  </td>
                  <td className="p-4" data-label="Anterior">
                    {registro.graduacaoAnterior?.nome ?? "Inicial"}
                  </td>
                  <td className="p-4" data-label="Nova">
                    {registro.graduacao.nome}
                  </td>
                  <td className="p-4" data-label="Professor">
                    {registro.concedidaPor.usuario.nome}
                  </td>
                  <td className="p-4" data-label="Status">
                    <Badge variant={registro.atual ? "success" : "secondary"}>
                      {registro.atual ? "Atual" : "Histórico"}
                    </Badge>
                  </td>
                </tr>
              ))}
              {aluno.graduacoes.length === 0 && (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-muted-foreground">
                    Nenhuma graduação registrada.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Próximos exames</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {exames.map((exame) => (
            <div key={exame.id} className="border-b border-border pb-3 last:border-0 last:pb-0">
              <div className="flex items-center justify-between gap-3">
                <p className="font-medium">{exame.modalidade.nome}</p>
                <div className="flex flex-wrap items-center justify-end gap-2">
                  {exame.inscricoes.length > 0 && <Badge variant="success">Inscrito</Badge>}
                  <Badge variant="secondary">{exame._count.inscricoes} inscrito(s)</Badge>
                </div>
              </div>
              <p className="text-sm text-muted-foreground">
                {formatarDataHora(exame.data)} · {exame.professor.usuario.nome}
              </p>
              {exame.taxa !== null && (
                <p className="text-xs text-muted-foreground">{formatarBRL(Number(exame.taxa))}</p>
              )}
              {exame.descricao && <p className="mt-1 text-sm">{exame.descricao}</p>}
              {exame.inscricoes.length === 0 && (
                <div className="mt-3">
                  <FormInscricaoExame exameId={exame.id} />
                </div>
              )}
            </div>
          ))}
          {exames.length === 0 && (
            <p className="text-sm text-muted-foreground">
              Nenhum exame futuro nas suas modalidades.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Meus exames</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <table className="tabela-responsiva w-full text-sm">
            <thead className="border-b border-border text-left text-muted-foreground">
              <tr>
                <th className="p-4 font-medium">Data</th>
                <th className="p-4 font-medium">Modalidade</th>
                <th className="p-4 font-medium">Professor</th>
                <th className="p-4 font-medium">Resultado</th>
                <th className="p-4 font-medium">Observação</th>
              </tr>
            </thead>
            <tbody>
              {inscricoesExame.map((inscricao) => (
                <tr key={inscricao.id} className="border-b border-border last:border-0">
                  <td className="p-4" data-label="Data">
                    {formatarDataHora(inscricao.exame.data)}
                  </td>
                  <td className="p-4" data-label="Modalidade">
                    {inscricao.exame.modalidade.nome}
                  </td>
                  <td className="p-4" data-label="Professor">
                    {inscricao.exame.professor.usuario.nome}
                  </td>
                  <td className="p-4" data-label="Resultado">
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
                  </td>
                  <td className="p-4" data-label="Observação">
                    {inscricao.resultado ?? "—"}
                  </td>
                </tr>
              ))}
              {inscricoesExame.length === 0 && (
                <tr>
                  <td colSpan={5} className="p-8 text-center text-muted-foreground">
                    Nenhuma inscrição em exame.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  )
}

function Campo({ rotulo, valor }: { rotulo: string; valor?: string | null }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{rotulo}</p>
      <p className="mt-1 text-sm font-medium">{valor && valor.length > 0 ? valor : "—"}</p>
    </div>
  )
}

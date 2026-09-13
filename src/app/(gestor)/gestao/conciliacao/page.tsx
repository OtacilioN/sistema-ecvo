import { Badge, type BadgeProps } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { CabecalhoPagina } from "@/components/ui/cabecalho-pagina"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { STATUS_ALUNO_OPERACIONAIS } from "@/lib/alunos/status"
import { exigirGestao } from "@/lib/auth/dal"
import { consolidarResumoMensal } from "@/lib/conciliacao/resumo-mensal"
import { db } from "@/lib/db"
import { formatarData, formatarDataHora } from "@/lib/utils/datas"
import { formatarBRL } from "@/lib/utils/formato"
import { competenciaConciliacaoSchema } from "@/lib/validations/conciliacao"
import { AcaoResolverRegistro, BotaoImportarConciliacao } from "./acoes-conciliacao"

export const dynamic = "force-dynamic"

const VARIANTE_STATUS: Record<string, BadgeProps["variant"]> = {
  CONCILIADO: "success",
  NAO_ENCONTRADO: "warning",
  ALUNO_NAO_IDENTIFICADO: "warning",
  DIVERGENCIA_DATA: "warning",
  DIVERGENCIA_HORARIO: "warning",
  CHECKIN_INVALIDADO: "destructive",
  DUPLICADO_PLANILHA: "secondary",
  DUPLICADO_SISTEMA: "secondary",
  PENDENTE: "outline",
}

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ competencia?: string }>
}) {
  const usuario = await exigirGestao()
  const podeEditar = usuario.papel === "GESTOR"
  const parametros = await searchParams
  const mes = competenciaConciliacaoSchema.safeParse(parametros.competencia)
  const competencia = mes.success ? mes.data : undefined
  const filtroImportacao = competencia ? { competencia } : {}
  const [importacoes, registros, alunos, checkins] = await Promise.all([
    db.importacao.findMany({
      orderBy: { criadoEm: "desc" },
      where: filtroImportacao,
      include: { _count: { select: { registros: true } } },
    }),
    db.registroImportado.findMany({
      orderBy: { importacao: { criadoEm: "desc" } },
      where: { importacao: filtroImportacao },
      include: {
        importacao: {
          select: {
            plataforma: true,
            arquivo: true,
            competencia: true,
            resumoMensal: true,
            unidadeExternaId: true,
            unidadeExternaNome: true,
          },
        },
        aluno: { select: { usuario: { select: { nome: true } } } },
        checkinVinculado: {
          select: {
            id: true,
            status: true,
            aula: {
              select: {
                inicio: true,
                turma: { select: { modalidade: { select: { nome: true } } } },
              },
            },
          },
        },
      },
    }),
    db.aluno.findMany({
      where: {
        tipo: { in: ["WELLHUB", "TOTALPASS"] },
      },
      orderBy: { usuario: { nome: "asc" } },
      select: {
        id: true,
        tipo: true,
        status: true,
        usuario: { select: { nome: true } },
        idExterno: true,
      },
    }),
    db.checkin.findMany({
      where: {
        aluno: {
          tipo: { in: ["WELLHUB", "TOTALPASS"] },
          status: { in: [...STATUS_ALUNO_OPERACIONAIS] },
        },
      },
      orderBy: { realizadoEm: "desc" },
      take: 80,
      include: {
        aluno: { select: { usuario: { select: { nome: true } } } },
        aula: {
          select: { inicio: true, turma: { select: { modalidade: { select: { nome: true } } } } },
        },
      },
    }),
  ])

  const opcoesAlunos = alunos.map((aluno) => ({
    id: aluno.id,
    nome: aluno.usuario.nome,
    tipo: aluno.tipo,
    status: aluno.status,
    detalhe: `${aluno.tipo} · ${aluno.status}${aluno.idExterno ? ` · ${aluno.idExterno}` : ""}`,
  }))
  const alunosOpcao = opcoesAlunos.filter((aluno) =>
    STATUS_ALUNO_OPERACIONAIS.some((status) => status === aluno.status),
  )
  const checkinsOpcao = checkins.map((checkin) => ({
    id: checkin.id,
    rotulo: `${checkin.aluno.usuario.nome} · ${checkin.aula.turma.modalidade.nome} · ${formatarDataHora(
      checkin.associadoAutomaticamente ? checkin.realizadoEm : checkin.aula.inicio,
    )} · ${checkin.status}`,
  }))

  const resumosMensais = consolidarResumoMensal(
    registros.filter((registro) => registro.importacao.resumoMensal),
  )
  const registrosDiarios = registros.filter((registro) => !registro.importacao.resumoMensal)
  const receitaTotalMensal = resumosMensais.reduce((soma, aluno) => soma + aluno.receitaCentavos, 0)

  const totais = importacoes.reduce(
    (acc, imp) => ({
      linhas: acc.linhas + imp.totalLinhas,
      conciliados: acc.conciliados + imp.totalConciliados,
      naoConciliados: acc.naoConciliados + imp.totalNaoConciliados,
      divergencias: acc.divergencias + imp.totalDivergencias,
    }),
    { linhas: 0, conciliados: 0, naoConciliados: 0, divergencias: 0 },
  )

  return (
    <div className="space-y-6">
      <CabecalhoPagina
        titulo="Conciliação"
        descricao="Receitas mensais Wellhub e TotalPass por aluno e conciliação de check-ins das planilhas diárias."
      >
        {podeEditar && <BotaoImportarConciliacao />}
      </CabecalhoPagina>

      <form method="get" className="flex flex-wrap items-end gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="filtro-competencia">Mês de referência</Label>
          <Input
            id="filtro-competencia"
            name="competencia"
            type="month"
            defaultValue={competencia ?? ""}
          />
        </div>
        <Button type="submit" variant="outline">
          Filtrar
        </Button>
        {competencia && (
          <a href="/gestao/conciliacao" className="text-sm underline">
            Ver todos os meses
          </a>
        )}
      </form>

      <div className="grid gap-4 md:grid-cols-4">
        <Resumo rotulo="Linhas importadas" valor={totais.linhas} />
        <Resumo rotulo="Conciliadas" valor={totais.conciliados} />
        <Resumo rotulo="Não conciliadas" valor={totais.naoConciliados} />
        <Resumo rotulo="Divergências" valor={totais.divergencias} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Consolidação mensal Wellhub e TotalPass</CardTitle>
          <p className="text-sm text-muted-foreground">
            Receita somada por plataforma, aluno e mês. Valores zerados e alunos sem vínculo também
            aparecem. Este resumo financeiro não cria nem valida check-ins ou horas.
          </p>
          <p className="font-semibold">
            Receita importada: {formatarBRL(receitaTotalMensal / 100)}
          </p>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="tabela-responsiva w-full text-sm">
              <thead className="border-b border-border text-left text-muted-foreground">
                <tr>
                  <th className="p-4 font-medium">Mês</th>
                  <th className="p-4 font-medium">Aluno / Identificação</th>
                  <th className="p-4 font-medium">Receita por conta</th>
                  <th className="p-4 font-medium">Receita somada</th>
                  <th className="p-4 font-medium">Check-ins informados</th>
                  <th className="p-4 font-medium">Identificação</th>
                  {podeEditar && (
                    <th className="p-4 font-medium">
                      <span className="sr-only">Ações</span>
                    </th>
                  )}
                </tr>
              </thead>
              <tbody>
                {resumosMensais.map((resumo) => (
                  <tr key={resumo.chave} className="border-b border-border last:border-0">
                    <td className="p-4" data-label="Mês">
                      {formatarCompetencia(resumo.competencia)}
                      <span className="block text-xs text-muted-foreground">
                        {resumo.plataforma}
                      </span>
                    </td>
                    <td className="p-4" data-label="Aluno / Identificação">
                      <span className="font-medium">{resumo.nome}</span>
                      <span className="block text-xs text-muted-foreground">
                        {resumo.plataforma === "TOTALPASS"
                          ? [...resumo.documentos]
                              .map((cpf) => `CPF •••.•••.•••-${cpf.slice(-2)}`)
                              .join(", ") || "Sem CPF"
                          : [...resumo.idsExternos].join(", ") || "Sem ID"}
                      </span>
                    </td>
                    <td className="p-4" data-label="Receita por conta">
                      {[...resumo.contas].map(([id, conta]) => (
                        <p key={id}>
                          {conta.nome}: {formatarBRL(conta.receitaCentavos / 100)}
                        </p>
                      ))}
                    </td>
                    <td className="p-4 font-semibold tabular-nums" data-label="Receita somada">
                      {formatarBRL(resumo.receitaCentavos / 100)}
                    </td>
                    <td className="p-4" data-label="Check-ins informados">
                      {resumo.checkinsInformados ? resumo.totalCheckins : "Não informado"}
                    </td>
                    <td className="p-4" data-label="Identificação">
                      <Badge
                        variant={
                          resumo.registros.every((registro) => registro.alunoId)
                            ? "success"
                            : "warning"
                        }
                      >
                        {resumo.registros.every((registro) => registro.alunoId)
                          ? "Aluno identificado"
                          : resumo.alunoId
                            ? "Vínculo parcial"
                            : "Sem vínculo"}
                      </Badge>
                    </td>
                    {podeEditar && (
                      <td className="p-4" data-label="Ações">
                        <div className="space-y-2">
                          {resumo.registros
                            .filter((registro) => registro.status !== "CONCILIADO")
                            .map((registro) => (
                              <div key={registro.id}>
                                <p className="text-xs text-muted-foreground">{registro.conta}</p>
                                <AcaoResolverRegistro
                                  registroId={registro.id}
                                  statusAtual={registro.status}
                                  alunos={opcoesAlunos.filter(
                                    (aluno) => aluno.tipo === resumo.plataforma,
                                  )}
                                  checkins={[]}
                                  resumoMensal
                                  plataforma={resumo.plataforma}
                                />
                              </div>
                            ))}
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
                {resumosMensais.length === 0 && (
                  <tr>
                    <td
                      colSpan={podeEditar ? 7 : 6}
                      className="p-10 text-center text-muted-foreground"
                    >
                      Nenhum resumo mensal importado{competencia ? " neste mês" : ""}.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Conciliação de registros diários</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="tabela-responsiva w-full text-sm">
              <thead className="border-b border-border text-left text-muted-foreground">
                <tr>
                  <th className="p-4 font-medium">Origem</th>
                  <th className="p-4 font-medium">Identificação</th>
                  <th className="p-4 font-medium">Data</th>
                  <th className="p-4 font-medium">Repasse</th>
                  <th className="p-4 font-medium">Aluno</th>
                  <th className="p-4 font-medium">Check-in</th>
                  <th className="p-4 font-medium">Status</th>
                  {podeEditar && (
                    <th className="p-4 text-right font-medium">
                      <span className="sr-only">Ações</span>
                    </th>
                  )}
                </tr>
              </thead>
              <tbody>
                {registrosDiarios.map((registro) => (
                  <tr
                    key={registro.id}
                    className="border-b border-border transition-colors last:border-0 hover:bg-muted/40"
                  >
                    <td className="p-4" data-label="Origem">
                      <span className="font-medium">{registro.importacao.plataforma}</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {registro.importacao.arquivo}
                      </span>
                    </td>
                    <td className="p-4" data-label="Identificação">
                      {registro.nome ?? registro.email ?? registro.cpf ?? registro.telefone ?? "—"}
                    </td>
                    <td className="p-4" data-label="Data">
                      {registro.dataReferencia ? formatarData(registro.dataReferencia) : "—"}
                      {registro.horarioReferencia ? ` · ${registro.horarioReferencia}` : ""}
                    </td>
                    <td className="p-4 tabular-nums" data-label="Repasse">
                      {registro.valorRepasse !== null
                        ? formatarBRL(Number(registro.valorRepasse))
                        : "—"}
                    </td>
                    <td className="p-4" data-label="Aluno">
                      {registro.aluno?.usuario.nome ?? "—"}
                    </td>
                    <td className="p-4" data-label="Check-in">
                      {registro.checkinVinculado
                        ? `${registro.checkinVinculado.aula.turma.modalidade.nome} · ${formatarDataHora(registro.checkinVinculado.aula.inicio)}`
                        : "—"}
                    </td>
                    <td className="p-4" data-label="Status">
                      <Badge variant={VARIANTE_STATUS[registro.statusConciliacao]}>
                        {registro.statusConciliacao}
                      </Badge>
                    </td>
                    {podeEditar && (
                      <td className="p-4" data-label="Ações">
                        <div className="flex justify-end">
                          {registro.statusConciliacao !== "CONCILIADO" && (
                            <AcaoResolverRegistro
                              registroId={registro.id}
                              statusAtual={registro.statusConciliacao}
                              alunos={alunosOpcao}
                              checkins={checkinsOpcao}
                            />
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
                {registrosDiarios.length === 0 && (
                  <tr>
                    <td
                      colSpan={podeEditar ? 8 : 7}
                      className="p-10 text-center text-muted-foreground"
                    >
                      Nenhum registro diário importado para este filtro.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Histórico de importações</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {importacoes.map((importacao) => (
            <div
              key={importacao.id}
              className="border-b border-border pb-3 last:border-0 last:pb-0"
            >
              <div className="flex items-center justify-between gap-3">
                <p className="font-medium">
                  {importacao.plataforma} · {importacao.arquivo}
                </p>
                <Badge variant="outline">{importacao._count.registros} registro(s)</Badge>
              </div>
              <p className="text-sm text-muted-foreground">
                Referência: {formatarCompetencia(importacao.competencia)} ·{" "}
                {importacao.unidadeExternaNome ??
                  importacao.unidadeExternaId ??
                  "Sem conta informada"}{" "}
                · {importacao.resumoMensal ? "Resumo financeiro mensal" : "Registros diários"}
              </p>
              <p className="text-sm text-muted-foreground">
                {formatarDataHora(importacao.criadoEm)} · {importacao.totalConciliados} conciliados
                · {importacao.totalDivergencias} divergência(s)
              </p>
            </div>
          ))}
          {importacoes.length === 0 && (
            <p className="text-sm text-muted-foreground">Nenhuma importação registrada.</p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function Resumo({ rotulo, valor }: { rotulo: string; valor: number }) {
  return (
    <Card>
      <CardContent className="py-5">
        <p className="text-xs text-muted-foreground">{rotulo}</p>
        <p className="mt-1 text-2xl font-bold tabular-nums">{valor}</p>
      </CardContent>
    </Card>
  )
}

function formatarCompetencia(competencia: string | null) {
  if (!competencia) return "Sem mês informado"
  const [ano, mes] = competencia.split("-")
  return `${mes}/${ano}`
}

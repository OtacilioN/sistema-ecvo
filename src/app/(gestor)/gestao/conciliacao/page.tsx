import { Badge, type BadgeProps } from "@/components/ui/badge"
import { CabecalhoPagina } from "@/components/ui/cabecalho-pagina"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { exigirGestao } from "@/lib/auth/dal"
import { db } from "@/lib/db"
import { formatarData, formatarDataHora } from "@/lib/utils/datas"
import { formatarBRL } from "@/lib/utils/formato"
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

export default async function Page() {
  const usuario = await exigirGestao()
  const podeEditar = usuario.papel === "GESTOR"
  const [importacoes, registros, alunos, checkins] = await Promise.all([
    db.importacao.findMany({
      orderBy: { criadoEm: "desc" },
      take: 10,
      include: { _count: { select: { registros: true } } },
    }),
    db.registroImportado.findMany({
      orderBy: { importacao: { criadoEm: "desc" } },
      take: 30,
      include: {
        importacao: { select: { plataforma: true, arquivo: true } },
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
      where: { tipo: { in: ["WELLHUB", "TOTALPASS"] } },
      orderBy: { usuario: { nome: "asc" } },
      select: { id: true, tipo: true, usuario: { select: { nome: true } }, idExterno: true },
    }),
    db.checkin.findMany({
      where: { aluno: { tipo: { in: ["WELLHUB", "TOTALPASS"] } } },
      orderBy: { criadoEm: "desc" },
      take: 80,
      include: {
        aluno: { select: { usuario: { select: { nome: true } } } },
        aula: {
          select: { inicio: true, turma: { select: { modalidade: { select: { nome: true } } } } },
        },
      },
    }),
  ])

  const alunosOpcao = alunos.map((aluno) => ({
    id: aluno.id,
    nome: aluno.usuario.nome,
    detalhe: `${aluno.tipo}${aluno.idExterno ? ` · ${aluno.idExterno}` : ""}`,
  }))
  const checkinsOpcao = checkins.map((checkin) => ({
    id: checkin.id,
    rotulo: `${checkin.aluno.usuario.nome} · ${checkin.aula.turma.modalidade.nome} · ${formatarDataHora(checkin.aula.inicio)} · ${checkin.status}`,
  }))

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
        descricao="Importação CSV/XLSX Wellhub/TotalPass, identificação de alunos e comparação com check-ins."
      >
        {podeEditar && <BotaoImportarConciliacao />}
      </CabecalhoPagina>

      <div className="grid gap-4 md:grid-cols-4">
        <Resumo rotulo="Linhas importadas" valor={totais.linhas} />
        <Resumo rotulo="Conciliadas" valor={totais.conciliados} />
        <Resumo rotulo="Não conciliadas" valor={totais.naoConciliados} />
        <Resumo rotulo="Divergências" valor={totais.divergencias} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Registros importados</CardTitle>
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
                {registros.map((registro) => (
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
                {registros.length === 0 && (
                  <tr>
                    <td
                      colSpan={podeEditar ? 8 : 7}
                      className="p-10 text-center text-muted-foreground"
                    >
                      Nenhum registro importado. Use “Importar planilha” para começar.
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

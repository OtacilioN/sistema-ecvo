import Link from "next/link"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { CabecalhoPagina } from "@/components/ui/cabecalho-pagina"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { exigirGestao } from "@/lib/auth/dal"
import { db } from "@/lib/db"
import {
  calcularRepasseFinanceiro,
  type ItemRepasseModalidade,
} from "@/lib/services/financeiro.service"
import { chaveCompetencia, formatarData } from "@/lib/utils/datas"
import { formatarBRL } from "@/lib/utils/formato"

export const dynamic = "force-dynamic"

type SearchParams = Promise<Record<string, string | string[] | undefined>>

type LinhaRepasse = {
  chave: string
  destinatarioId: string
  destinatario: string
  papel: "Professor" | "Sócio A" | "Sócio B" | "Pendência"
  origem: string
  valor: number
  eventos: number
}

type PendenciaRepasse = {
  chave: string
  origem: string
  referencia: string
  motivo: string
}

type LinhaProfessor = {
  professorId: string
  professorNome: string
  mensalidadeInterna: number
  plataformas: number
  total: number
  eventos: number
  origens: string[]
}

type LinhaExtratoRepasse = {
  chave: string
  origem: string
  status: string
  pagador: string
  data: Date | null
  formaPagamento: string | null
  valorRecebido: number
  professores: string
  repasseProfessores: number
  socioA: number
  socioB: number
}

function valorUnico(valor: string | string[] | undefined) {
  return Array.isArray(valor) ? valor[0] : valor
}

function competenciaValida(valor: string | undefined) {
  return valor && /^\d{4}-\d{2}$/.test(valor) ? valor : chaveCompetencia()
}

function intervaloCompetencia(competencia: string) {
  const inicio = new Date(`${competencia}-01T00:00:00-03:00`)
  const fim = new Date(inicio)
  fim.setMonth(fim.getMonth() + 1)
  return { inicio, fim }
}

export default async function Page({ searchParams }: { searchParams: SearchParams }) {
  await exigirGestao()
  const params = await searchParams
  const competencia = competenciaValida(valorUnico(params.competencia))
  const { inicio, fim } = intervaloCompetencia(competencia)

  const [configuracao, mensalidades, registrosExternos] = await Promise.all([
    db.configuracaoAcademia.upsert({
      where: { id: "default" },
      update: {},
      create: { id: "default" },
      select: { valorBaseModalidade: true },
    }),
    db.mensalidade.findMany({
      where: {
        competencia,
        status: { in: ["PAGA", "ISENTA"] },
      },
      include: {
        aluno: {
          select: {
            usuario: { select: { nome: true } },
            modalidadesPlano: {
              select: {
                plataformaExterna: true,
                modalidade: {
                  select: {
                    id: true,
                    nome: true,
                    turmas: {
                      where: { ativa: true, professorId: { not: null } },
                      orderBy: { criadoEm: "asc" },
                      select: {
                        professorId: true,
                        professor: { select: { usuario: { select: { nome: true } } } },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    }),
    db.registroImportado.findMany({
      where: {
        statusConciliacao: "CONCILIADO",
        valorRepasse: { not: null },
        dataReferencia: { gte: inicio, lt: fim },
      },
      include: {
        importacao: { select: { plataforma: true } },
        aluno: { select: { usuario: { select: { nome: true } } } },
        checkinVinculado: {
          select: {
            aula: {
              select: {
                professorId: true,
                professor: { select: { usuario: { select: { nome: true } } } },
                turma: {
                  select: {
                    modalidade: { select: { id: true, nome: true } },
                    professorId: true,
                    professor: { select: { usuario: { select: { nome: true } } } },
                  },
                },
              },
            },
          },
        },
      },
    }),
  ])

  const valorBaseModalidade = Number(configuracao.valorBaseModalidade)
  const linhas = new Map<string, LinhaRepasse>()
  const pendencias: PendenciaRepasse[] = []
  let totalRecebido = 0
  let totalProfessores = 0
  let totalSocioA = 0
  let totalSocioB = 0
  const extrato: LinhaExtratoRepasse[] = []

  function somarLinha(params: Omit<LinhaRepasse, "chave" | "eventos">) {
    const chave = `${params.papel}:${params.destinatarioId}:${params.origem}`
    const atual =
      linhas.get(chave) ??
      ({
        chave,
        destinatarioId: params.destinatarioId,
        destinatario: params.destinatario,
        papel: params.papel,
        origem: params.origem,
        valor: 0,
        eventos: 0,
      } satisfies LinhaRepasse)
    atual.valor += params.valor
    atual.eventos += 1
    linhas.set(chave, atual)
  }

  for (const mensalidade of mensalidades) {
    const valorRecebido = mensalidade.status === "PAGA" ? Number(mensalidade.valor) : 0
    const itens = mensalidade.aluno.modalidadesPlano
      .filter(({ plataformaExterna }) => !plataformaExterna)
      .map(({ modalidade }) => itemModalidadeMensalidade(modalidade, pendencias))
    if (itens.length === 0) {
      pendencias.push({
        chave: `mensalidade:${mensalidade.id}`,
        origem: "Mensalidade interna",
        referencia: mensalidade.aluno.usuario.nome,
        motivo: "Mensalidade de aluno sem modalidade contratada no vínculo do plano.",
      })
      continue
    }
    const repasse = calcularRepasseFinanceiro({
      valorRecebido,
      itens,
      politica: "MENSALIDADE_INTERNA",
      configuracao: { valorBaseModalidade },
    })
    totalRecebido += repasse.valorRecebido
    totalProfessores += repasse.professores.reduce((total, professor) => total + professor.valor, 0)
    totalSocioA += repasse.socioA
    totalSocioB += repasse.socioB
    extrato.push({
      chave: `mensalidade:${mensalidade.id}`,
      origem: "Mensalidade interna",
      status: mensalidade.status === "PAGA" ? "Paga" : "Isenta",
      pagador: mensalidade.aluno.usuario.nome,
      data: mensalidade.pagoEm ?? mensalidade.atualizadoEm,
      formaPagamento: mensalidade.formaPagamento,
      valorRecebido: repasse.valorRecebido,
      professores: nomesProfessoresRepasse(repasse.professores),
      repasseProfessores: repasse.professores.reduce(
        (total, professor) => total + professor.valor,
        0,
      ),
      socioA: repasse.socioA,
      socioB: repasse.socioB,
    })

    for (const professor of repasse.professores) {
      somarLinha({
        destinatarioId: professor.professorId,
        destinatario: professor.professorNome ?? professor.professorId,
        papel: professor.professorId.startsWith("pendencia:") ? "Pendência" : "Professor",
        origem: "Mensalidade interna",
        valor: professor.valor,
      })
    }
    somarLinha({
      destinatarioId: "socio-a",
      destinatario: "Sócio A",
      papel: "Sócio A",
      origem: "Mensalidade interna",
      valor: repasse.socioA,
    })
    somarLinha({
      destinatarioId: "socio-b",
      destinatario: "Sócio B",
      papel: "Sócio B",
      origem: "Mensalidade interna",
      valor: repasse.socioB,
    })
  }

  for (const registro of registrosExternos) {
    const aula = registro.checkinVinculado?.aula
    const professorId = aula?.professorId ?? aula?.turma.professorId ?? null
    const professorNome =
      aula?.professor?.usuario.nome ??
      aula?.turma.professor?.usuario.nome ??
      "Sem professor definido"
    const modalidade = aula?.turma.modalidade
    const origem = registro.importacao.plataforma
    const item: ItemRepasseModalidade = {
      professorId: professorId ?? `pendencia:externo:${registro.id}`,
      professorNome,
      modalidadeId: modalidade?.id ?? null,
      modalidadeNome: modalidade?.nome ?? null,
    }
    if (!professorId) {
      pendencias.push({
        chave: `externo:${registro.id}`,
        origem,
        referencia: registro.aluno?.usuario.nome ?? registro.nome ?? registro.email ?? registro.id,
        motivo: "Check-in conciliado sem professor efetivo ou professor da turma.",
      })
    }

    const repasse = calcularRepasseFinanceiro({
      valorRecebido: Number(registro.valorRepasse),
      itens: [item],
      politica: "REPASSE_EXTERNO",
      configuracao: { valorBaseModalidade },
    })
    totalRecebido += repasse.valorRecebido
    totalProfessores += repasse.professores.reduce((total, professor) => total + professor.valor, 0)
    totalSocioA += repasse.socioA
    totalSocioB += repasse.socioB
    extrato.push({
      chave: `externo:${registro.id}`,
      origem,
      status: "Conciliado",
      pagador: registro.aluno?.usuario.nome ?? registro.nome ?? registro.email ?? "Sem aluno",
      data: registro.dataReferencia,
      formaPagamento: origem,
      valorRecebido: repasse.valorRecebido,
      professores: nomesProfessoresRepasse(repasse.professores),
      repasseProfessores: repasse.professores.reduce(
        (total, professor) => total + professor.valor,
        0,
      ),
      socioA: repasse.socioA,
      socioB: repasse.socioB,
    })

    for (const professor of repasse.professores) {
      somarLinha({
        destinatarioId: professor.professorId,
        destinatario: professor.professorNome ?? professor.professorId,
        papel: professor.professorId.startsWith("pendencia:") ? "Pendência" : "Professor",
        origem,
        valor: professor.valor,
      })
    }
    somarLinha({
      destinatarioId: "socio-a",
      destinatario: "Sócio A",
      papel: "Sócio A",
      origem,
      valor: repasse.socioA,
    })
    somarLinha({
      destinatarioId: "socio-b",
      destinatario: "Sócio B",
      papel: "Sócio B",
      origem,
      valor: repasse.socioB,
    })
  }

  const linhasOrdenadas = Array.from(linhas.values()).sort(
    (a, b) => ordemPapel(a.papel) - ordemPapel(b.papel) || b.valor - a.valor,
  )
  const extratoOrdenado = extrato.sort(
    (a, b) =>
      (b.data?.getTime() ?? 0) - (a.data?.getTime() ?? 0) || a.pagador.localeCompare(b.pagador),
  )
  const professoresOrdenados = consolidarProfessores(linhasOrdenadas)
  const valorPendenteProfessor = linhasOrdenadas
    .filter((linha) => linha.papel === "Pendência")
    .reduce((total, linha) => total + linha.valor, 0)

  return (
    <div className="space-y-6">
      <CabecalhoPagina
        titulo="Repasses"
        descricao="Divisão por professor, sócio A e sócio B nas mensalidades e plataformas."
      >
        <Button asChild variant="outline">
          <Link href="/gestao/financeiro">Voltar ao financeiro</Link>
        </Button>
      </CabecalhoPagina>

      <Card>
        <CardContent className="py-4">
          <form className="grid gap-3 sm:grid-cols-[1fr_auto_auto] sm:items-end">
            <div className="grid gap-2">
              <Label htmlFor="competencia">Competência</Label>
              <Input id="competencia" type="month" name="competencia" defaultValue={competencia} />
            </div>
            <Button type="submit">Filtrar</Button>
            <Button asChild variant="outline">
              <Link href="/gestao/financeiro/repasses">Atual</Link>
            </Button>
          </form>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-5">
        <Resumo rotulo="Recebido" valor={formatarBRL(totalRecebido)} />
        <Resumo rotulo="Professores" valor={formatarBRL(totalProfessores)} />
        <Resumo rotulo="Sócio A" valor={formatarBRL(totalSocioA)} />
        <Resumo rotulo="Sócio B" valor={formatarBRL(totalSocioB)} />
        <Resumo rotulo="Pendências" valor={formatarBRL(valorPendenteProfessor)} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Repasse individual por professor</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="tabela-responsiva w-full text-sm">
              <thead className="border-b border-border text-left text-muted-foreground">
                <tr>
                  <th className="p-4 font-medium">Professor</th>
                  <th className="p-4 font-medium">Origens</th>
                  <th className="p-4 font-medium">Eventos</th>
                  <th className="p-4 text-right font-medium">Mensalidade interna</th>
                  <th className="p-4 text-right font-medium">Plataformas</th>
                  <th className="p-4 text-right font-medium">Total</th>
                </tr>
              </thead>
              <tbody>
                {professoresOrdenados.map((professor) => (
                  <tr key={professor.professorId} className="border-b border-border last:border-0">
                    <td className="p-4 font-medium" data-label="Professor">
                      {professor.professorNome}
                    </td>
                    <td className="p-4" data-label="Origens">
                      {professor.origens.join(", ")}
                    </td>
                    <td className="p-4 tabular-nums" data-label="Eventos">
                      {professor.eventos}
                    </td>
                    <td className="p-4 text-right tabular-nums" data-label="Mensalidade interna">
                      {formatarBRL(professor.mensalidadeInterna)}
                    </td>
                    <td className="p-4 text-right tabular-nums" data-label="Plataformas">
                      {formatarBRL(professor.plataformas)}
                    </td>
                    <td className="p-4 text-right font-semibold tabular-nums" data-label="Total">
                      {formatarBRL(professor.total)}
                    </td>
                  </tr>
                ))}
                {professoresOrdenados.length === 0 && (
                  <tr>
                    <td colSpan={6} className="p-10 text-center text-muted-foreground">
                      Nenhum professor com repasse na competência.
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
          <CardTitle>Repasses por destinatário</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="tabela-responsiva w-full text-sm">
              <thead className="border-b border-border text-left text-muted-foreground">
                <tr>
                  <th className="p-4 font-medium">Destinatário</th>
                  <th className="p-4 font-medium">Papel</th>
                  <th className="p-4 font-medium">Origem</th>
                  <th className="p-4 font-medium">Eventos</th>
                  <th className="p-4 text-right font-medium">Valor</th>
                </tr>
              </thead>
              <tbody>
                {linhasOrdenadas.map((linha) => (
                  <tr key={linha.chave} className="border-b border-border last:border-0">
                    <td className="p-4 font-medium" data-label="Destinatário">
                      {linha.destinatario}
                    </td>
                    <td className="p-4" data-label="Papel">
                      <Badge variant={linha.papel === "Pendência" ? "warning" : "outline"}>
                        {linha.papel}
                      </Badge>
                    </td>
                    <td className="p-4" data-label="Origem">
                      {linha.origem}
                    </td>
                    <td className="p-4 tabular-nums" data-label="Eventos">
                      {linha.eventos}
                    </td>
                    <td className="p-4 text-right tabular-nums" data-label="Valor">
                      {formatarBRL(linha.valor)}
                    </td>
                  </tr>
                ))}
                {linhasOrdenadas.length === 0 && (
                  <tr>
                    <td colSpan={5} className="p-10 text-center text-muted-foreground">
                      Nenhum repasse na competência.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {pendencias.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Pendências de professor</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {pendencias.map((pendencia) => (
              <div
                key={pendencia.chave}
                className="border-b border-border pb-3 last:border-0 last:pb-0"
              >
                <div className="flex items-center justify-between gap-3">
                  <p className="font-medium">{pendencia.referencia}</p>
                  <Badge variant="warning">{pendencia.origem}</Badge>
                </div>
                <p className="text-sm text-muted-foreground">{pendencia.motivo}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Receitas usadas no repasse</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="tabela-responsiva w-full text-sm">
              <thead className="border-b border-border text-left text-muted-foreground">
                <tr>
                  <th className="p-4 font-medium">Pagador</th>
                  <th className="p-4 font-medium">Origem</th>
                  <th className="p-4 font-medium">Status</th>
                  <th className="p-4 font-medium">Data</th>
                  <th className="p-4 font-medium">Forma</th>
                  <th className="p-4 font-medium">Professores</th>
                  <th className="p-4 text-right font-medium">Recebido</th>
                  <th className="p-4 text-right font-medium">Professor</th>
                  <th className="p-4 text-right font-medium">Sócio A</th>
                  <th className="p-4 text-right font-medium">Sócio B</th>
                </tr>
              </thead>
              <tbody>
                {extratoOrdenado.map((linha) => (
                  <tr key={linha.chave} className="border-b border-border last:border-0">
                    <td className="p-4 font-medium" data-label="Pagador">
                      {linha.pagador}
                    </td>
                    <td className="p-4" data-label="Origem">
                      {linha.origem}
                    </td>
                    <td className="p-4" data-label="Status">
                      <Badge variant={linha.status === "Isenta" ? "secondary" : "outline"}>
                        {linha.status}
                      </Badge>
                    </td>
                    <td className="p-4" data-label="Data">
                      {linha.data ? formatarData(linha.data) : "—"}
                    </td>
                    <td className="p-4" data-label="Forma">
                      {linha.formaPagamento ?? "—"}
                    </td>
                    <td className="p-4" data-label="Professores">
                      {linha.professores}
                    </td>
                    <td className="p-4 text-right tabular-nums" data-label="Recebido">
                      {formatarBRL(linha.valorRecebido)}
                    </td>
                    <td className="p-4 text-right tabular-nums" data-label="Professor">
                      {formatarBRL(linha.repasseProfessores)}
                    </td>
                    <td className="p-4 text-right tabular-nums" data-label="Sócio A">
                      {formatarBRL(linha.socioA)}
                    </td>
                    <td className="p-4 text-right tabular-nums" data-label="Sócio B">
                      {formatarBRL(linha.socioB)}
                    </td>
                  </tr>
                ))}
                {extratoOrdenado.length === 0 && (
                  <tr>
                    <td colSpan={10} className="p-10 text-center text-muted-foreground">
                      Nenhuma receita encontrada na competência.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

function itemModalidadeMensalidade(
  modalidade: {
    id: string
    nome: string
    turmas: Array<{
      professorId: string | null
      professor: { usuario: { nome: string } } | null
    }>
  },
  pendencias: PendenciaRepasse[],
): ItemRepasseModalidade {
  const professores = new Map<string, string>()
  for (const turma of modalidade.turmas) {
    if (turma.professorId) {
      professores.set(turma.professorId, turma.professor?.usuario.nome ?? "Professor")
    }
  }

  if (professores.size === 1) {
    const [professorId, professorNome] = Array.from(professores.entries())[0]
    return {
      professorId,
      professorNome,
      modalidadeId: modalidade.id,
      modalidadeNome: modalidade.nome,
    }
  }

  pendencias.push({
    chave: `modalidade:${modalidade.id}`,
    origem: "Mensalidade interna",
    referencia: modalidade.nome,
    motivo:
      professores.size === 0
        ? "Modalidade sem turma ativa com professor."
        : "Modalidade com mais de um professor ativo; defina um critério de repasse.",
  })
  return {
    professorId: `pendencia:modalidade:${modalidade.id}`,
    professorNome: professores.size === 0 ? "Sem professor definido" : "Mais de um professor ativo",
    modalidadeId: modalidade.id,
    modalidadeNome: modalidade.nome,
  }
}

function ordemPapel(papel: LinhaRepasse["papel"]) {
  const ordem: Record<LinhaRepasse["papel"], number> = {
    Professor: 0,
    "Sócio A": 1,
    "Sócio B": 2,
    Pendência: 3,
  }
  return ordem[papel]
}

function nomesProfessoresRepasse(
  professores: Array<{ professorNome: string | null; professorId: string }>,
) {
  const nomes = professores.map((professor) => professor.professorNome ?? professor.professorId)
  return nomes.length > 0 ? nomes.join(", ") : "Sem repasse para professor"
}

function consolidarProfessores(linhas: LinhaRepasse[]): LinhaProfessor[] {
  const professores = new Map<string, LinhaProfessor & { origensSet: Set<string> }>()
  for (const linha of linhas) {
    if (linha.papel !== "Professor") continue
    const atual =
      professores.get(linha.destinatarioId) ??
      ({
        professorId: linha.destinatarioId,
        professorNome: linha.destinatario,
        mensalidadeInterna: 0,
        plataformas: 0,
        total: 0,
        eventos: 0,
        origens: [],
        origensSet: new Set<string>(),
      } satisfies LinhaProfessor & { origensSet: Set<string> })

    if (linha.origem === "Mensalidade interna") {
      atual.mensalidadeInterna += linha.valor
    } else {
      atual.plataformas += linha.valor
    }
    atual.total += linha.valor
    atual.eventos += linha.eventos
    atual.origensSet.add(linha.origem)
    professores.set(linha.destinatarioId, atual)
  }

  return Array.from(professores.values())
    .map(({ origensSet, ...professor }) => ({
      ...professor,
      origens: Array.from(origensSet).sort(),
    }))
    .sort((a, b) => b.total - a.total || a.professorNome.localeCompare(b.professorNome))
}

function Resumo({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <Card>
      <CardContent className="py-5">
        <p className="text-xs text-muted-foreground">{rotulo}</p>
        <p className="mt-1 text-xl font-bold tabular-nums">{valor}</p>
      </CardContent>
    </Card>
  )
}

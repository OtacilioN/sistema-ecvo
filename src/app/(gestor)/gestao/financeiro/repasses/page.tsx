import type { Prisma, StatusSplitPagamentoAsaas } from "@prisma/client"
import { CircleCheckBig, Clock3, HandCoins } from "lucide-react"
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
  calcularComposicaoRepasseProfessor,
  calcularDistribuicaoSobraFinanceira,
  calcularRepasseFinanceiro,
  type ItemRepasseMensalidadeSnapshot,
  type ItemRepasseModalidade,
  lerRepasseSnapshotMensalidade,
} from "@/lib/services/financeiro.service"
import { cn } from "@/lib/utils"
import { chaveCompetencia, formatarData } from "@/lib/utils/datas"
import { formatarBRL } from "@/lib/utils/formato"

export const dynamic = "force-dynamic"

type SearchParams = Promise<Record<string, string | string[] | undefined>>

type LinhaRepasse = {
  chave: string
  destinatarioId: string
  destinatario: string
  papel: "Professor" | "Caixa/investimento" | "Sócio A" | "Sócio B" | "Pendência"
  origem: string
  valor: number
  eventos: number
  splitConcluido: number
  splitEmProcessamento: number
  repasseManual: number
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
  splitConcluido: number
  splitEmProcessamento: number
  repasseManual: number
}

type LinhaExtratoRepasse = {
  chave: string
  origem: string
  status: string
  competencia: string | null
  pagador: string
  data: Date | null
  formaPagamento: string | null
  valorRecebido: number
  professores: string
  repasseProfessores: number
  splitConcluido: number
  splitEmProcessamento: number
  repasseManual: number
  detalheRepasse: string
  sobraAposProfessores: number
}

type SplitRepasse = {
  valorFixoSnapshot: Prisma.Decimal
  status: StatusSplitPagamentoAsaas
  motivo: string | null
  contaAsaasProfessor: { professorId: string }
}

function valorUnico(valor: string | string[] | undefined) {
  return Array.isArray(valor) ? valor[0] : valor
}

function mesRepasseValido(valor: string | undefined) {
  return valor && /^\d{4}-\d{2}$/.test(valor) ? valor : chaveCompetencia()
}

function intervaloMesRepasse(mesRepasse: string) {
  const inicio = new Date(`${mesRepasse}-01T00:00:00-03:00`)
  const fim = new Date(inicio)
  fim.setMonth(fim.getMonth() + 1)
  return { inicio, fim }
}

export default async function Page({ searchParams }: { searchParams: SearchParams }) {
  await exigirGestao()
  const params = await searchParams
  const mesRepasse = mesRepasseValido(valorUnico(params.competencia))
  const { inicio, fim } = intervaloMesRepasse(mesRepasse)

  const [mensalidades, registrosExternos] = await Promise.all([
    db.mensalidade.findMany({
      where: {
        status: "PAGA",
        pagoEm: { gte: inicio, lt: fim },
      },
      include: {
        cobrancaQuitacaoAsaas: {
          select: {
            splits: {
              select: {
                valorFixoSnapshot: true,
                status: true,
                motivo: true,
                contaAsaasProfessor: { select: { professorId: true } },
              },
            },
          },
        },
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
                    valorRepasseProfessor: true,
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

  const linhas = new Map<string, LinhaRepasse>()
  const pendencias: PendenciaRepasse[] = []
  let totalRecebido = 0
  let totalProfessores = 0
  const extrato: LinhaExtratoRepasse[] = []

  function somarLinha(
    params: Omit<
      LinhaRepasse,
      "chave" | "eventos" | "splitConcluido" | "splitEmProcessamento" | "repasseManual"
    > &
      Partial<Pick<LinhaRepasse, "splitConcluido" | "splitEmProcessamento" | "repasseManual">>,
  ) {
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
        splitConcluido: 0,
        splitEmProcessamento: 0,
        repasseManual: 0,
      } satisfies LinhaRepasse)
    atual.valor += params.valor
    atual.eventos += 1
    atual.splitConcluido += params.splitConcluido ?? 0
    atual.splitEmProcessamento += params.splitEmProcessamento ?? 0
    atual.repasseManual += params.repasseManual ?? 0
    linhas.set(chave, atual)
  }

  for (const mensalidade of mensalidades) {
    const splits = mensalidade.cobrancaQuitacaoAsaas?.splits ?? []
    const valorRecebido = mensalidade.status === "PAGA" ? Number(mensalidade.valor) : 0
    const snapshot = lerRepasseSnapshotMensalidade(mensalidade.repasseSnapshot)
    const itens =
      snapshot.length > 0
        ? snapshot
            .filter(({ plataformaExterna }) => !plataformaExterna)
            .map((item, index) => itemModalidadeSnapshot(mensalidade.id, item, index, pendencias))
        : mensalidade.aluno.modalidadesPlano
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
    })
    const repasseProfessores = repasse.professores.reduce(
      (total, professor) => total + professor.valor,
      0,
    )
    const composicaoPorProfessor = new Map<
      string,
      ReturnType<typeof calcularComposicaoRepasseProfessor>
    >()
    for (const professor of repasse.professores) {
      if (professor.professorId.startsWith("pendencia:")) continue
      composicaoPorProfessor.set(
        professor.professorId,
        calcularComposicaoRepasseProfessor({
          direitoTotal: professor.valor,
          splits: splits
            .filter((split) => split.contaAsaasProfessor.professorId === professor.professorId)
            .map((split) => ({ valor: Number(split.valorFixoSnapshot), status: split.status })),
        }),
      )
    }
    const splitConcluido = somarComposicao(
      composicaoPorProfessor,
      (composicao) => composicao.splitConcluido,
    )
    const splitEmProcessamento = somarComposicao(
      composicaoPorProfessor,
      (composicao) => composicao.splitEmProcessamento,
    )
    const repasseManual = somarComposicao(
      composicaoPorProfessor,
      (composicao) => composicao.repasseManual,
    )
    totalRecebido += repasse.valorRecebido
    totalProfessores += repasseProfessores
    extrato.push({
      chave: `mensalidade:${mensalidade.id}`,
      origem: "Mensalidade interna",
      status: mensalidade.status === "PAGA" ? "Paga" : "Isenta",
      competencia: mensalidade.competencia,
      pagador: mensalidade.aluno.usuario.nome,
      data: mensalidade.pagoEm ?? mensalidade.atualizadoEm,
      formaPagamento: mensalidade.formaPagamento,
      valorRecebido: repasse.valorRecebido,
      professores: nomesProfessoresRepasse(repasse.professores),
      repasseProfessores,
      splitConcluido,
      splitEmProcessamento,
      repasseManual,
      detalheRepasse: detalheRepasseMensalidade({
        formaPagamento: mensalidade.formaPagamento,
        splits,
        splitConcluido,
        splitEmProcessamento,
        repasseManual,
      }),
      sobraAposProfessores: repasse.sobraAposProfessores,
    })

    for (const professor of repasse.professores) {
      const composicao = composicaoPorProfessor.get(professor.professorId)
      somarLinha({
        destinatarioId: professor.professorId,
        destinatario: professor.professorNome ?? professor.professorId,
        papel: professor.professorId.startsWith("pendencia:") ? "Pendência" : "Professor",
        origem: "Mensalidade interna",
        valor: professor.valor,
        splitConcluido: composicao?.splitConcluido,
        splitEmProcessamento: composicao?.splitEmProcessamento,
        repasseManual: composicao?.repasseManual,
      })
    }
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
    })
    const repasseProfessores = repasse.professores.reduce(
      (total, professor) => total + professor.valor,
      0,
    )
    const repasseManual = professorId ? repasseProfessores : 0
    totalRecebido += repasse.valorRecebido
    totalProfessores += repasseProfessores
    extrato.push({
      chave: `externo:${registro.id}`,
      origem,
      status: "Conciliado",
      competencia: null,
      pagador: registro.aluno?.usuario.nome ?? registro.nome ?? registro.email ?? "Sem aluno",
      data: registro.dataReferencia,
      formaPagamento: origem,
      valorRecebido: repasse.valorRecebido,
      professores: nomesProfessoresRepasse(repasse.professores),
      repasseProfessores,
      splitConcluido: 0,
      splitEmProcessamento: 0,
      repasseManual,
      detalheRepasse: professorId
        ? `${rotuloPlataforma(origem)} não utiliza split automático; o repasse é manual.`
        : `${rotuloPlataforma(origem)} sem professor definido; resolva a pendência antes do repasse manual.`,
      sobraAposProfessores: repasse.sobraAposProfessores,
    })

    for (const professor of repasse.professores) {
      somarLinha({
        destinatarioId: professor.professorId,
        destinatario: professor.professorNome ?? professor.professorId,
        papel: professor.professorId.startsWith("pendencia:") ? "Pendência" : "Professor",
        origem,
        valor: professor.valor,
        repasseManual: professor.professorId.startsWith("pendencia:") ? 0 : professor.valor,
      })
    }
  }

  const distribuicaoSobra = calcularDistribuicaoSobraFinanceira({
    totalRecebido,
    totalProfessores,
  })
  const eventosDaSobra = extrato.length
  const origemSobra = "Resultado mensal após custos fixos"
  for (const destinatario of [
    {
      id: "caixa-investimento",
      nome: "Caixa/investimento",
      papel: "Caixa/investimento" as const,
      valor: distribuicaoSobra.caixaInvestimento,
    },
    {
      id: "socio-a",
      nome: "Sócio A",
      papel: "Sócio A" as const,
      valor: distribuicaoSobra.socioA,
    },
    {
      id: "socio-b",
      nome: "Sócio B",
      papel: "Sócio B" as const,
      valor: distribuicaoSobra.socioB,
    },
  ]) {
    const chave = `${destinatario.papel}:${destinatario.id}:${origemSobra}`
    linhas.set(chave, {
      chave,
      destinatarioId: destinatario.id,
      destinatario: destinatario.nome,
      papel: destinatario.papel,
      origem: origemSobra,
      valor: destinatario.valor,
      eventos: eventosDaSobra,
      splitConcluido: 0,
      splitEmProcessamento: 0,
      repasseManual: 0,
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
  const totalDireitoIdentificado = professoresOrdenados.reduce(
    (total, professor) => total + professor.total,
    0,
  )
  const totalSplitConcluido = professoresOrdenados.reduce(
    (total, professor) => total + professor.splitConcluido,
    0,
  )
  const totalSplitEmProcessamento = professoresOrdenados.reduce(
    (total, professor) => total + professor.splitEmProcessamento,
    0,
  )
  const totalRepasseManual = professoresOrdenados.reduce(
    (total, professor) => total + professor.repasseManual,
    0,
  )

  return (
    <div className="space-y-6">
      <CabecalhoPagina
        titulo="Repasses"
        descricao="Repasses dos professores, custos fixos e divisão mensal da sobra em três partes iguais."
      >
        <Button asChild variant="outline">
          <Link href="/gestao/financeiro">Voltar ao financeiro</Link>
        </Button>
      </CabecalhoPagina>

      <Card>
        <CardContent className="py-4">
          <form className="grid gap-3 sm:grid-cols-[1fr_auto_auto] sm:items-end">
            <div className="grid gap-2">
              <Label htmlFor="competencia">Mês do repasse</Label>
              <Input id="competencia" type="month" name="competencia" defaultValue={mesRepasse} />
            </div>
            <Button type="submit">Filtrar</Button>
            <Button asChild variant="outline">
              <Link href="/gestao/financeiro/repasses">Atual</Link>
            </Button>
          </form>
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Resumo rotulo="Recebido" valor={formatarBRL(totalRecebido)} />
        <Resumo
          rotulo="Direito identificado dos professores"
          valor={formatarBRL(totalDireitoIdentificado)}
        />
        <Resumo
          rotulo="Já repassado por split automático"
          valor={formatarBRL(totalSplitConcluido)}
          icone={<CircleCheckBig className="size-4" />}
          tom="automatico"
        />
        <Resumo
          rotulo="Split automático em processamento"
          valor={formatarBRL(totalSplitEmProcessamento)}
          icone={<Clock3 className="size-4" />}
          tom="processamento"
        />
        <Resumo
          rotulo="A repassar manualmente"
          valor={formatarBRL(totalRepasseManual)}
          icone={<HandCoins className="size-4" />}
          tom="manual"
        />
        <Resumo
          rotulo="Pendências sem professor definido"
          valor={formatarBRL(valorPendenteProfessor)}
        />
        <Resumo
          rotulo="Sobra após professores"
          valor={formatarBRL(distribuicaoSobra.sobraAposProfessores)}
        />
        <Resumo rotulo="Custos fixos" valor={formatarBRL(distribuicaoSobra.custosFixos)} />
        <Resumo
          rotulo="Saldo após custos fixos"
          valor={formatarBRL(distribuicaoSobra.saldoAposCustosFixos)}
          tom={distribuicaoSobra.saldoAposCustosFixos < 0 ? "negativo" : "positivo"}
        />
        <Resumo
          rotulo="Caixa/investimento"
          valor={formatarBRL(distribuicaoSobra.caixaInvestimento)}
        />
        <Resumo rotulo="Sócio A" valor={formatarBRL(distribuicaoSobra.socioA)} />
        <Resumo rotulo="Sócio B" valor={formatarBRL(distribuicaoSobra.socioB)} />
      </div>

      <div className="rounded-lg border border-border bg-muted/30 px-4 py-3 text-sm">
        <p className="font-medium">Como os valores dos professores são classificados</p>
        <p className="mt-1 text-muted-foreground">
          Direito total = split concluído + split em processamento + repasse manual. O manual inclui
          falhas, bloqueios, recusas e estornos do split, contas sem split habilitado, baixas
          manuais e recebimentos de Wellhub/Gympass ou TotalPass. Valores em processamento ficam
          separados para evitar pagamento duplicado. Em split bloqueado, confirme no Asaas que ele
          não será retomado antes de executar o repasse manual.
        </p>
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
                  <th className="p-4 text-right font-medium">Direito total</th>
                  <th className="p-4 text-right font-medium text-emerald-700">Já por split</th>
                  <th className="p-4 text-right font-medium text-amber-700">Em processamento</th>
                  <th className="p-4 text-right font-medium text-sky-700">Repasse manual</th>
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
                    <td
                      className="p-4 text-right font-semibold text-emerald-700 tabular-nums"
                      data-label="Já repassado por split"
                    >
                      {formatarBRL(professor.splitConcluido)}
                    </td>
                    <td
                      className="p-4 text-right text-amber-700 tabular-nums"
                      data-label="Split em processamento"
                    >
                      {formatarBRL(professor.splitEmProcessamento)}
                    </td>
                    <td
                      className="p-4 text-right font-semibold text-sky-700 tabular-nums"
                      data-label="Repasse manual"
                    >
                      {formatarBRL(professor.repasseManual)}
                    </td>
                  </tr>
                ))}
                {professoresOrdenados.length === 0 && (
                  <tr>
                    <td colSpan={9} className="p-10 text-center text-muted-foreground">
                      Nenhum professor com repasse no mês selecionado.
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
                      Nenhum repasse no mês selecionado.
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
                  <th className="p-4 font-medium">Competência</th>
                  <th className="p-4 font-medium">Data</th>
                  <th className="p-4 font-medium">Forma</th>
                  <th className="p-4 font-medium">Situação do repasse</th>
                  <th className="p-4 font-medium">Professores</th>
                  <th className="p-4 text-right font-medium">Recebido</th>
                  <th className="p-4 text-right font-medium">Direito professor</th>
                  <th className="p-4 text-right font-medium text-emerald-700">Split concluído</th>
                  <th className="p-4 text-right font-medium text-amber-700">Em processamento</th>
                  <th className="p-4 text-right font-medium text-sky-700">Manual</th>
                  <th className="p-4 text-right font-medium">Sobra após professor</th>
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
                    <td className="p-4" data-label="Competência">
                      {linha.competencia ?? "—"}
                    </td>
                    <td className="p-4" data-label="Data">
                      {linha.data ? formatarData(linha.data) : "—"}
                    </td>
                    <td className="p-4" data-label="Forma">
                      {linha.formaPagamento ?? "—"}
                    </td>
                    <td className="min-w-64 p-4 text-muted-foreground" data-label="Situação">
                      {linha.detalheRepasse}
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
                    <td
                      className="p-4 text-right font-medium text-emerald-700 tabular-nums"
                      data-label="Split concluído"
                    >
                      {formatarBRL(linha.splitConcluido)}
                    </td>
                    <td
                      className="p-4 text-right text-amber-700 tabular-nums"
                      data-label="Em processamento"
                    >
                      {formatarBRL(linha.splitEmProcessamento)}
                    </td>
                    <td
                      className="p-4 text-right font-medium text-sky-700 tabular-nums"
                      data-label="Repasse manual"
                    >
                      {formatarBRL(linha.repasseManual)}
                    </td>
                    <td className="p-4 text-right tabular-nums" data-label="Sobra após professor">
                      {formatarBRL(linha.sobraAposProfessores)}
                    </td>
                  </tr>
                ))}
                {extratoOrdenado.length === 0 && (
                  <tr>
                    <td colSpan={14} className="p-10 text-center text-muted-foreground">
                      Nenhuma receita encontrada no mês selecionado.
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
    valorRepasseProfessor: Prisma.Decimal
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
      valorRepasseProfessor: Number(modalidade.valorRepasseProfessor),
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

function itemModalidadeSnapshot(
  mensalidadeId: string,
  item: ItemRepasseMensalidadeSnapshot,
  index: number,
  pendencias: PendenciaRepasse[],
): ItemRepasseModalidade {
  if (item.professorId) {
    return {
      professorId: item.professorId,
      professorNome: item.professorNome,
      modalidadeId: item.modalidadeId,
      modalidadeNome: item.modalidadeNome,
      valorBase: item.valorBase,
      valorRepasseProfessor: item.valorRepasseProfessor,
    }
  }

  pendencias.push({
    chave: `mensalidade:${mensalidadeId}:snapshot:${item.modalidadeId ?? index}`,
    origem: "Mensalidade interna",
    referencia: item.modalidadeNome ?? "Modalidade sem nome",
    motivo: item.professorNome ?? "Snapshot de mensalidade sem professor definido.",
  })
  return {
    professorId: `pendencia:mensalidade:${mensalidadeId}:${item.modalidadeId ?? index}`,
    professorNome: item.professorNome ?? "Sem professor definido",
    modalidadeId: item.modalidadeId,
    modalidadeNome: item.modalidadeNome,
    valorBase: item.valorBase,
    valorRepasseProfessor: item.valorRepasseProfessor,
  }
}

function ordemPapel(papel: LinhaRepasse["papel"]) {
  const ordem: Record<LinhaRepasse["papel"], number> = {
    Professor: 0,
    "Caixa/investimento": 1,
    "Sócio A": 2,
    "Sócio B": 3,
    Pendência: 4,
  }
  return ordem[papel]
}

function nomesProfessoresRepasse(
  professores: Array<{ professorNome: string | null; professorId: string }>,
) {
  const nomes = professores.map((professor) => professor.professorNome ?? professor.professorId)
  return nomes.length > 0 ? nomes.join(", ") : "Sem repasse para professor"
}

function somarComposicao(
  composicoes: Map<string, ReturnType<typeof calcularComposicaoRepasseProfessor>>,
  selecionar: (composicao: ReturnType<typeof calcularComposicaoRepasseProfessor>) => number,
) {
  return Array.from(composicoes.values()).reduce(
    (total, composicao) => total + selecionar(composicao),
    0,
  )
}

const ROTULO_STATUS_SPLIT_MANUAL: Partial<Record<StatusSplitPagamentoAsaas, string>> = {
  BLOQUEADO: "bloqueado",
  CANCELADO: "cancelado",
  RECUSADO: "recusado",
  ESTORNADO: "estornado",
  ERRO: "com erro",
}

function detalheRepasseMensalidade(params: {
  formaPagamento: string | null
  splits: SplitRepasse[]
  splitConcluido: number
  splitEmProcessamento: number
  repasseManual: number
}) {
  const splitsSemCredito = params.splits.filter((split) => ROTULO_STATUS_SPLIT_MANUAL[split.status])
  if (params.repasseManual > 0 && splitsSemCredito.length > 0) {
    const estados = Array.from(
      new Set(splitsSemCredito.map((split) => ROTULO_STATUS_SPLIT_MANUAL[split.status])),
    ).join(", ")
    const motivo = splitsSemCredito.find((split) => split.motivo)?.motivo
    const orientacao = splitsSemCredito.some((split) => split.status === "BLOQUEADO")
      ? " Confirme o encerramento no Asaas antes de pagar manualmente."
      : ""
    return `Repasse manual: split ${estados}${motivo ? ` — ${motivo}` : ""}.${orientacao}`
  }
  if (params.repasseManual > 0 && params.splits.length === 0) {
    return params.formaPagamento === "PIX_ASAAS"
      ? "Repasse manual: cobrança Asaas sem split associado, seja por configuração, limitação do fluxo ou ativação posterior."
      : `Repasse manual: pagamento ${params.formaPagamento ?? "registrado por baixa manual"} sem split automático.`
  }
  if (params.repasseManual > 0) {
    return "Repasse manual: parte do direito não foi coberta pelo split automático."
  }
  if (params.splitEmProcessamento > 0) {
    return params.splitConcluido > 0
      ? "Split parcialmente concluído; o saldo automático ainda está em processamento."
      : "Split automático em processamento; não fazer repasse manual neste momento."
  }
  if (params.splitConcluido > 0) return "Repasse concluído por split automático."
  return "Professor pendente de definição; o destino do repasse ainda não foi classificado."
}

function rotuloPlataforma(plataforma: string) {
  if (plataforma === "WELLHUB") return "Wellhub/Gympass"
  if (plataforma === "TOTALPASS") return "TotalPass"
  return plataforma
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
        splitConcluido: 0,
        splitEmProcessamento: 0,
        repasseManual: 0,
        origensSet: new Set<string>(),
      } satisfies LinhaProfessor & { origensSet: Set<string> })

    if (linha.origem === "Mensalidade interna") {
      atual.mensalidadeInterna += linha.valor
    } else {
      atual.plataformas += linha.valor
    }
    atual.total += linha.valor
    atual.eventos += linha.eventos
    atual.splitConcluido += linha.splitConcluido
    atual.splitEmProcessamento += linha.splitEmProcessamento
    atual.repasseManual += linha.repasseManual
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

function Resumo({
  rotulo,
  valor,
  icone,
  tom = "padrao",
}: {
  rotulo: string
  valor: string
  icone?: React.ReactNode
  tom?: "padrao" | "positivo" | "negativo" | "automatico" | "processamento" | "manual"
}) {
  return (
    <Card
      className={cn(
        tom === "automatico" && "border-emerald-200 bg-emerald-50/50",
        tom === "processamento" && "border-amber-200 bg-amber-50/50",
        tom === "manual" && "border-sky-200 bg-sky-50/50",
      )}
    >
      <CardContent className="py-5">
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">{rotulo}</p>
          {icone && (
            <span
              className={cn(
                "text-muted-foreground",
                tom === "automatico" && "text-emerald-700",
                tom === "processamento" && "text-amber-700",
                tom === "manual" && "text-sky-700",
              )}
            >
              {icone}
            </span>
          )}
        </div>
        <p
          className={cn(
            "mt-1 text-xl font-bold tabular-nums",
            tom === "positivo" && "text-emerald-700",
            tom === "negativo" && "text-destructive",
            tom === "automatico" && "text-emerald-800",
            tom === "processamento" && "text-amber-800",
            tom === "manual" && "text-sky-800",
          )}
        >
          {valor}
        </p>
      </CardContent>
    </Card>
  )
}

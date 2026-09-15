import type { StatusMensalidade } from "@prisma/client"
import { AlertTriangle, CheckCircle2, Search, WalletCards } from "lucide-react"
import Link from "next/link"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { CabecalhoPagina } from "@/components/ui/cabecalho-pagina"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select } from "@/components/ui/select"
import { STATUS_ALUNO_OPERACIONAIS } from "@/lib/alunos/status"
import { exigirGestao } from "@/lib/auth/dal"
import { db } from "@/lib/db"
import { statusMensalidadeEfetivo } from "@/lib/services/financeiro.service"
import { cn } from "@/lib/utils"
import { formatarData } from "@/lib/utils/datas"
import { formatarBRL } from "@/lib/utils/formato"
import { AcoesFinanceiro, AcoesMensalidade, AcoesPlano } from "./acoes-financeiro"

export const dynamic = "force-dynamic"

type SearchParams = Promise<Record<string, string | string[] | undefined>>
type SituacaoFiltro = "TODAS" | "VENCIDA" | "EM_ABERTO" | "PAGA" | "OUTRAS"
type MensalidadeVisivel = {
  id: string
  competencia: string
  valorNumero: number
  vencimento: Date
  pagoEm: Date | null
  status: StatusMensalidade
  statusEfetivo: StatusMensalidade
  formaPagamento: string | null
  observacao: string | null
  aluno: { usuario: { nome: string } }
  plano: { nome: string } | null
  cobrancasAsaas: {
    id: string
    tipo: string
    status: string
    ativa: boolean
    asaasPaymentId: string | null
    externalReference: string | null
    ultimoErro: string | null
    estornoParcialPendenteEm: Date | null
  }[]
}

const rotulosStatusMensalidade: Record<StatusMensalidade, string> = {
  EM_ABERTO: "Em aberto",
  PAGA: "Paga",
  VENCIDA: "Vencida",
  CANCELADA: "Cancelada",
  ISENTA: "Isenta",
}
const limitesMensalidades = [10, 20, 50, 100] as const
const situacoesFiltro: SituacaoFiltro[] = ["TODAS", "VENCIDA", "EM_ABERTO", "PAGA", "OUTRAS"]

function valorUnico(valor: string | string[] | undefined) {
  return Array.isArray(valor) ? valor[0] : valor
}

function limiteMensalidadesValido(valor: string | undefined) {
  const limite = Number(valor)
  return limitesMensalidades.includes(limite as (typeof limitesMensalidades)[number]) ? limite : 10
}

function situacaoFiltroValida(valor: string | undefined): SituacaoFiltro {
  return situacoesFiltro.includes(valor as SituacaoFiltro) ? (valor as SituacaoFiltro) : "TODAS"
}

function normalizarBusca(valor: string) {
  return valor
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR")
}

function correspondeASituacao(status: StatusMensalidade, situacao: SituacaoFiltro) {
  if (situacao === "TODAS") return true
  if (situacao === "OUTRAS") return status === "CANCELADA" || status === "ISENTA"
  return status === situacao
}

function ordenarMensalidades(mensalidades: MensalidadeVisivel[]) {
  return [...mensalidades].sort((a, b) => {
    const dataA = a.statusEfetivo === "PAGA" ? (a.pagoEm ?? a.vencimento) : a.vencimento
    const dataB = b.statusEfetivo === "PAGA" ? (b.pagoEm ?? b.vencimento) : b.vencimento
    const direcao = a.statusEfetivo === "PAGA" ? -1 : 1
    return (
      direcao * (dataA.getTime() - dataB.getTime()) ||
      a.aluno.usuario.nome.localeCompare(b.aluno.usuario.nome)
    )
  })
}

export default async function Page({ searchParams }: { searchParams: SearchParams }) {
  const usuario = await exigirGestao()
  const params = await searchParams
  const limite = limiteMensalidadesValido(valorUnico(params.limite))
  const situacao = situacaoFiltroValida(valorUnico(params.situacao))
  const busca = (valorUnico(params.busca) ?? "").trim().slice(0, 100)
  const termoBusca = normalizarBusca(busca)
  const podeEditar = usuario.papel === "GESTOR"
  const [planos, alunos, mensalidadesEncontradas, pagamentos] = await Promise.all([
    db.plano.findMany({
      orderBy: { criadoEm: "desc" },
      include: {
        _count: {
          select: { alunos: { where: { status: { in: [...STATUS_ALUNO_OPERACIONAIS] } } } },
        },
      },
    }),
    db.aluno.findMany({
      where: { status: { in: [...STATUS_ALUNO_OPERACIONAIS] } },
      orderBy: { usuario: { nome: "asc" } },
      include: {
        usuario: { select: { nome: true } },
        plano: { select: { nome: true } },
        modalidades: { where: { ativa: true }, select: { id: true, nome: true } },
        modalidadesPlano: {
          where: { modalidade: { ativa: true } },
          select: {
            plataformaExterna: true,
            modalidade: { select: { id: true, nome: true } },
          },
        },
      },
    }),
    db.mensalidade.findMany({
      where: { aluno: { status: { in: [...STATUS_ALUNO_OPERACIONAIS] } } },
      include: {
        aluno: { select: { usuario: { select: { nome: true } } } },
        plano: { select: { nome: true } },
        cobrancasAsaas: {
          orderBy: { geracao: "desc" },
          take: 1,
          select: {
            id: true,
            tipo: true,
            status: true,
            ativa: true,
            asaasPaymentId: true,
            externalReference: true,
            ultimoErro: true,
            estornoParcialPendenteEm: true,
          },
        },
      },
    }),
    db.pagamento.findMany({
      where: {
        OR: [{ alunoId: null }, { aluno: { status: { in: [...STATUS_ALUNO_OPERACIONAIS] } } }],
      },
      orderBy: { criadoEm: "desc" },
      take: 12,
      include: { aluno: { select: { usuario: { select: { nome: true } } } } },
    }),
  ])

  const mensalidadesComStatus: MensalidadeVisivel[] = mensalidadesEncontradas.map(
    (mensalidade) => ({
      ...mensalidade,
      valorNumero: Number(mensalidade.valor),
      statusEfetivo: statusMensalidadeEfetivo(mensalidade),
    }),
  )
  const mensalidadesFiltradas = mensalidadesComStatus.filter((mensalidade) => {
    const correspondeABusca =
      !termoBusca ||
      [mensalidade.aluno.usuario.nome, mensalidade.plano?.nome ?? "", mensalidade.competencia].some(
        (valor) => normalizarBusca(valor).includes(termoBusca),
      )
    return correspondeABusca && correspondeASituacao(mensalidade.statusEfetivo, situacao)
  })
  const vencidas = ordenarMensalidades(
    mensalidadesFiltradas.filter((mensalidade) => mensalidade.statusEfetivo === "VENCIDA"),
  )
  const emAberto = ordenarMensalidades(
    mensalidadesFiltradas.filter((mensalidade) => mensalidade.statusEfetivo === "EM_ABERTO"),
  )
  const pagas = ordenarMensalidades(
    mensalidadesFiltradas.filter((mensalidade) => mensalidade.statusEfetivo === "PAGA"),
  )
  const outras = ordenarMensalidades(
    mensalidadesFiltradas.filter(
      (mensalidade) =>
        mensalidade.statusEfetivo === "CANCELADA" || mensalidade.statusEfetivo === "ISENTA",
    ),
  )
  const resumo = {
    vencidas: mensalidadesComStatus.filter(
      (mensalidade) => mensalidade.statusEfetivo === "VENCIDA",
    ),
    emAberto: mensalidadesComStatus.filter(
      (mensalidade) => mensalidade.statusEfetivo === "EM_ABERTO",
    ),
    pagas: mensalidadesComStatus.filter((mensalidade) => mensalidade.statusEfetivo === "PAGA"),
  }

  const alunosOpcao = alunos.map((aluno) => ({
    id: aluno.id,
    nome: aluno.usuario.nome,
    detalhe: aluno.plano
      ? `${aluno.tipo} · ${aluno.plano.nome} · venc. dia ${aluno.diaVencimento} · ${aluno.tipoCobrancaPix === "MENSAL" ? "PIX mensal" : "PIX Automático"}`
      : `${aluno.tipo} · venc. dia ${aluno.diaVencimento}`,
    modalidades: aluno.modalidades.map((modalidade) => ({
      id: modalidade.id,
      nome: modalidade.nome,
    })),
    modalidadeContratadaIds: aluno.modalidadesPlano
      .filter((item) => !item.plataformaExterna)
      .map((item) => item.modalidade.id),
  }))
  const planosOpcao = planos.map((plano) => ({
    id: plano.id,
    nome: plano.nome,
    valor: Number(plano.valor),
    periodicidade: plano.periodicidade,
    limiteAulas: plano.limiteAulas,
    quantidadeModalidadesMatricula: plano.quantidadeModalidadesMatricula,
    ativo: plano.ativo,
    padrao: plano.padrao,
  }))

  return (
    <div className="space-y-6">
      <CabecalhoPagina
        titulo="Financeiro"
        descricao="Acompanhe recebimentos, cobranças em aberto e inadimplência em um só lugar."
      >
        <Button asChild variant="outline">
          <Link href="/gestao/financeiro/repasses">Repasses, custos e receitas</Link>
        </Button>
        {podeEditar && <AcoesFinanceiro alunos={alunosOpcao} />}
      </CabecalhoPagina>

      <section aria-label="Resumo financeiro" className="grid gap-4 md:grid-cols-3">
        <IndicadorFinanceiro
          titulo="Vencidas"
          valor={formatarBRL(
            resumo.vencidas.reduce((total, mensalidade) => total + mensalidade.valorNumero, 0),
          )}
          detalhe={`${resumo.vencidas.length} mensalidade(s) exigem atenção`}
          icone={<AlertTriangle className="size-5" />}
          destaque="destructive"
        />
        <IndicadorFinanceiro
          titulo="Em aberto"
          valor={formatarBRL(
            resumo.emAberto.reduce((total, mensalidade) => total + mensalidade.valorNumero, 0),
          )}
          detalhe={`${resumo.emAberto.length} mensalidade(s) a receber`}
          icone={<WalletCards className="size-5" />}
          destaque="warning"
        />
        <IndicadorFinanceiro
          titulo="Recebidas"
          valor={formatarBRL(
            resumo.pagas.reduce((total, mensalidade) => total + mensalidade.valorNumero, 0),
          )}
          detalhe={`${resumo.pagas.length} mensalidade(s) pagas`}
          icone={<CheckCircle2 className="size-5" />}
          destaque="success"
        />
      </section>

      <Card className="border-primary/20">
        <CardHeader className="gap-1">
          <CardTitle>Mensalidades</CardTitle>
          <CardDescription>
            Pesquise por aluno, plano ou competência e refine a visualização.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form className="grid gap-3 md:grid-cols-[minmax(0,1fr)_11rem_10rem_auto] md:items-end">
            <div className="grid gap-1.5">
              <Label htmlFor="busca-mensalidades">Buscar</Label>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="busca-mensalidades"
                  name="busca"
                  defaultValue={busca}
                  placeholder="Nome do aluno, plano ou competência"
                  className="pl-9"
                />
              </div>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="situacao-mensalidades">Situação</Label>
              <Select id="situacao-mensalidades" name="situacao" defaultValue={situacao}>
                <option value="TODAS">Todas</option>
                <option value="VENCIDA">Vencidas</option>
                <option value="EM_ABERTO">Em aberto</option>
                <option value="PAGA">Pagas</option>
                <option value="OUTRAS">Isentas e canceladas</option>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="limite-mensalidades">Por lista</Label>
              <Select id="limite-mensalidades" name="limite" defaultValue={String(limite)}>
                {limitesMensalidades.map((opcao) => (
                  <option key={opcao} value={opcao}>
                    {opcao} registros
                  </option>
                ))}
              </Select>
            </div>
            <div className="flex gap-2">
              <Button type="submit">Aplicar</Button>
              {(busca || situacao !== "TODAS" || limite !== 10) && (
                <Button asChild variant="ghost">
                  <Link href="/gestao/financeiro">Limpar</Link>
                </Button>
              )}
            </div>
          </form>
        </CardContent>
      </Card>

      <section aria-label="Listas de mensalidades" className="space-y-4">
        {(situacao === "TODAS" || situacao === "VENCIDA") && (
          <ListaMensalidades
            titulo="Mensalidades vencidas"
            descricao="Prioridade de cobrança: vencimento já ultrapassado."
            mensalidades={vencidas}
            limite={limite}
            podeEditar={podeEditar}
            vazio={
              busca ? "Nenhuma mensalidade vencida encontrada." : "Nenhuma mensalidade vencida."
            }
            destaque="vencida"
          />
        )}
        {(situacao === "TODAS" || situacao === "EM_ABERTO") && (
          <ListaMensalidades
            titulo="Mensalidades em aberto"
            descricao="Cobranças aguardando pagamento, ordenadas pelo próximo vencimento."
            mensalidades={emAberto}
            limite={limite}
            podeEditar={podeEditar}
            vazio={
              busca ? "Nenhuma mensalidade em aberto encontrada." : "Nenhuma mensalidade em aberto."
            }
            destaque="aberta"
          />
        )}
        {(situacao === "TODAS" || situacao === "PAGA") && (
          <ListaMensalidades
            titulo="Mensalidades pagas"
            descricao="Recebimentos mais recentes primeiro."
            mensalidades={pagas}
            limite={limite}
            podeEditar={podeEditar}
            vazio={busca ? "Nenhuma mensalidade paga encontrada." : "Nenhuma mensalidade paga."}
            destaque="paga"
          />
        )}
        {(situacao === "OUTRAS" || (situacao === "TODAS" && outras.length > 0)) && (
          <ListaMensalidades
            titulo="Isentas e canceladas"
            descricao="Registros sem cobrança ativa."
            mensalidades={outras}
            limite={limite}
            podeEditar={podeEditar}
            vazio="Nenhuma mensalidade isenta ou cancelada."
            destaque="neutra"
          />
        )}
      </section>

      <section className="grid gap-4 xl:grid-cols-[1fr_0.9fr]">
        <Card>
          <CardHeader>
            <CardTitle>Planos</CardTitle>
            <CardDescription>Valores e alunos vinculados aos planos ativos.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {planos.map((plano) => (
              <div key={plano.id} className="border-b border-border pb-3 last:border-0 last:pb-0">
                <div className="flex items-center justify-between gap-3">
                  <p className="font-medium">{plano.nome}</p>
                  <div className="flex items-center gap-2">
                    <Badge variant={plano.ativo ? "success" : "secondary"}>
                      {plano.ativo ? "Ativo" : "Inativo"}
                    </Badge>
                    {plano.padrao && <Badge variant="outline">Padrão</Badge>}
                    {podeEditar && (
                      <AcoesPlano
                        plano={{
                          id: plano.id,
                          nome: plano.nome,
                          valor: Number(plano.valor),
                          periodicidade: plano.periodicidade,
                          limiteAulas: plano.limiteAulas,
                          quantidadeModalidadesMatricula: plano.quantidadeModalidadesMatricula,
                          ativo: plano.ativo,
                          padrao: plano.padrao,
                        }}
                        planos={planosOpcao}
                        alunosVinculados={plano._count.alunos}
                      />
                    )}
                  </div>
                </div>
                <p className="text-sm text-muted-foreground">
                  {formatarBRL(Number(plano.valor))} · {plano._count.alunos} aluno(s)
                </p>
              </div>
            ))}
            {planos.length === 0 && <p className="text-sm text-muted-foreground">Nenhum plano.</p>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Pagamentos avulsos</CardTitle>
            <CardDescription>Últimos 12 lançamentos fora das mensalidades.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {pagamentos.map((pagamento) => (
              <div
                key={pagamento.id}
                className="border-b border-border pb-3 last:border-0 last:pb-0"
              >
                <div className="flex items-center justify-between gap-3">
                  <p className="font-medium">{pagamento.aluno?.usuario.nome ?? "Sem aluno"}</p>
                  <Badge variant="outline">{pagamento.tipo}</Badge>
                </div>
                <p className="text-sm text-muted-foreground">
                  {formatarBRL(Number(pagamento.valor))} · {formatarData(pagamento.criadoEm)}
                </p>
                {pagamento.descricao && (
                  <p className="text-xs text-muted-foreground">{pagamento.descricao}</p>
                )}
              </div>
            ))}
            {pagamentos.length === 0 && (
              <p className="text-sm text-muted-foreground">Nenhum pagamento avulso.</p>
            )}
          </CardContent>
        </Card>
      </section>
    </div>
  )
}

function IndicadorFinanceiro({
  titulo,
  valor,
  detalhe,
  icone,
  destaque = "neutro",
}: {
  titulo: string
  valor: string
  detalhe: string
  icone: React.ReactNode
  destaque?: "destructive" | "warning" | "success" | "neutro"
}) {
  const classesDestaque = {
    destructive: "border-destructive/25 bg-destructive/5 text-destructive",
    warning:
      "border-amber-300/60 bg-amber-50/70 text-amber-800 dark:bg-amber-950/20 dark:text-amber-300",
    success:
      "border-emerald-300/60 bg-emerald-50/70 text-emerald-800 dark:bg-emerald-950/20 dark:text-emerald-300",
    neutro: "",
  }
  return (
    <Card className={classesDestaque[destaque]}>
      <CardHeader className="flex-row items-center justify-between gap-3 space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{titulo}</CardTitle>
        <div>{icone}</div>
      </CardHeader>
      <CardContent>
        <p className="break-words text-2xl font-bold tabular-nums">{valor}</p>
        <p className="text-xs text-muted-foreground">{detalhe}</p>
      </CardContent>
    </Card>
  )
}

function ListaMensalidades({
  titulo,
  descricao,
  mensalidades,
  limite,
  podeEditar,
  vazio,
  destaque,
}: {
  titulo: string
  descricao: string
  mensalidades: MensalidadeVisivel[]
  limite: number
  podeEditar: boolean
  vazio: string
  destaque: "vencida" | "aberta" | "paga" | "neutra"
}) {
  const visiveis = mensalidades.slice(0, limite)
  const estilos = {
    vencida: "border-destructive/30",
    aberta: "border-sky-300/60",
    paga: "border-emerald-300/60",
    neutra: "",
  }
  return (
    <Card className={estilos[destaque]}>
      <CardHeader className="gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <CardTitle>{titulo}</CardTitle>
          <CardDescription>{descricao}</CardDescription>
        </div>
        <Badge variant="outline" className="w-fit tabular-nums">
          {mensalidades.length} registro(s)
        </Badge>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="tabela-responsiva w-full text-sm">
            <thead className="border-b border-border text-left text-muted-foreground">
              <tr>
                <th className="p-4 font-medium">Aluno</th>
                <th className="p-4 font-medium">Plano · competência</th>
                <th className="p-4 font-medium">Vencimento</th>
                <th className="p-4 font-medium">Valor</th>
                <th className="p-4 font-medium">Cobrança</th>
                {podeEditar && (
                  <th className="p-4 text-right font-medium md:sticky md:right-0 md:z-20 md:bg-card md:pl-6">
                    <span className="sr-only">Ações</span>
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {visiveis.map((mensalidade) => {
                const vencida = mensalidade.statusEfetivo === "VENCIDA"
                const quitada =
                  mensalidade.statusEfetivo === "PAGA" || mensalidade.statusEfetivo === "ISENTA"
                const cobrancaAsaas = mensalidade.cobrancasAsaas[0]
                return (
                  <tr
                    key={mensalidade.id}
                    className={cn(
                      "border-b border-border transition-colors last:border-0 hover:bg-muted/40",
                      vencida && "bg-destructive/5 hover:bg-destructive/10",
                    )}
                  >
                    <td className="p-4 font-medium" data-label="Aluno">
                      {mensalidade.aluno.usuario.nome}
                    </td>
                    <td className="p-4" data-label="Plano e competência">
                      <p>{mensalidade.plano?.nome ?? "Sem plano"}</p>
                      <p className="text-xs text-muted-foreground">{mensalidade.competencia}</p>
                    </td>
                    <td
                      className={cn(
                        "p-4 tabular-nums",
                        vencida && "font-semibold text-destructive",
                      )}
                      data-label="Vencimento"
                    >
                      {formatarData(mensalidade.vencimento)}
                    </td>
                    <td className="p-4 tabular-nums" data-label="Valor">
                      {formatarBRL(mensalidade.valorNumero)}
                    </td>
                    <td className="p-4" data-label="Cobrança">
                      <SituacaoCobranca
                        status={mensalidade.statusEfetivo}
                        cobrancaAsaas={cobrancaAsaas}
                      />
                    </td>
                    {podeEditar && (
                      <td
                        className={cn(
                          "p-4 md:sticky md:right-0 md:z-10 md:bg-card md:pl-6 md:shadow-[-10px_0_14px_-14px_rgba(1,1,1,0.55)]",
                          vencida && "md:bg-destructive/5",
                        )}
                        data-label="Ações"
                      >
                        <div className="flex justify-end">
                          <AcoesMensalidade
                            mensalidadeId={mensalidade.id}
                            status={mensalidade.status}
                            formaPagamento={mensalidade.formaPagamento}
                            observacao={mensalidade.observacao}
                            quitada={quitada}
                            cobrancaAsaas={cobrancaAsaas}
                          />
                        </div>
                      </td>
                    )}
                  </tr>
                )
              })}
              {visiveis.length === 0 && (
                <tr>
                  <td
                    colSpan={podeEditar ? 6 : 5}
                    className="p-10 text-center text-muted-foreground"
                  >
                    {vazio}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {mensalidades.length > limite && (
          <p className="border-t border-border px-4 py-3 text-sm text-muted-foreground">
            Exibindo {limite} de {mensalidades.length} registros. Aumente o limite acima para ver
            mais.
          </p>
        )}
      </CardContent>
    </Card>
  )
}

function SituacaoCobranca({
  status,
  cobrancaAsaas,
}: {
  status: StatusMensalidade
  cobrancaAsaas: MensalidadeVisivel["cobrancasAsaas"][number] | undefined
}) {
  const vencida = status === "VENCIDA"
  const quitada = status === "PAGA" || status === "ISENTA"
  return (
    <div className="max-w-72 space-y-1">
      <Badge
        variant={vencida ? "destructive" : quitada ? "success" : "outline"}
        className={cn(
          "whitespace-nowrap",
          status === "EM_ABERTO" && "border-sky-200 bg-sky-50 text-sky-800",
        )}
      >
        {rotulosStatusMensalidade[status]}
      </Badge>
      {cobrancaAsaas && (
        <>
          <p className="text-xs text-muted-foreground">
            {cobrancaAsaas.estornoParcialPendenteEm
              ? "Estorno parcial pendente"
              : `Asaas: ${cobrancaAsaas.status}`}
          </p>
          {cobrancaAsaas.ultimoErro && (
            <p className="text-xs text-destructive">{cobrancaAsaas.ultimoErro}</p>
          )}
        </>
      )}
    </div>
  )
}

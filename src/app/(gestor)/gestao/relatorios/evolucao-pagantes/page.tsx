import {
  ArrowLeft,
  ArrowRight,
  CalendarRange,
  Repeat2,
  UserMinus,
  UserPlus,
  Users,
} from "lucide-react"
import Link from "next/link"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { CabecalhoPagina } from "@/components/ui/cabecalho-pagina"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Select } from "@/components/ui/select"
import { exigirGestao } from "@/lib/auth/dal"
import {
  competenciaAtualPagantes,
  consultarEvolucaoPagantes,
  validarCompetencia,
} from "@/lib/services/evolucao-pagantes.service"
import { cn } from "@/lib/utils"
import { ListasPagantes } from "./listas-pagantes"

export const dynamic = "force-dynamic"

function mesLegivel(competencia: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${competencia}-01T12:00:00Z`))
}

function mesCurto(competencia: string) {
  const [ano, mes] = competencia.split("-")
  return `${mes}/${ano}`
}

function saldoLegivel(saldo: number) {
  return saldo > 0 ? `+${saldo}` : String(saldo)
}

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  await exigirGestao()
  const params = await searchParams
  const solicitado = Array.isArray(params.competencia) ? params.competencia[0] : params.competencia
  const agora = new Date()
  const competencia =
    solicitado &&
    validarCompetencia(solicitado) &&
    solicitado >= "1901-01" &&
    solicitado <= competenciaAtualPagantes(agora)
      ? solicitado
      : undefined
  const dados = await consultarEvolucaoPagantes(competencia, agora)
  const { resumo } = dados
  const periodo = mesLegivel(dados.competencia)
  const anterior = mesLegivel(dados.competenciaAnterior)
  const primeiraCompetencia = !dados.temBaseComparacao
  const maiorTotal = Math.max(1, ...dados.historico.map((mes) => mes.pagantesAtual))

  return (
    <div className="space-y-6">
      <CabecalhoPagina
        titulo="Evolução de pagantes"
        descricao="Acompanhe quem permaneceu, deixou de pagar ou entrou na base a cada mês."
      >
        <Button asChild variant="outline">
          <Link href="/gestao/relatorios">
            <ArrowLeft className="size-4" />
            Relatórios
          </Link>
        </Button>
      </CabecalhoPagina>

      <Card>
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <form className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <div className="space-y-2">
                <Label htmlFor="competencia">Competência</Label>
                <Select
                  id="competencia"
                  name="competencia"
                  defaultValue={dados.competencia}
                  className="sm:w-60"
                >
                  {dados.competenciasDisponiveis.map((mes) => (
                    <option key={mes} value={mes}>
                      {mesLegivel(mes)}
                    </option>
                  ))}
                </Select>
              </div>
              <Button type="submit">Ver relatório</Button>
            </form>
            <div className="space-y-2">
              <Badge variant={dados.mesEmAndamento ? "warning" : "outline"}>
                {dados.mesEmAndamento ? "Mês em andamento · parcial" : "Mês encerrado"}
              </Badge>
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <CalendarRange className="size-4 shrink-0" />
                {periodo} em relação a {anterior}
              </p>
            </div>
          </div>
          <p className="border-t pt-4 text-sm text-muted-foreground">
            Conta como pagamento apenas a mensalidade paga da competência, mesmo recebida em outra
            data. Isenções não contam. Os resultados acompanham pagamentos e correções registrados
            posteriormente.
          </p>
          {solicitado && solicitado !== dados.competencia && (
            <p role="status" className="text-sm text-warning">
              A competência informada não está disponível. Exibindo {periodo}.
            </p>
          )}
          {dados.mesEmAndamento && (
            <p className="text-sm text-warning">
              O mês ainda está em andamento. As saídas são provisórias e podem mudar com os próximos
              pagamentos.
            </p>
          )}
          {primeiraCompetencia && (
            <p className="text-sm text-warning">
              Não há histórico anterior suficiente para esta comparação. Não é possível confirmar
              quem já pagava antes desta competência.
            </p>
          )}
        </CardContent>
      </Card>

      <section
        aria-label="Resumo da base pagante"
        className="overflow-hidden rounded-lg border bg-card shadow-sm"
      >
        <div className="grid divide-y sm:grid-cols-3 sm:divide-x sm:divide-y-0">
          <div className="p-5">
            <p className="text-sm text-muted-foreground">
              Pagantes em {mesCurto(dados.competenciaAnterior)}
            </p>
            <p className="mt-2 text-3xl font-semibold tabular-nums">
              {primeiraCompetencia ? "—" : resumo.pagantesAnterior}
            </p>
          </div>
          <div className="p-5">
            <p className="text-sm text-muted-foreground">
              Pagantes em {mesCurto(dados.competencia)}
            </p>
            <p className="mt-2 text-3xl font-semibold tabular-nums">{resumo.pagantesAtual}</p>
          </div>
          <div className="bg-muted/30 p-5">
            <p className="text-sm text-muted-foreground">Saldo de pagantes</p>
            <p
              className={cn(
                "mt-2 text-3xl font-semibold tabular-nums",
                resumo.saldo < 0 ? "text-destructive" : resumo.saldo > 0 ? "text-success" : "",
              )}
            >
              {primeiraCompetencia ? "—" : saldoLegivel(resumo.saldo)}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">Entradas menos saídas</p>
          </div>
        </div>
        <div className="flex flex-col gap-2 border-t px-5 py-3 text-sm sm:flex-row sm:items-center sm:justify-between">
          <p>
            <strong>{resumo.entradas}</strong> entradas: {resumo.novos} novos pagantes +{" "}
            {resumo.retornos} retornos
          </p>
          <p className="text-muted-foreground">
            Retenção:{" "}
            <strong className="text-foreground">
              {primeiraCompetencia || resumo.retencao === null
                ? "Sem base anterior"
                : `${resumo.retencao.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`}
            </strong>
          </p>
        </div>
      </section>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          {
            titulo: "Saídas",
            valor: resumo.saidas,
            detalhe: "Pagaram só o mês anterior",
            icone: UserMinus,
            cor: "text-destructive",
          },
          {
            titulo: "Recorrentes",
            valor: resumo.recorrentes,
            detalhe: "Pagaram os dois meses",
            icone: Users,
            cor: "text-foreground",
          },
          {
            titulo: "Novos pagantes",
            valor: resumo.novos,
            detalhe: "Primeiro mês pago no histórico",
            icone: UserPlus,
            cor: "text-success",
          },
          {
            titulo: "Retornos",
            valor: resumo.retornos,
            detalhe: "Voltaram à base pagante",
            icone: Repeat2,
            cor: "text-foreground",
          },
        ].map((item) => (
          <Card key={item.titulo}>
            <CardContent className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium">{item.titulo}</p>
                <item.icone className={cn("size-4 shrink-0", item.cor)} />
              </div>
              <p className={cn("text-3xl font-semibold tabular-nums", item.cor)}>{item.valor}</p>
              <p className="text-xs text-muted-foreground">{item.detalhe}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <ListasPagantes
        key={dados.competencia}
        listas={dados.listas}
        periodo={periodo}
        anterior={anterior}
        parcial={dados.mesEmAndamento}
      />

      <Card>
        <CardHeader>
          <CardTitle>Evolução mês a mês</CardTitle>
          <CardDescription>
            Cada linha compara a competência com o mês imediatamente anterior. Selecione um mês para
            ver os nomes.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[650px] text-sm">
              <caption className="sr-only">
                Histórico de pagantes, recorrentes, novos pagantes, retornos, saídas e saldo por
                competência
              </caption>
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground">
                  <th scope="col" className="py-3 pr-4 font-medium">
                    Competência
                  </th>
                  {["Pagantes", "Recorrentes", "Novos", "Retornos", "Saídas", "Saldo"].map(
                    (titulo) => (
                      <th key={titulo} scope="col" className="px-3 py-3 text-right font-medium">
                        {titulo}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody>
                {dados.historico.map((mes) => {
                  const semBase = !mes.temBaseComparacao
                  return (
                    <tr
                      key={mes.competencia}
                      className={cn(
                        "border-b last:border-0",
                        mes.competencia === dados.competencia && "bg-muted/40",
                      )}
                    >
                      <th scope="row" className="py-3 pr-4 text-left font-medium">
                        <Link
                          href={`?competencia=${mes.competencia}`}
                          className="inline-flex items-center gap-2 underline-offset-4 hover:underline"
                        >
                          {mesCurto(mes.competencia)}
                          <ArrowRight className="size-3" />
                          <span className="sr-only">Ver relatório</span>
                        </Link>
                        {mes.competencia === dados.competenciaAtual && (
                          <span className="ml-2 text-xs text-warning">Parcial</span>
                        )}
                      </th>
                      <td className="px-3 py-3 text-right tabular-nums">
                        <div className="flex items-center justify-end gap-3">
                          <div
                            aria-hidden="true"
                            className="h-1.5 w-16 overflow-hidden rounded-full bg-muted"
                          >
                            <div
                              className="h-full bg-foreground/70"
                              style={{ width: `${(mes.pagantesAtual / maiorTotal) * 100}%` }}
                            />
                          </div>
                          {mes.pagantesAtual}
                        </div>
                      </td>
                      <td className="px-3 py-3 text-right tabular-nums">
                        {semBase ? "—" : mes.recorrentes}
                      </td>
                      <td className="px-3 py-3 text-right tabular-nums">{mes.novos}</td>
                      <td className="px-3 py-3 text-right tabular-nums">{mes.retornos}</td>
                      <td className="px-3 py-3 text-right tabular-nums">
                        {semBase ? "—" : mes.saidas}
                      </td>
                      <td
                        className={cn(
                          "px-3 py-3 text-right font-medium tabular-nums",
                          !semBase && mes.saldo < 0
                            ? "text-destructive"
                            : !semBase && mes.saldo > 0
                              ? "text-success"
                              : "",
                        )}
                      >
                        {semBase ? "—" : saldoLegivel(mes.saldo)}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          {!dados.historico.length && (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Nenhuma mensalidade registrada até esta competência.
            </p>
          )}
        </CardContent>
      </Card>

      <p className="text-xs leading-relaxed text-muted-foreground">
        Saída indica ausência de pagamento, não cancelamento de matrícula. Novos pagantes são
        identificados pelo histórico disponível
        {dados.primeiraCompetenciaDisponivel
          ? ` desde ${mesLegivel(dados.primeiraCompetenciaDisponivel)}`
          : ""}
        . A situação atual do cadastro do aluno não altera o histórico deste relatório.
      </p>
    </div>
  )
}

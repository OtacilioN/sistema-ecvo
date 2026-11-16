"use client"

import { useId, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Select } from "@/components/ui/select"
import {
  construirComparativoReceita,
  type DadosEvolucaoReceita,
} from "@/lib/financeiro/evolucao-receita"
import { cn } from "@/lib/utils"
import { formatarCompetencia } from "@/lib/utils/datas"
import { formatarBRL } from "@/lib/utils/formato"

const formatoEixo = new Intl.NumberFormat("pt-BR", {
  notation: "compact",
  maximumFractionDigits: 1,
})

function variacao(atual: number, base: number) {
  if (base === 0) return atual === 0 ? "Sem variação" : "Sem base percentual"
  const percentual = ((atual - base) / base) * 100
  return `${percentual > 0 ? "+" : ""}${percentual.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`
}

export function EvolucaoReceita({ dados }: { dados: DadosEvolucaoReceita }) {
  const id = useId()
  const [agrupamento, setAgrupamento] = useState<"dia" | "semana">("dia")
  const [janela, setJanela] = useState<3 | 6>(3)
  const [medida, setMedida] = useState<"media" | "mediana">("media")
  const [diaSelecionado, setDiaSelecionado] = useState(dados.diaAtual)
  const comparativo = construirComparativoReceita(dados, { agrupamento, janela, medida })
  const { pontos, resumo, mesesHistorico, temMesAnterior, projecao } = comparativo
  const indiceSelecionado = Math.max(
    0,
    pontos.findIndex((ponto) => ponto.dia >= diaSelecionado),
  )
  const selecionado = pontos[indiceSelecionado]
  const ultimoDia = pontos.at(-1)?.dia ?? 31
  const maximo = Math.max(
    1,
    ...pontos.flatMap((ponto) => [
      ponto.atual ?? 0,
      ponto.anterior,
      ponto.historico,
      ponto.projetado ?? 0,
    ]),
  )
  const teto = Math.ceil(maximo / 4) * 4
  const x = (dia: number) => ((dia - 1) / Math.max(1, ultimoDia - 1)) * 1000
  const y = (valor: number) => 245 - (valor / teto) * 230
  const caminho = (campo: "atual" | "anterior" | "historico" | "projetado") =>
    pontos
      .filter((ponto) => ponto[campo] !== null)
      .map(
        (ponto, indice) =>
          `${indice === 0 ? "M" : "L"}${x(ponto.dia).toFixed(2)},${y(ponto[campo] ?? 0).toFixed(2)}`,
      )
      .join(" ")
  // Parte do recebido real de hoje, inclusive quando ainda há vencimentos neste dia.
  const caminhoProjecao = `M${x(dados.diaAtual).toFixed(2)},${y(resumo.atual).toFixed(2)} ${caminho("projetado").replace(/^M/, "L")}`
  const nomeHistorico = medida === "media" ? "Média" : "Mediana"
  const mesAtual = formatarCompetencia(dados.competenciaAtual)
  const indiceAtual = dados.meses.findIndex((mes) => mes.competencia === dados.competenciaAtual)
  const mesAnterior = dados.meses[indiceAtual - 1]
  const legendaHistorico = `${nomeHistorico} · ${mesesHistorico} ${mesesHistorico === 1 ? "mês" : "meses"}`
  const series = [
    {
      chave: "atual" as const,
      nome: mesAtual,
      cor: "text-primary",
      borda: "border-primary",
      valor: resumo.atual,
      disponivel: true,
    },
    {
      chave: "anterior" as const,
      nome: mesAnterior ? formatarCompetencia(mesAnterior.competencia) : "Mês anterior",
      cor: "text-foreground",
      borda: "border-foreground border-dashed",
      valor: resumo.anterior,
      disponivel: temMesAnterior,
    },
    {
      chave: "historico" as const,
      nome: legendaHistorico,
      cor: "text-warning",
      borda: "border-warning border-dotted",
      valor: resumo.historico,
      disponivel: mesesHistorico > 0,
    },
  ]
  const marcas =
    agrupamento === "dia"
      ? [1, 7, 14, 21, ultimoDia]
      : [
          ...new Set(
            pontos
              .map((ponto) => ponto.dia)
              .filter(
                (dia) =>
                  (dia !== dados.diaAtual || dia % 7 === 0 || dia === ultimoDia) &&
                  (dia === ultimoDia || ultimoDia - dia >= 3),
              ),
          ),
        ]
  const temRecebimento = pontos.some(
    (ponto) =>
      (ponto.atual ?? 0) > 0 ||
      ponto.anterior > 0 ||
      ponto.historico > 0 ||
      (ponto.projetado ?? 0) > 0,
  )

  return (
    <Card>
      <CardHeader className="gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div className="space-y-1.5">
          <CardTitle>Evolução da receita</CardTitle>
          <p className="text-sm text-muted-foreground">Recebimentos acumulados ao longo do mês.</p>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <fieldset className="space-y-1.5">
            <legend className="text-xs text-muted-foreground">Visualização</legend>
            <div className="inline-flex rounded-md border border-input p-0.5">
              {(["dia", "semana"] as const).map((opcao) => (
                <button
                  key={opcao}
                  type="button"
                  aria-pressed={agrupamento === opcao}
                  onClick={() => setAgrupamento(opcao)}
                  className={cn(
                    "rounded px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    agrupamento === opcao
                      ? "bg-foreground text-background"
                      : "text-muted-foreground hover:bg-muted",
                  )}
                >
                  {opcao === "dia" ? "Por dia" : "Por semana"}
                </button>
              ))}
            </div>
          </fieldset>
          <label className="space-y-1.5 text-xs text-muted-foreground" htmlFor={`${id}-medida`}>
            <span className="block">Referência</span>
            <Select
              id={`${id}-medida`}
              value={medida}
              onChange={(evento) => setMedida(evento.target.value as "media" | "mediana")}
            >
              <option value="media">Média</option>
              <option value="mediana">Mediana</option>
            </Select>
          </label>
          <label className="space-y-1.5 text-xs text-muted-foreground" htmlFor={`${id}-janela`}>
            <span className="block">Histórico</span>
            <Select
              id={`${id}-janela`}
              value={janela}
              onChange={(evento) => setJanela(Number(evento.target.value) as 3 | 6)}
            >
              <option value={3}>3 meses</option>
              <option value={6}>6 meses</option>
            </Select>
          </label>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        <div>
          <p className="mb-3 text-xs text-muted-foreground">
            Comparação até o dia {dados.diaAtual} de cada mês · hoje em andamento
          </p>
          <div className="grid gap-3 sm:grid-cols-3">
            {series.map((serie) => (
              <div
                key={serie.chave}
                className={cn(
                  "rounded-md border border-border p-3",
                  serie.chave === "atual" && "border-primary/25 bg-primary/5",
                )}
              >
                <p className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span aria-hidden="true" className={cn("w-5 shrink-0 border-t-2", serie.borda)} />
                  {serie.nome}
                </p>
                <p className={cn("mt-2 text-xl font-semibold tabular-nums sm:text-2xl", serie.cor)}>
                  {serie.disponivel ? formatarBRL(serie.valor) : "Sem histórico"}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {serie.chave === "atual"
                    ? "Recebido neste mês"
                    : serie.disponivel
                      ? `${variacao(resumo.atual, serie.valor)} no mês vigente`
                      : "Ainda sem base para comparação"}
                </p>
              </div>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-3 rounded-md border border-dashed border-primary/40 bg-primary/5 p-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <p className="flex items-center gap-2 text-sm font-medium">
              <span
                aria-hidden="true"
                className="w-6 shrink-0 border-t-2 border-dashed border-primary"
              />
              Projeção com pagamentos em dia
            </p>
            <p className="text-xs text-muted-foreground">
              {projecao.quantidadeMensalidades > 0
                ? `${formatarBRL(projecao.aReceber)} em ${projecao.quantidadeMensalidades} mensalidade${projecao.quantidadeMensalidades === 1 ? "" : "s"} a vencer, incluindo hoje.`
                : "Nenhuma mensalidade em aberto a vencer até o fim do mês."}
            </p>
          </div>
          <div className="shrink-0 sm:text-right">
            <p className="text-xs text-muted-foreground">
              Total previsto até o dia {projecao.diasNoMes}
            </p>
            <p className="mt-1 text-2xl font-semibold tabular-nums text-primary">
              {formatarBRL(projecao.total)}
            </p>
          </div>
        </div>

        {temRecebimento ? (
          <div>
            <div className="mb-2 text-xs text-muted-foreground">Receita acumulada (R$)</div>
            <div className="flex gap-2">
              <div
                aria-hidden="true"
                className="relative h-64 w-12 shrink-0 text-right text-[11px] tabular-nums text-muted-foreground"
              >
                {[1, 0.75, 0.5, 0.25, 0].map((fracao) => (
                  <span
                    key={fracao}
                    className="absolute right-0 -translate-y-1/2"
                    style={{ top: `${(y(teto * fracao) / 260) * 100}%` }}
                  >
                    {formatoEixo.format(teto * fracao)}
                  </span>
                ))}
              </div>
              <div className="min-w-0 flex-1">
                <svg
                  role="img"
                  aria-labelledby={`${id}-titulo ${id}-descricao`}
                  className="h-64 w-full overflow-visible"
                  viewBox="0 0 1000 260"
                  preserveAspectRatio="none"
                  onPointerMove={(evento) => {
                    const limites = evento.currentTarget.getBoundingClientRect()
                    setDiaSelecionado(
                      Math.round(
                        1 +
                          Math.max(
                            0,
                            Math.min(1, (evento.clientX - limites.left) / limites.width),
                          ) *
                            (ultimoDia - 1),
                      ),
                    )
                  }}
                >
                  <title id={`${id}-titulo`}>Comparativo da receita acumulada</title>
                  <desc id={`${id}-descricao`}>
                    Mês vigente até hoje, projeção tracejada de pagamentos em dia até o fim do mês,
                    mês anterior e referência histórica. Consulte os valores pelo seletor abaixo.
                  </desc>
                  {[1, 0.75, 0.5, 0.25, 0].map((fracao) => (
                    <line
                      key={fracao}
                      x1="0"
                      x2="1000"
                      y1={y(teto * fracao)}
                      y2={y(teto * fracao)}
                      className="stroke-border"
                      vectorEffect="non-scaling-stroke"
                      strokeDasharray="3 5"
                    />
                  ))}
                  <path
                    d={caminhoProjecao}
                    fill="none"
                    stroke="currentColor"
                    className="text-primary"
                    strokeWidth="3"
                    strokeDasharray="8 5"
                    vectorEffect="non-scaling-stroke"
                  />
                  {series
                    .filter((serie) => serie.disponivel)
                    .toReversed()
                    .map((serie) => (
                      <path
                        key={serie.chave}
                        d={caminho(serie.chave)}
                        fill="none"
                        stroke="currentColor"
                        className={serie.cor}
                        strokeWidth={serie.chave === "atual" ? 3 : 2}
                        strokeDasharray={
                          serie.chave === "anterior"
                            ? "7 5"
                            : serie.chave === "historico"
                              ? "2 5"
                              : undefined
                        }
                        vectorEffect="non-scaling-stroke"
                      />
                    ))}
                  <circle
                    cx={x(dados.diaAtual)}
                    cy={y(resumo.atual)}
                    r="3"
                    fill="currentColor"
                    stroke="currentColor"
                    strokeWidth="2"
                    className="text-primary"
                    vectorEffect="non-scaling-stroke"
                  />
                  <line
                    x1={x(dados.diaAtual)}
                    x2={x(dados.diaAtual)}
                    y1="0"
                    y2="245"
                    className="stroke-primary/30"
                    strokeDasharray="3 5"
                    vectorEffect="non-scaling-stroke"
                  />
                  {selecionado ? (
                    <line
                      x1={x(selecionado.dia)}
                      x2={x(selecionado.dia)}
                      y1="0"
                      y2="245"
                      className="stroke-muted-foreground/50"
                      vectorEffect="non-scaling-stroke"
                    />
                  ) : null}
                </svg>
                <div aria-hidden="true" className="relative h-6 text-[11px] text-muted-foreground">
                  {marcas.map((dia) => (
                    <span
                      key={dia}
                      className={cn(
                        "absolute",
                        dia === 1
                          ? ""
                          : dia === ultimoDia
                            ? "-translate-x-full"
                            : "-translate-x-1/2",
                      )}
                      style={{ left: `${x(dia) / 10}%` }}
                    >
                      {dia}
                    </span>
                  ))}
                </div>
              </div>
            </div>
            <p className="text-right text-xs text-muted-foreground">
              Dia do mês · recebido até hoje ({dados.diaAtual}); tracejado = projeção
            </p>
          </div>
        ) : (
          <p className="rounded-md border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">
            Nenhum recebimento ou mensalidade a vencer nos períodos comparados.
          </p>
        )}

        {selecionado && temRecebimento ? (
          <div className="rounded-md border border-border bg-muted/25 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label htmlFor={`${id}-dia`} className="text-sm font-medium">
                {agrupamento === "dia"
                  ? `Até o dia ${selecionado.dia}`
                  : `Semana ${selecionado.rotulo} · acumulado até o dia ${selecionado.dia}`}
              </label>
              <span className="text-xs text-muted-foreground">
                Deslize para consultar os valores
              </span>
            </div>
            <input
              id={`${id}-dia`}
              type="range"
              min="0"
              max={pontos.length - 1}
              value={indiceSelecionado}
              aria-valuetext={`Acumulado até o dia ${selecionado.dia}`}
              onChange={(evento) => setDiaSelecionado(pontos[Number(evento.target.value)].dia)}
              className="my-3 block w-full accent-primary"
            />
            <dl aria-live="polite" className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
              {series.map((serie) => (
                <div key={serie.chave}>
                  <dt className="text-xs text-muted-foreground">{serie.nome}</dt>
                  <dd className={cn("mt-1 font-medium tabular-nums", serie.cor)}>
                    {!serie.disponivel
                      ? "Sem histórico"
                      : selecionado[serie.chave] === null
                        ? "Período futuro"
                        : formatarBRL(selecionado[serie.chave] ?? 0)}
                  </dd>
                </div>
              ))}
              <div>
                <dt className="text-xs text-muted-foreground">Projeção com pagamentos em dia</dt>
                <dd className="mt-1 font-medium tabular-nums text-primary">
                  {selecionado.projetado !== null
                    ? formatarBRL(selecionado.projetado)
                    : selecionado.dia < dados.diaAtual
                      ? "Projeção começa hoje"
                      : "Fora do mês vigente"}
                </dd>
              </div>
            </dl>
          </div>
        ) : null}

        <div className="space-y-1 text-xs leading-relaxed text-muted-foreground">
          <p>
            Mensalidades pagas e reativações recebidas, pela data do pagamento e antes de taxas. Não
            inclui Wellhub, TotalPass ou outras receitas lançadas apenas por competência.
          </p>
          <p>
            O tracejado soma ao recebido as mensalidades já lançadas, em aberto, de matrículas
            ativas, com vencimento de hoje até o fim do mês. Considera pagamento no vencimento, com
            desconto de pontualidade quando aplicável. Não inclui atrasadas nem estima matrículas
            futuras.
          </p>
          <p>
            {nomeHistorico} dos acumulados de cada mês anterior no mesmo dia.{" "}
            {mesesHistorico < janela
              ? `Base disponível: ${mesesHistorico} de ${janela} meses solicitados. `
              : ""}
            Meses sem recebimento dentro da base contam como zero. Meses mais curtos mantêm o saldo
            final.
          </p>
          {agrupamento === "semana" ? (
            <p>
              Semanas do mês: dias 1–7, 8–14, 15–21, 22–28 e 29 até o fim. Na semana vigente, o
              recebido considera apenas os pagamentos confirmados até hoje.
            </p>
          ) : null}
        </div>
      </CardContent>
    </Card>
  )
}

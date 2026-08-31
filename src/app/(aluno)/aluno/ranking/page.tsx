import { Flame, Medal, Trophy } from "lucide-react"
import Link from "next/link"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { exigirAluno } from "@/lib/auth/dal"
import { listarRankingOfensivas } from "@/lib/services/ofensiva.service"
import { cn } from "@/lib/utils"

export const dynamic = "force-dynamic"

type SearchParams = Promise<{ modalidade?: string | string[] }>

function rotuloDias(dias: number) {
  return `${dias} ${dias === 1 ? "dia" : "dias"}`
}

function corPosicao(posicao: number) {
  if (posicao === 1) return "bg-[#f5c518] text-black"
  if (posicao === 2) return "bg-[#c4c4c8] text-black"
  if (posicao === 3) return "bg-[#cd7f32] text-white"
  return "bg-muted text-muted-foreground"
}

export default async function RankingOfensivas({ searchParams }: { searchParams: SearchParams }) {
  const { alunoId } = await exigirAluno()
  const params = await searchParams
  const modalidadeSolicitada =
    typeof params.modalidade === "string" && params.modalidade.trim()
      ? params.modalidade
      : undefined
  const dados = await listarRankingOfensivas({
    alunoAtualId: alunoId,
    modalidadeId: modalidadeSolicitada,
  })
  const modalidadeSelecionada = dados.modalidades.find(
    (modalidade) => modalidade.id === dados.modalidadeId,
  )
  const referenciaPessoal = dados.linhaAlunoGeral

  return (
    <div className="space-y-5">
      <header>
        <div className="flex items-center gap-2">
          <Flame className="size-6 text-orange-500" aria-hidden="true" />
          <h1 className="text-xl font-bold tracking-tight">Ofensivas de treino</h1>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          Seu maior recorde permanece no ranking mesmo quando uma nova sequência começa.
        </p>
      </header>

      <Card className="overflow-hidden border-orange-500/30 bg-gradient-to-br from-orange-500/10 via-card to-card">
        <CardContent className="grid gap-4 sm:grid-cols-[1fr_auto] sm:items-center">
          <div>
            <p className="text-sm font-medium text-muted-foreground">Sua maior ofensiva</p>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-4xl font-black tabular-nums text-orange-600">
                {referenciaPessoal?.maximoDias ?? 0}
              </span>
              <span className="font-semibold">
                {(referenciaPessoal?.maximoDias ?? 0) === 1 ? "dia" : "dias"}
              </span>
            </div>
            <p className="mt-2 text-sm text-muted-foreground">
              {referenciaPessoal?.modalidadeNome
                ? `${referenciaPessoal.modalidadeNome} · ofensiva atual de ${rotuloDias(referenciaPessoal.diasAtuais)}`
                : "Faça seu primeiro check-in para começar."}
            </p>
          </div>
          <div className="rounded-lg border border-orange-500/25 bg-card/80 px-5 py-3 text-center">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Posição geral</p>
            <p className="mt-1 text-3xl font-black tabular-nums">
              {referenciaPessoal ? `${referenciaPessoal.posicao}º` : "—"}
            </p>
          </div>
        </CardContent>
      </Card>

      {dados.estadosAluno.length > 0 && (
        <section className="space-y-3" aria-labelledby="minhas-ofensivas">
          <h2 id="minhas-ofensivas" className="font-semibold">
            Minhas ofensivas por modalidade
          </h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {dados.estadosAluno.map((estado) => (
              <Card key={estado.modalidadeId}>
                <CardContent className="flex items-center justify-between gap-4 py-4">
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{estado.modalidadeNome}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Recorde: {rotuloDias(estado.maximoDias)}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5 text-orange-600">
                    <Flame className="size-5" aria-hidden="true" />
                    <span className="text-2xl font-black tabular-nums">{estado.diasAtuais}</span>
                    <span className="text-xs font-medium">
                      {estado.diasAtuais === 1 ? "dia" : "dias"}
                    </span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      )}

      <section className="space-y-3" aria-labelledby="ranking-academia">
        <div>
          <div className="flex items-center gap-2">
            <Trophy className="size-5 text-primary" aria-hidden="true" />
            <h2 id="ranking-academia" className="font-semibold">
              {modalidadeSelecionada
                ? `Ranking de ${modalidadeSelecionada.nome}`
                : "Ranking geral da academia"}
            </h2>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            A classificação usa a maior ofensiva histórica. Empates de recorde compartilham a
            posição.
          </p>
        </div>

        <nav
          aria-label="Filtrar ranking por modalidade"
          className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1"
        >
          <Link
            href="/aluno/ranking"
            aria-current={!dados.modalidadeId ? "page" : undefined}
            className={cn(
              "inline-flex min-h-11 shrink-0 items-center rounded-full border px-4 text-sm font-medium transition-colors",
              !dados.modalidadeId
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-card hover:bg-muted",
            )}
          >
            Geral
          </Link>
          {dados.modalidades.map((modalidade) => (
            <Link
              key={modalidade.id}
              href={`/aluno/ranking?modalidade=${encodeURIComponent(modalidade.id)}`}
              aria-current={dados.modalidadeId === modalidade.id ? "page" : undefined}
              className={cn(
                "inline-flex min-h-11 shrink-0 items-center rounded-full border px-4 text-sm font-medium transition-colors",
                dados.modalidadeId === modalidade.id
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-card hover:bg-muted",
              )}
            >
              {modalidade.nome}
            </Link>
          ))}
        </nav>

        {dados.linhaAlunoAtual && modalidadeSelecionada && (
          <div className="flex items-center justify-between rounded-md border border-primary/40 bg-primary/5 px-4 py-3 text-sm">
            <span>Sua posição em {modalidadeSelecionada.nome}</span>
            <strong className="tabular-nums">{dados.linhaAlunoAtual.posicao}º lugar</strong>
          </div>
        )}

        <div className="space-y-2">
          {dados.ranking.map((linha) => {
            const alunoAtual = linha.alunoId === alunoId
            return (
              <Card key={linha.alunoId} className={cn(alunoAtual && "border-primary bg-primary/5")}>
                <CardContent className="grid grid-cols-[auto_1fr_auto] items-center gap-3 py-3">
                  <span
                    className={cn(
                      "flex size-9 items-center justify-center rounded-full text-sm font-bold tabular-nums",
                      corPosicao(linha.posicao),
                    )}
                  >
                    {linha.posicao <= 3 ? (
                      <>
                        <Medal className="size-4" aria-hidden="true" />
                        <span className="sr-only">{linha.posicao}º lugar</span>
                      </>
                    ) : (
                      linha.posicao
                    )}
                  </span>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="truncate font-semibold">{linha.nome}</p>
                      {alunoAtual && <Badge variant="outline">Você</Badge>}
                    </div>
                    <p className="truncate text-xs text-muted-foreground">
                      {linha.modalidadeNome ?? "Sem modalidade ativa"} · atual de{" "}
                      {rotuloDias(linha.diasAtuais)}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 text-orange-600">
                    <Flame className="size-4" aria-hidden="true" />
                    <strong className="tabular-nums">{rotuloDias(linha.maximoDias)}</strong>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>

        {dados.ranking.length === 0 && (
          <Card>
            <CardContent className="py-8 text-center text-sm text-muted-foreground">
              Ainda não há alunos vinculados a este ranking.
            </CardContent>
          </Card>
        )}
      </section>

      <p className="text-xs leading-relaxed text-muted-foreground">
        Os dias são corridos desde o início da sequência, não a quantidade de check-ins. Um dia sem
        check-in válido de ninguém na modalidade não quebra nenhuma ofensiva.
      </p>
    </div>
  )
}

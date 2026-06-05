import { Flag, Target, Trophy } from "lucide-react"
import type { ReactNode } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { exigirAluno } from "@/lib/auth/dal"
import { MARCOS_HORAS, resumoHoras } from "@/lib/services/horas.service"
import { cn } from "@/lib/utils"
import { minutosParaHoras } from "@/lib/utils/datas"

export const dynamic = "force-dynamic"

const MARCOS_TRILHA = [0, ...MARCOS_HORAS] as const

const CORES_MODALIDADE = [
  "bg-primary",
  "bg-success",
  "bg-warning",
  "bg-foreground",
  "bg-accent-foreground",
  "bg-muted-foreground",
] as const

export default async function AlunoHoras() {
  const { alunoId } = await exigirAluno()
  const resumo = await resumoHoras(alunoId)
  const totalHoras = minutosParaHoras(resumo.totalGeralMin)
  const pct = Math.round(resumo.progresso * 100)
  const proximoMarco = resumo.proximoMarcoHoras
  const faltamParaProximo =
    proximoMarco !== null ? Math.max(0, proximoMarco * 60 - resumo.totalGeralMin) : 0
  const proximosMarcos = MARCOS_HORAS.filter((marco) => marco > totalHoras).slice(0, 4)

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold tracking-tight">Minhas horas</h1>
        <p className="text-sm text-muted-foreground">
          Sua evolução por marcos, modalidades e jornada das 10 mil horas.
        </p>
      </div>

      <Card className="overflow-hidden">
        <CardHeader className="border-b border-border bg-card">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <CardTitle>Jornada das 10.000 horas</CardTitle>
              <CardDescription>
                O grande marco continua no fim da trilha; o próximo marco intermediário mostra a
                conquista mais próxima.
              </CardDescription>
            </div>
            <div className="inline-flex w-fit items-center gap-2 rounded-md border border-border bg-background px-3 py-2 text-sm font-medium">
              <Trophy className="size-4 text-primary" aria-hidden="true" />
              <span className="tabular-nums">{pct}%</span>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-5 pt-5">
          <div className="grid gap-3 sm:grid-cols-3">
            <Indicador rotulo="Total treinado" valor={`${formatarNumero(totalHoras)}h`} />
            <Indicador
              rotulo="Próximo marco"
              valor={proximoMarco !== null ? `${formatarNumero(proximoMarco)}h` : "Concluído"}
            />
            <Indicador
              rotulo="Faltam para o próximo"
              valor={
                proximoMarco !== null
                  ? `${formatarNumero(minutosParaHoras(faltamParaProximo))}h`
                  : "0h"
              }
            />
          </div>

          <div className="space-y-3">
            <div className="relative pb-14 pt-6 sm:pb-12 sm:pt-7">
              <div className="relative h-4 rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-primary transition-all"
                  style={{ width: `${percentualNaTrilha(totalHoras)}%` }}
                />
                {proximoMarco !== null && (
                  <MarcadorTrilha
                    icone={<Flag className="size-3.5" aria-hidden="true" />}
                    percent={percentualNaTrilha(proximoMarco)}
                    rotulo="Próximo marco"
                    valor={`${formatarNumero(proximoMarco)}h`}
                    variant="primary"
                  />
                )}
                <MarcadorTrilha
                  icone={<Target className="size-3.5" aria-hidden="true" />}
                  percent={100}
                  rotulo="Grande marco"
                  valor="10.000h"
                  variant="dark"
                />
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              {proximosMarcos.map((marco) => (
                <span
                  key={marco}
                  className="rounded-md border border-border bg-background px-2.5 py-1 text-xs font-medium text-muted-foreground"
                >
                  {formatarNumero(marco)}h
                </span>
              ))}
              {proximosMarcos.length === 0 && (
                <span className="rounded-md border border-border bg-background px-2.5 py-1 text-xs font-medium text-muted-foreground">
                  Todos os marcos intermediários foram alcançados.
                </span>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Marcadores por modalidade</CardTitle>
          <CardDescription>
            Cada modalidade tem sua própria trilha até o próximo marco intermediário.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {resumo.porModalidade.length === 0 && (
            <p className="text-sm text-muted-foreground">
              Nenhuma modalidade vinculada ao seu perfil ainda.
            </p>
          )}
          {resumo.porModalidade.map((modalidade, index) => {
            const horas = minutosParaHoras(modalidade.minutos)
            const proximo = modalidade.proximoMarcoHoras
            const cor = CORES_MODALIDADE[index % CORES_MODALIDADE.length]

            return (
              <div key={modalidade.modalidadeId} className="rounded-md border border-border p-3">
                <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center gap-2">
                    <span className={cn("size-2.5 rounded-full", cor)} aria-hidden="true" />
                    <p className="font-medium">{modalidade.nome}</p>
                  </div>
                  <p className="text-sm tabular-nums text-muted-foreground">
                    {formatarNumero(horas)}h
                    {proximo !== null ? ` / marco ${formatarNumero(proximo)}h` : " / 10.000h"}
                  </p>
                </div>
                <div className="mt-3 space-y-2">
                  <div className="relative h-2.5 rounded-full bg-muted">
                    <div
                      className={cn("h-full rounded-full transition-all", cor)}
                      style={{ width: `${percentualAteMarco(modalidade.minutos, proximo)}%` }}
                    />
                    <span
                      className={cn(
                        "-top-1 absolute h-4 w-1.5 rounded-full shadow-sm ring-2 ring-card",
                        cor,
                      )}
                      style={{
                        left: `${posicaoMarcador(percentualAteMarco(modalidade.minutos, proximo))}%`,
                      }}
                    />
                  </div>
                  <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
                    <span className="tabular-nums">{formatarNumero(horas)}h treinadas</span>
                    <span className="tabular-nums">
                      {proximo !== null
                        ? `${formatarNumero(minutosParaHoras(Math.max(0, proximo * 60 - modalidade.minutos)))}h restantes`
                        : "Marco maior alcançado"}
                    </span>
                  </div>
                </div>
              </div>
            )
          })}
        </CardContent>
      </Card>
    </div>
  )
}

function Indicador({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="rounded-md border border-border bg-background p-3">
      <p className="text-xs font-medium text-muted-foreground">{rotulo}</p>
      <p className="mt-1 text-2xl font-bold tabular-nums">{valor}</p>
    </div>
  )
}

function MarcadorTrilha({
  icone,
  percent,
  rotulo,
  valor,
  variant,
}: {
  icone: ReactNode
  percent: number
  rotulo: string
  valor: string
  variant: "primary" | "dark"
}) {
  return (
    <div
      className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2"
      style={{ left: `${posicaoMarcador(percent)}%` }}
    >
      <div
        className={cn(
          "flex size-8 items-center justify-center rounded-full shadow-sm ring-4 ring-card",
          variant === "primary"
            ? "bg-primary text-primary-foreground"
            : "bg-foreground text-background",
        )}
      >
        {icone}
      </div>
      <div className={cn("absolute top-9 w-24 sm:top-10 sm:w-28", classeLegendaMarcador(percent))}>
        <p className="text-[0.68rem] font-medium leading-tight text-foreground">{rotulo}</p>
        <p className="text-[0.68rem] leading-tight text-muted-foreground">{valor}</p>
      </div>
    </div>
  )
}

function percentualNaTrilha(horas: number): number {
  if (horas <= 0) return 0

  for (let i = 1; i < MARCOS_TRILHA.length; i++) {
    const anterior = MARCOS_TRILHA[i - 1]
    const atual = MARCOS_TRILHA[i]

    if (horas <= atual) {
      const inicioSegmento = ((i - 1) / (MARCOS_TRILHA.length - 1)) * 100
      const tamanhoSegmento = 100 / (MARCOS_TRILHA.length - 1)
      const progressoSegmento = (horas - anterior) / (atual - anterior)

      return limitarPct(inicioSegmento + progressoSegmento * tamanhoSegmento)
    }
  }

  return 100
}

function percentualAteMarco(minutos: number, proximoMarcoHoras: number | null): number {
  if (proximoMarcoHoras === null) return 100
  if (minutos <= 0) return 0
  return limitarPct((minutos / (proximoMarcoHoras * 60)) * 100)
}

function limitarPct(percent: number): number {
  return Math.min(100, Math.max(0, percent))
}

function posicaoMarcador(percent: number): number {
  return Math.min(96, Math.max(4, limitarPct(percent)))
}

function classeLegendaMarcador(percent: number): string {
  if (percent <= 12) return "left-0 text-left"
  if (percent >= 88) return "right-0 text-right"
  return "left-1/2 -translate-x-1/2 text-center"
}

function formatarNumero(valor: number): string {
  return valor.toLocaleString("pt-BR")
}

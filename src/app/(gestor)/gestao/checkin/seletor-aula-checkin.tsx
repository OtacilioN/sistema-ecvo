"use client"

import { CalendarClock } from "lucide-react"
import Form from "next/form"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select } from "@/components/ui/select"
import { cn } from "@/lib/utils"

export type OpcaoAulaCheckin = {
  id: string
  rotulo: string
  horario: string
  detalhe: string
  estado: "em_andamento" | "proxima" | "encerrada" | "cancelada"
}

const rotuloEstado: Record<OpcaoAulaCheckin["estado"], string> = {
  em_andamento: "Agora",
  proxima: "Próxima",
  encerrada: "Encerrada",
  cancelada: "Cancelada",
}

export function SeletorAulaCheckin({
  aulas,
  aulaSelecionadaId,
  dataSelecionada,
  dataHoje,
  dataOntem,
}: {
  aulas: OpcaoAulaCheckin[]
  aulaSelecionadaId: string | null
  dataSelecionada: string
  dataHoje: string
  dataOntem: string
}) {
  const router = useRouter()

  return (
    <div className="grid gap-3">
      <Form action="/gestao/checkin" className="grid gap-2" scroll={false}>
        <label className="text-xs font-semibold uppercase text-muted-foreground" htmlFor="data">
          Data da aula
        </label>
        <div className="flex gap-2">
          <Input
            key={dataSelecionada}
            id="data"
            name="data"
            type="date"
            defaultValue={dataSelecionada}
            required
            className="h-11 min-w-0 flex-1 bg-white"
          />
          <Button type="submit" className="h-11">
            Consultar
          </Button>
        </div>
      </Form>
      <div className="flex gap-2">
        <Button asChild size="sm" variant={dataSelecionada === dataHoje ? "default" : "outline"}>
          <Link href={`/gestao/checkin?data=${dataHoje}`} scroll={false}>
            Hoje
          </Link>
        </Button>
        <Button asChild size="sm" variant={dataSelecionada === dataOntem ? "default" : "outline"}>
          <Link href={`/gestao/checkin?data=${dataOntem}`} scroll={false}>
            Ontem
          </Link>
        </Button>
      </div>
      <label className="text-xs font-semibold uppercase text-muted-foreground" htmlFor="aulaId">
        Aula visualizada
      </label>
      <Select
        id="aulaId"
        value={aulaSelecionadaId ?? ""}
        onChange={(event) => {
          const aulaId = event.target.value
          if (aulaId) {
            router.push(
              `/gestao/checkin?data=${dataSelecionada}&aulaId=${encodeURIComponent(aulaId)}`,
              { scroll: false },
            )
          }
        }}
        className="h-11 bg-white font-medium"
        disabled={aulas.length === 0}
      >
        {aulas.length === 0 ? (
          <option value="">Nenhuma aula nesta data</option>
        ) : (
          aulas.map((aula) => (
            <option key={aula.id} value={aula.id}>
              {aula.horario} - {aula.rotulo}
            </option>
          ))
        )}
      </Select>

      {aulas.length > 0 && (
        <div className="hidden max-w-full gap-2 overflow-x-auto pb-1 lg:flex">
          {aulas.map((aula) => {
            const selecionada = aula.id === aulaSelecionadaId
            return (
              <Link
                key={aula.id}
                href={`/gestao/checkin?data=${dataSelecionada}&aulaId=${encodeURIComponent(aula.id)}`}
                scroll={false}
                className={cn(
                  "flex min-w-56 shrink-0 items-center gap-3 rounded-md border bg-white px-3 py-2 text-left shadow-sm transition-colors hover:border-foreground/30",
                  selecionada && "border-foreground bg-foreground text-background",
                )}
              >
                <CalendarClock className="size-4 shrink-0" />
                <span className="min-w-0">
                  <span className="flex items-center gap-2 text-sm font-semibold">
                    {aula.horario}
                    <span
                      className={cn(
                        "rounded-full px-2 py-0.5 text-[10px] font-bold uppercase",
                        selecionada ? "bg-background/15" : "bg-muted text-muted-foreground",
                      )}
                    >
                      {rotuloEstado[aula.estado]}
                    </span>
                  </span>
                  <span
                    className={cn(
                      "block truncate text-xs",
                      selecionada ? "text-background/75" : "text-muted-foreground",
                    )}
                  >
                    {aula.rotulo} · {aula.detalhe}
                  </span>
                </span>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}

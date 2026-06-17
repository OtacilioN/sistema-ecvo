"use client"

import { CalendarClock } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
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
}: {
  aulas: OpcaoAulaCheckin[]
  aulaSelecionadaId: string | null
}) {
  const router = useRouter()

  return (
    <div className="grid gap-3">
      <label className="text-xs font-semibold uppercase text-muted-foreground" htmlFor="aulaId">
        Aula visualizada
      </label>
      <Select
        id="aulaId"
        value={aulaSelecionadaId ?? ""}
        onChange={(event) => {
          const aulaId = event.target.value
          if (aulaId) router.push(`/gestao/checkin?aulaId=${encodeURIComponent(aulaId)}`)
        }}
        className="h-11 bg-white font-medium"
        disabled={aulas.length === 0}
      >
        {aulas.length === 0 ? (
          <option value="">Nenhuma aula hoje</option>
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
                href={`/gestao/checkin?aulaId=${encodeURIComponent(aula.id)}`}
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

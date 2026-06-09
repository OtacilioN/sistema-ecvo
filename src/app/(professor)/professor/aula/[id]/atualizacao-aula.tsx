"use client"

import { RefreshCw } from "lucide-react"
import { useRouter } from "next/navigation"
import { useCallback, useEffect, useState, useTransition } from "react"
import { Button } from "@/components/ui/button"
import { formatarHora } from "@/lib/utils/datas"

export function AtualizacaoAula({ intervaloMs = 5000 }: { intervaloMs?: number }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [ultimaAtualizacao, setUltimaAtualizacao] = useState(() => new Date())

  const atualizar = useCallback(() => {
    startTransition(() => {
      router.refresh()
      setUltimaAtualizacao(new Date())
    })
  }, [router])

  useEffect(() => {
    const id = window.setInterval(atualizar, intervaloMs)
    return () => window.clearInterval(id)
  }, [atualizar, intervaloMs])

  return (
    <div className="flex flex-wrap items-center justify-end gap-2 text-xs text-muted-foreground">
      <span>Atualizado às {formatarHora(ultimaAtualizacao)}</span>
      <Button type="button" variant="outline" size="sm" onClick={atualizar} disabled={isPending}>
        <RefreshCw className={isPending ? "animate-spin" : undefined} />
        Atualizar
      </Button>
    </div>
  )
}

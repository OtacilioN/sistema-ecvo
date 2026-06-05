import { Hammer } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"

/** Placeholder para módulos ainda não implementados (build incremental por fases). */
export function EmConstrucao({ titulo, descricao }: { titulo: string; descricao?: string }) {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold tracking-tight">{titulo}</h1>
      <Card>
        <CardContent className="flex items-center gap-4 py-10 text-muted-foreground">
          <Hammer className="size-6 shrink-0" />
          <div>
            <p className="font-medium text-foreground">Módulo em construção</p>
            <p className="text-sm">
              {descricao ?? "Esta funcionalidade será entregue em uma próxima fase."}
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

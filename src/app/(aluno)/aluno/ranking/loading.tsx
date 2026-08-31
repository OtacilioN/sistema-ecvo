import { Card, CardContent } from "@/components/ui/card"

export default function LoadingRanking() {
  return (
    <div
      className="space-y-5"
      role="status"
      aria-busy="true"
      aria-label="Carregando ranking de ofensivas"
    >
      <div className="space-y-2">
        <div className="h-7 w-56 animate-pulse rounded bg-muted" />
        <div className="h-4 w-full max-w-md animate-pulse rounded bg-muted" />
      </div>
      <Card>
        <CardContent className="space-y-3">
          <div className="h-4 w-40 animate-pulse rounded bg-muted" />
          <div className="h-10 w-28 animate-pulse rounded bg-muted" />
        </CardContent>
      </Card>
      <div className="space-y-2">
        {["um", "dois", "tres", "quatro", "cinco"].map((item) => (
          <div key={item} className="h-16 animate-pulse rounded-lg border bg-muted/60" />
        ))}
      </div>
    </div>
  )
}

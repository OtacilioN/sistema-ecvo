import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

export default function Loading() {
  return (
    <Card className="w-full max-w-xl" aria-busy="true">
      <CardHeader>
        <CardTitle>Matrícula trancada</CardTitle>
      </CardHeader>
      <CardContent>
        <p role="status" className="text-sm text-muted-foreground">
          Preparando a mensalidade e o QR Code para reativar seu acesso…
        </p>
      </CardContent>
    </Card>
  )
}

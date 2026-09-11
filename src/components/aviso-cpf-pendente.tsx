import { ArrowRight, IdCard } from "lucide-react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { cpfValido } from "@/lib/utils/formato"

type DadosResponsavelFinanceiro = {
  cpf: string | null
  responsavelFinanceiro: boolean
} | null

export function AvisoCpfPendente({
  cpf,
  responsavel,
}: {
  cpf: string | null
  responsavel: DadosResponsavelFinanceiro
}) {
  const usaResponsavelFinanceiro = responsavel?.responsavelFinanceiro === true
  const cpfPagador = usaResponsavelFinanceiro ? responsavel.cpf : cpf

  if (cpfPagador && cpfValido(cpfPagador)) return null

  return (
    <Card
      role="alert"
      className="relative overflow-hidden border-warning/40 bg-warning/5 shadow-none before:absolute before:inset-y-0 before:left-0 before:w-1 before:bg-warning"
    >
      <CardContent className="flex flex-col gap-4 py-4 pl-5 sm:flex-row sm:items-center sm:justify-between sm:py-5 sm:pl-6">
        <div className="flex min-w-0 gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-warning/15 text-warning">
            <IdCard className="size-5" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <p className="font-semibold">CPF necessário para liberar pagamentos</p>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
              {usaResponsavelFinanceiro
                ? "Informe um CPF válido para o responsável financeiro antes de gerar o PIX da mensalidade."
                : "Complete seu cadastro com um CPF válido antes de gerar o PIX da mensalidade."}
            </p>
          </div>
        </div>
        <Button asChild variant="outline" className="shrink-0 bg-background/80">
          <Link href="/aluno/perfil?editar=dados">
            Preencher CPF
            <ArrowRight aria-hidden="true" />
          </Link>
        </Button>
      </CardContent>
    </Card>
  )
}

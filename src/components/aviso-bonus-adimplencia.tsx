import { DIAS_CARENCIA_ADIMPLENCIA } from "@/lib/financeiro/adimplencia"
import { cn } from "@/lib/utils"
import { formatarBRL } from "@/lib/utils/formato"

export function AvisoBonusAdimplencia({
  valorComBonus,
  valorBase,
  totalFamilia = false,
  className,
}: {
  valorComBonus: number
  valorBase: number
  totalFamilia?: boolean
  className?: string
}) {
  if (valorBase <= valorComBonus) return null

  return (
    <p className={cn("text-xs leading-relaxed text-muted-foreground", className)}>
      {totalFamilia ? "Total mensal" : "Mensalidade"} com bônus de adimplência. A partir do{" "}
      {DIAS_CARENCIA_ADIMPLENCIA + 1}º dia de atraso:{" "}
      <span className="font-medium text-foreground">{formatarBRL(valorBase)}/mês</span>.
    </p>
  )
}

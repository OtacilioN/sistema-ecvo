import Image from "next/image"
import { cn } from "@/lib/utils"

/** Logo + nome da ECVO. */
export function Marca({
  tamanho = 48,
  comTexto = true,
  className,
}: {
  tamanho?: number
  comTexto?: boolean
  className?: string
}) {
  return (
    <div className={cn("flex items-center gap-3", className)}>
      <Image
        src="/logo.jpeg"
        alt="ECVO"
        width={tamanho}
        height={tamanho}
        priority
        className="rounded-md"
      />
      {comTexto && (
        <div className="leading-tight">
          <span className="block text-lg font-bold tracking-tight">ECVO</span>
          <span className="block text-xs text-muted-foreground">Escola de Combate</span>
        </div>
      )}
    </div>
  )
}

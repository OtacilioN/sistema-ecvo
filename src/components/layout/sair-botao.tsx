import { LogOut } from "lucide-react"
import { sair } from "@/app/actions/auth"
import { Button } from "@/components/ui/button"

export function SairBotao() {
  return (
    <form action={sair}>
      <Button type="submit" variant="ghost" size="sm" aria-label="Sair">
        <LogOut />
        <span className="hidden sm:inline">Sair</span>
      </Button>
    </form>
  )
}

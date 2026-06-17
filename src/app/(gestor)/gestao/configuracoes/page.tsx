import { ShieldCheck } from "lucide-react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { CabecalhoPagina } from "@/components/ui/cabecalho-pagina"
import { exigirGestao } from "@/lib/auth/dal"
import { obterConfiguracaoAcademia } from "@/lib/services/configuracao.service"
import { FormConfiguracao } from "./form-configuracao"

export const dynamic = "force-dynamic"

export default async function Page() {
  const usuario = await exigirGestao()
  const configuracao = await obterConfiguracaoAcademia()
  const configuracaoSerializada = {
    ...configuracao,
    valorBaseModalidade: Number(configuracao.valorBaseModalidade),
  }

  return (
    <div className="space-y-6">
      <CabecalhoPagina
        titulo="Configurações"
        descricao="Regras de agendamento, check-in, financeiro e notificações."
      >
        <Button asChild variant="outline">
          <Link href="/gestao/auditoria">
            <ShieldCheck className="size-4" /> Ver auditoria
          </Link>
        </Button>
      </CabecalhoPagina>

      <FormConfiguracao
        configuracao={configuracaoSerializada}
        somenteLeitura={usuario.papel !== "GESTOR"}
      />
    </div>
  )
}

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
        descricao="Regras de comparecimento, check-in, financeiro e notificações."
      />

      <FormConfiguracao
        configuracao={configuracaoSerializada}
        somenteLeitura={usuario.papel !== "GESTOR"}
      />
    </div>
  )
}

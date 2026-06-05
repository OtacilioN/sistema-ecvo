import { CabecalhoPagina } from "@/components/ui/cabecalho-pagina"
import { exigirPapel } from "@/lib/auth/dal"
import { obterConfiguracaoAcademia } from "@/lib/services/configuracao.service"
import { FormConfiguracao } from "./form-configuracao"

export const dynamic = "force-dynamic"

export default async function Page() {
  await exigirPapel("GESTOR")
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

      <FormConfiguracao configuracao={configuracaoSerializada} />
    </div>
  )
}

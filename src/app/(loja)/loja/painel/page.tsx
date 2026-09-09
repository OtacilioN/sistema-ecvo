import { ArrowRight, CircleDollarSign, PackageCheck, ShieldCheck, Store } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { exigirLoja } from "@/lib/auth/dal"
import { obterContaAsaasLoja } from "@/lib/services/conta-asaas-loja.service"
import { obterResumoLoja } from "@/lib/services/loja-pagamento.service"
import { formatarDataCivilInput } from "@/lib/utils/datas"
import { formatarBRL, formatarCPF } from "@/lib/utils/formato"
import { FormContaAsaasLoja } from "./form-conta-asaas-loja"

export const dynamic = "force-dynamic"

export default async function PainelLojaPage() {
  const usuario = await exigirLoja()
  const [conta, resumo] = await Promise.all([obterContaAsaasLoja(), obterResumoLoja()])

  return (
    <div className="space-y-6">
      <section className="relative overflow-hidden rounded-xl border border-foreground/10 bg-foreground px-5 py-7 text-background shadow-sm sm:px-7">
        <div className="absolute -right-12 -top-12 size-44 rounded-full border border-background/10" />
        <div className="absolute -bottom-16 right-20 size-36 rounded-full bg-amber-400/10 blur-2xl" />
        <div className="relative max-w-3xl space-y-3">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-amber-300">
            <Store className="size-4" /> Operação comercial isolada
          </div>
          <h1 className="text-balance text-3xl font-bold tracking-tight sm:text-4xl">ECVO Loja</h1>
          <p className="max-w-2xl text-pretty text-sm leading-relaxed text-background/70 sm:text-base">
            Pedidos, cobranças e repasses da loja vivem aqui. Nada deste painel entra no
            faturamento, nos pagamentos avulsos ou nos relatórios financeiros da escola.
          </p>
        </div>
      </section>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Metrica
          titulo="Faturamento recebido"
          valor={formatarBRL(resumo.faturamentoRecebido)}
          icone={CircleDollarSign}
        />
        <Metrica titulo="Pedidos" valor={String(resumo.pedidos)} icone={PackageCheck} />
        <Metrica
          titulo="Aguardando ação"
          valor={String(resumo.pedidosPendentes)}
          icone={ArrowRight}
        />
        <Metrica
          titulo="Destino do líquido"
          valor="100%"
          detalhe="wallet da loja"
          icone={ShieldCheck}
        />
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <CardTitle>Subconta Asaas da loja</CardTitle>
            <Badge variant="outline">Titular: Otacilio Maia</Badge>
          </div>
        </CardHeader>
        <CardContent>
          <FormContaAsaasLoja
            ehGestor={usuario.papel === "GESTOR"}
            dados={{
              nomeTitular: conta?.nomeTitular ?? "Otacilio Maia",
              emailContaAsaas: conta?.emailContaAsaas ?? "",
              cpfCnpj: formatarCPF(conta?.cpfCnpj ?? ""),
              dataNascimento: conta?.dataNascimento
                ? formatarDataCivilInput(conta.dataNascimento)
                : "",
              celular: conta?.celular ?? "",
              rendaMensal: conta?.rendaMensal.toString() ?? "",
              logradouro: conta?.logradouro ?? "",
              numeroEndereco: conta?.numeroEndereco ?? "",
              complemento: conta?.complemento ?? "",
              bairro: conta?.bairro ?? "",
              cep: conta?.cep ?? "",
              status: conta?.status ?? null,
              walletFinal: conta?.walletId?.slice(-6) ?? null,
              ultimoErro: conta?.ultimoErro ?? null,
            }}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Pedidos recentes</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {resumo.recentes.length === 0 ? (
            <div className="px-5 py-10 text-center text-sm text-muted-foreground">
              Nenhum pedido da loja registrado. A futura vitrine pública poderá gravar seus pedidos
              neste domínio sem tocar nas tabelas financeiras da escola.
            </div>
          ) : (
            <div className="divide-y divide-border">
              {resumo.recentes.map((pedido) => (
                <div
                  key={pedido.id}
                  className="grid gap-2 px-5 py-4 sm:grid-cols-[1fr_auto_auto] sm:items-center sm:gap-5"
                >
                  <div>
                    <p className="font-medium">{pedido.descricao}</p>
                    <p className="font-mono text-xs text-muted-foreground">{pedido.referencia}</p>
                  </div>
                  <Badge variant={pedido.status === "PAGO" ? "success" : "outline"}>
                    {pedido.status.replaceAll("_", " ")}
                  </Badge>
                  <span className="text-right font-semibold tabular-nums">
                    {formatarBRL(Number(pedido.valorTotal))}
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <p className="text-xs leading-relaxed text-muted-foreground">
        “100%” corresponde a 100% do valor líquido da cobrança, após as taxas do Asaas. A cobrança
        permanece emitida pela conta principal quando este modelo de split é usado.
      </p>
    </div>
  )
}

function Metrica({
  titulo,
  valor,
  detalhe,
  icone: Icone,
}: {
  titulo: string
  valor: string
  detalhe?: string
  icone: typeof Store
}) {
  return (
    <Card>
      <CardContent className="flex items-start justify-between gap-3 pt-5">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {titulo}
          </p>
          <p className="mt-2 text-2xl font-bold tabular-nums">{valor}</p>
          {detalhe && <p className="mt-1 text-xs text-muted-foreground">{detalhe}</p>}
        </div>
        <span className="rounded-md bg-amber-500/10 p-2 text-amber-700 dark:text-amber-300">
          <Icone className="size-4" />
        </span>
      </CardContent>
    </Card>
  )
}

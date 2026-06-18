import type { Metadata } from "next"
import { Marca } from "@/components/marca"
import { BotaoInstalarApp } from "@/components/pwa-install-button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { LoginForm } from "./login-form"

export const metadata: Metadata = { title: "Entrar" }

export default async function LoginPage({
  searchParams,
}: {
  searchParams?: Promise<{ motivo?: string | string[] }>
}) {
  const params = await searchParams
  const motivo = Array.isArray(params?.motivo) ? params?.motivo[0] : params?.motivo
  const mensagemInicial =
    motivo === "matricula-cancelada" ? "Matrícula cancelada. Procure a gestão." : undefined

  return (
    <div className="w-full max-w-sm">
      <div className="mb-6 flex justify-center">
        <Marca tamanho={56} />
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="text-xl">Acessar o sistema</CardTitle>
          <CardDescription>Entre com seu e-mail e senha.</CardDescription>
        </CardHeader>
        <CardContent>
          <LoginForm mensagemInicial={mensagemInicial} />
        </CardContent>
      </Card>
      <div className="mt-4 flex justify-center">
        <BotaoInstalarApp rotuloSempreVisivel />
      </div>
    </div>
  )
}

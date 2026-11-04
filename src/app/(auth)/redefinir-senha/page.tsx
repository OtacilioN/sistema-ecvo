import type { Metadata } from "next"
import Link from "next/link"
import { Marca } from "@/components/marca"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { RedefinirSenhaForm } from "./redefinir-senha-form"

export const metadata: Metadata = {
  title: "Redefinir senha",
  robots: { index: false, follow: false },
}

export default async function RedefinirSenhaPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string | string[] }>
}) {
  const { token } = await searchParams
  const tokenUnico = typeof token === "string" ? token : ""

  return (
    <div className="w-full max-w-sm">
      <div className="mb-6 flex justify-center">
        <Marca tamanho={56} />
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="text-xl">Redefinir senha</CardTitle>
          <CardDescription>Escolha uma nova senha para acessar sua conta.</CardDescription>
        </CardHeader>
        <CardContent>
          {tokenUnico ? (
            <RedefinirSenhaForm token={tokenUnico} />
          ) : (
            <p className="text-sm text-destructive" role="alert">
              Link inválido. Solicite uma nova recuperação de senha.
            </p>
          )}
        </CardContent>
      </Card>
      <p className="mt-4 text-center text-sm">
        <Link href="/esqueci-senha" className="font-medium text-primary hover:underline">
          Solicitar outro link
        </Link>
      </p>
      <p className="mt-3 text-center text-sm">
        <Link href="/login" className="font-medium text-primary hover:underline">
          Voltar para o login
        </Link>
      </p>
    </div>
  )
}

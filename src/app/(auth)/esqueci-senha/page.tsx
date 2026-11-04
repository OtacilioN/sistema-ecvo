import type { Metadata } from "next"
import Link from "next/link"
import { Marca } from "@/components/marca"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { EsqueciSenhaForm } from "./esqueci-senha-form"

export const metadata: Metadata = { title: "Recuperar senha" }

export default function EsqueciSenhaPage() {
  return (
    <div className="w-full max-w-sm">
      <div className="mb-6 flex justify-center">
        <Marca tamanho={56} />
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="text-xl">Recuperar senha</CardTitle>
          <CardDescription>
            Informe o e-mail cadastrado para receber as instruções de recuperação.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <EsqueciSenhaForm />
        </CardContent>
      </Card>
      <p className="mt-4 text-center text-sm">
        <Link href="/login" className="font-medium text-primary hover:underline">
          Voltar para o login
        </Link>
      </p>
    </div>
  )
}

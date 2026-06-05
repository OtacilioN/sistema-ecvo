import type { Metadata } from "next"
import { Marca } from "@/components/marca"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { LoginForm } from "./login-form"

export const metadata: Metadata = { title: "Entrar" }

export default function LoginPage() {
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
          <LoginForm />
        </CardContent>
      </Card>
    </div>
  )
}

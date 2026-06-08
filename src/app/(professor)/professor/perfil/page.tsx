import { FormMinhaSenha } from "@/components/auth/form-minha-senha"
import { Badge } from "@/components/ui/badge"
import { CabecalhoPagina } from "@/components/ui/cabecalho-pagina"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { FormMinhaFoto } from "@/components/usuarios/form-foto-usuario"
import { exigirProfessor } from "@/lib/auth/dal"

export const dynamic = "force-dynamic"

export default async function PerfilProfessorPage() {
  const { usuario } = await exigirProfessor()

  return (
    <div className="space-y-6">
      <CabecalhoPagina titulo="Minha conta" descricao="Dados de acesso do usuário logado." />

      <div className="grid gap-4 lg:grid-cols-[0.8fr_1.2fr]">
        <Card>
          <CardHeader>
            <CardTitle>Conta</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Campo rotulo="Nome" valor={usuario.nome} />
            <Campo rotulo="E-mail" valor={usuario.email} />
            <Campo rotulo="Foto" valor={usuario.fotoUrl ? "Informada" : null} />
            <div>
              <p className="text-xs text-muted-foreground">Papel</p>
              <Badge className="mt-1" variant="outline">
                Professor
              </Badge>
            </div>
            <Campo rotulo="Status" valor={usuario.ativo ? "Ativo" : "Inativo"} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Foto do perfil</CardTitle>
          </CardHeader>
          <CardContent>
            <FormMinhaFoto usuario={usuario} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Senha de acesso</CardTitle>
          </CardHeader>
          <CardContent>
            <FormMinhaSenha />
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function Campo({ rotulo, valor }: { rotulo: string; valor: string | null }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{rotulo}</p>
      <p className="mt-1 font-medium">{valor ?? "Não informado"}</p>
    </div>
  )
}

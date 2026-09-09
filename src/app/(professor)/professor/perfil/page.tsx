import { FormMinhaSenha } from "@/components/auth/form-minha-senha"
import { Badge } from "@/components/ui/badge"
import { CabecalhoPagina } from "@/components/ui/cabecalho-pagina"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { FormMinhaFoto } from "@/components/usuarios/form-foto-usuario"
import { exigirProfessor } from "@/lib/auth/dal"
import { db } from "@/lib/db"
import { formatarDataCivilInput } from "@/lib/utils/datas"
import { formatarCPF } from "@/lib/utils/formato"
import { FormContaAsaasProfessor } from "./form-conta-asaas"

export const dynamic = "force-dynamic"

export default async function PerfilProfessorPage() {
  const { usuario, professorId } = await exigirProfessor()
  const professor = await db.professor.findUniqueOrThrow({
    where: { id: professorId },
    select: {
      cpf: true,
      telefone: true,
      usuario: { select: { dataNascimento: true } },
      contaAsaas: true,
    },
  })
  const conta = professor.contaAsaas

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

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Recebimento automático pelo Asaas</CardTitle>
          </CardHeader>
          <CardContent>
            <FormContaAsaasProfessor
              dados={{
                nomeTitular: conta?.nomeTitular ?? usuario.nome,
                emailContaAsaas: conta?.emailContaAsaas ?? "",
                cpfCnpj: formatarCPF(conta?.cpfCnpj ?? professor.cpf ?? ""),
                dataNascimento: conta?.dataNascimento
                  ? formatarDataCivilInput(conta.dataNascimento)
                  : professor.usuario.dataNascimento
                    ? formatarDataCivilInput(professor.usuario.dataNascimento)
                    : "",
                celular: conta?.celular ?? professor.telefone ?? "",
                rendaMensal: conta?.rendaMensal.toString() ?? "",
                logradouro: conta?.logradouro ?? "",
                numeroEndereco: conta?.numeroEndereco ?? "",
                complemento: conta?.complemento ?? "",
                bairro: conta?.bairro ?? "",
                cep: conta?.cep ?? "",
                status: conta?.status ?? null,
                walletFinal: conta?.walletId?.slice(-4) ?? null,
                ultimoErro: conta?.ultimoErro ?? null,
              }}
            />
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

"use client"

import { Camera, KeyRound, Pencil } from "lucide-react"
import { useState } from "react"
import { FormMinhaSenha } from "@/components/auth/form-minha-senha"
import { Button } from "@/components/ui/button"
import { Dialog } from "@/components/ui/dialog"
import { FormMinhaFoto } from "@/components/usuarios/form-foto-usuario"
import { FormMeusDadosAluno } from "./form-meus-dados-aluno"

type AlunoPerfil = {
  usuario: {
    nome: string
    email: string
  }
  cpf: string | null
  telefone: string | null
  dataNascimento: Date | null
  endereco: string | null
  contatoEmergencia: string | null
  restricoesMedicas: string | null
  responsavel: {
    nome: string
    cpf: string | null
    telefone: string | null
    email: string | null
    grauParentesco: string | null
    responsavelFinanceiro: boolean
  } | null
}

type UsuarioFoto = {
  id: string
  nome: string
  fotoUrl: string | null
}

type DialogoPerfil = "dados" | "foto" | "senha" | null

export function AcoesPerfilAluno({
  aluno,
  usuarioFoto,
}: {
  aluno: AlunoPerfil
  usuarioFoto: UsuarioFoto
}) {
  const [dialogo, setDialogo] = useState<DialogoPerfil>(null)

  return (
    <>
      <div className="grid gap-2 sm:grid-cols-3">
        <Button type="button" variant="outline" onClick={() => setDialogo("dados")}>
          <Pencil className="size-4" /> Editar dados
        </Button>
        <Button type="button" variant="outline" onClick={() => setDialogo("foto")}>
          <Camera className="size-4" /> Alterar foto
        </Button>
        <Button type="button" variant="outline" onClick={() => setDialogo("senha")}>
          <KeyRound className="size-4" /> Senha de acesso
        </Button>
      </div>

      <Dialog
        aberto={dialogo === "dados"}
        aoFechar={() => setDialogo(null)}
        titulo="Editar dados pessoais"
        descricao="Atualize seus dados de contato, emergência e responsável."
        variante="lateral"
      >
        <FormMeusDadosAluno aluno={aluno} />
      </Dialog>

      <Dialog
        aberto={dialogo === "foto"}
        aoFechar={() => setDialogo(null)}
        titulo="Alterar foto"
        descricao="Escolha a imagem que aparece no seu perfil."
      >
        <FormMinhaFoto usuario={{ ...usuarioFoto, papel: "ALUNO" }} />
      </Dialog>

      <Dialog
        aberto={dialogo === "senha"}
        aoFechar={() => setDialogo(null)}
        titulo="Senha de acesso"
        descricao="Altere a senha usada para entrar no sistema."
      >
        <FormMinhaSenha />
      </Dialog>
    </>
  )
}

"use client"

import type { Papel, StatusAluno } from "@prisma/client"
import { ImagePlus, KeyRound } from "lucide-react"
import { useMemo, useState } from "react"
import { FormRedefinirSenhaUsuario } from "@/components/auth/form-redefinir-senha-usuario"
import { Badge, type BadgeProps } from "@/components/ui/badge"
import { CampoBusca } from "@/components/ui/campo-busca"
import { Card, CardContent } from "@/components/ui/card"
import { Dialog } from "@/components/ui/dialog"
import { ItemMenu, MenuAcoes } from "@/components/ui/menu-acoes"
import { FormFotoUsuarioGestor } from "@/components/usuarios/form-foto-usuario"
import { formatarData } from "@/lib/utils/datas"

export type UsuarioAcessoLinha = {
  id: string
  nome: string
  email: string
  fotoUrl: string | null
  papel: Papel
  ativo: boolean
  criadoEm: Date
  alunoStatus: StatusAluno | null
  professorAtivo: boolean | null
}

const ROTULO_PAPEL: Record<Papel, string> = {
  GESTOR: "Gestor",
  PROFESSOR: "Professor",
  ALUNO: "Aluno",
}

const VARIANTE_PAPEL: Record<Papel, BadgeProps["variant"]> = {
  GESTOR: "default",
  PROFESSOR: "outline",
  ALUNO: "secondary",
}

function detalheOperacional(usuario: UsuarioAcessoLinha) {
  if (usuario.papel === "ALUNO") return usuario.alunoStatus ?? "Sem vínculo"
  if (usuario.papel === "PROFESSOR") {
    if (usuario.professorAtivo === null) return "Sem vínculo"
    return usuario.professorAtivo ? "Professor ativo" : "Professor inativo"
  }
  return "Acesso administrativo"
}

export function TabelaUsuarios({ usuarios }: { usuarios: UsuarioAcessoLinha[] }) {
  const [busca, setBusca] = useState("")
  const [usuarioSenha, setUsuarioSenha] = useState<UsuarioAcessoLinha | null>(null)
  const [usuarioFoto, setUsuarioFoto] = useState<UsuarioAcessoLinha | null>(null)

  const filtrados = useMemo(() => {
    const termo = busca.trim().toLowerCase()
    if (!termo) return usuarios
    return usuarios.filter((usuario) =>
      [
        usuario.nome,
        usuario.email,
        ROTULO_PAPEL[usuario.papel],
        usuario.ativo ? "ativo" : "inativo",
        detalheOperacional(usuario),
      ]
        .join(" ")
        .toLowerCase()
        .includes(termo),
    )
  }, [usuarios, busca])

  return (
    <>
      <Card>
        <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:items-center sm:justify-between">
          <CampoBusca valor={busca} aoMudar={setBusca} placeholder="Nome, e-mail, papel…" />
          <span className="text-sm text-muted-foreground">
            {filtrados.length} de {usuarios.length}
          </span>
        </div>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="tabela-responsiva w-full text-sm">
              <thead className="border-b border-border text-left text-muted-foreground">
                <tr>
                  <th className="p-4 font-medium">Usuário</th>
                  <th className="p-4 font-medium">Papel</th>
                  <th className="p-4 font-medium">Conta</th>
                  <th className="p-4 font-medium">Criado em</th>
                  <th className="p-4 text-right font-medium">
                    <span className="sr-only">Ações</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {filtrados.map((usuario) => (
                  <tr
                    key={usuario.id}
                    className="border-b border-border transition-colors last:border-0 hover:bg-muted/40"
                  >
                    <td className="p-4" data-label="Usuário">
                      <span className="font-medium">{usuario.nome}</span>
                      <span className="block text-xs text-muted-foreground">{usuario.email}</span>
                      <span className="block text-xs text-muted-foreground">
                        Foto: {usuario.fotoUrl ? "informada" : "não informada"}
                      </span>
                    </td>
                    <td className="p-4" data-label="Papel">
                      <Badge variant={VARIANTE_PAPEL[usuario.papel]}>
                        {ROTULO_PAPEL[usuario.papel]}
                      </Badge>
                    </td>
                    <td className="p-4" data-label="Conta">
                      <Badge variant={usuario.ativo ? "success" : "secondary"}>
                        {usuario.ativo ? "Ativa" : "Inativa"}
                      </Badge>
                      <span className="mt-1 block text-xs text-muted-foreground">
                        {detalheOperacional(usuario)}
                      </span>
                    </td>
                    <td className="p-4" data-label="Criado em">
                      {formatarData(usuario.criadoEm)}
                    </td>
                    <td className="p-4" data-label="Ações">
                      <div className="flex justify-end">
                        <MenuAcoes rotulo={`Ações de ${usuario.nome}`}>
                          {(fecharMenu) => (
                            <>
                              <ItemMenu
                                icone={ImagePlus}
                                onClick={() => {
                                  fecharMenu()
                                  setUsuarioFoto(usuario)
                                }}
                              >
                                Alterar foto
                              </ItemMenu>
                              <ItemMenu
                                icone={KeyRound}
                                onClick={() => {
                                  fecharMenu()
                                  setUsuarioSenha(usuario)
                                }}
                              >
                                Redefinir senha
                              </ItemMenu>
                            </>
                          )}
                        </MenuAcoes>
                      </div>
                    </td>
                  </tr>
                ))}
                {filtrados.length === 0 && (
                  <tr>
                    <td colSpan={5} className="p-10 text-center text-muted-foreground">
                      {usuarios.length === 0
                        ? "Nenhum usuário cadastrado."
                        : "Nenhum usuário corresponde à busca."}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Dialog
        aberto={Boolean(usuarioFoto)}
        aoFechar={() => setUsuarioFoto(null)}
        variante="centro"
        titulo="Alterar foto"
        descricao={usuarioFoto?.nome}
      >
        {usuarioFoto && (
          <FormFotoUsuarioGestor usuario={usuarioFoto} aoConcluir={() => setUsuarioFoto(null)} />
        )}
      </Dialog>

      <Dialog
        aberto={Boolean(usuarioSenha)}
        aoFechar={() => setUsuarioSenha(null)}
        variante="centro"
        titulo="Redefinir senha"
        descricao={usuarioSenha?.nome}
      >
        {usuarioSenha && (
          <FormRedefinirSenhaUsuario
            usuario={usuarioSenha}
            aoConcluir={() => setUsuarioSenha(null)}
          />
        )}
      </Dialog>
    </>
  )
}

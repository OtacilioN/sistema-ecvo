import { Badge } from "@/components/ui/badge"
import { CabecalhoPagina } from "@/components/ui/cabecalho-pagina"
import { Card, CardContent } from "@/components/ui/card"
import { exigirGestao } from "@/lib/auth/dal"
import { listarGestores } from "@/lib/services/gestor.service"
import { formatarData } from "@/lib/utils/datas"
import { AcoesGestor, BotaoNovoGestor } from "./acoes-gestor"

export const dynamic = "force-dynamic"

export default async function GestoresPage() {
  const usuario = await exigirGestao()
  const podeEditar = usuario.papel === "GESTOR"
  const gestores = await listarGestores()

  return (
    <div className="space-y-6">
      <CabecalhoPagina
        titulo="Gestores"
        descricao="Contas administrativas da academia: gestores e secretaria."
      >
        {podeEditar && <BotaoNovoGestor />}
      </CabecalhoPagina>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="tabela-responsiva w-full text-sm">
              <thead className="border-b border-border text-left text-muted-foreground">
                <tr>
                  <th className="p-4 font-medium">Usuário</th>
                  <th className="p-4 font-medium">Perfil</th>
                  <th className="p-4 font-medium">Criado em</th>
                  <th className="p-4 text-center font-medium">Logs como autor</th>
                  <th className="p-4 font-medium">Status</th>
                  {podeEditar && (
                    <th className="p-4 text-right font-medium">
                      <span className="sr-only">Ações</span>
                    </th>
                  )}
                </tr>
              </thead>
              <tbody>
                {gestores.map((gestor) => (
                  <tr
                    key={gestor.id}
                    className="border-b border-border transition-colors last:border-0 hover:bg-muted/40"
                  >
                    <td className="p-4" data-label="Usuário">
                      <div className="flex items-center gap-3">
                        <FotoPerfil nome={gestor.nome} fotoUrl={gestor.fotoUrl} />
                        <div className="min-w-0">
                          <span className="font-medium">{gestor.nome}</span>
                          <span className="block truncate text-xs text-muted-foreground">
                            {gestor.email}
                          </span>
                        </div>
                      </div>
                    </td>
                    <td className="p-4" data-label="Perfil">
                      <Badge variant={gestor.papel === "GESTOR" ? "default" : "outline"}>
                        {gestor.papel === "GESTOR" ? "Gestor" : "Secretaria"}
                      </Badge>
                    </td>
                    <td className="p-4" data-label="Criado em">
                      {formatarData(gestor.criadoEm)}
                    </td>
                    <td className="p-4 text-center tabular-nums" data-label="Logs">
                      {gestor._count.logs}
                    </td>
                    <td className="p-4" data-label="Status">
                      {gestor.ativo ? (
                        <Badge variant="success">Ativo</Badge>
                      ) : (
                        <Badge variant="secondary">Inativo</Badge>
                      )}
                    </td>
                    {podeEditar && (
                      <td className="p-4" data-label="Ações">
                        <div className="flex justify-end">
                          <AcoesGestor
                            gestor={{
                              id: gestor.id,
                              nome: gestor.nome,
                              email: gestor.email,
                              fotoUrl: gestor.fotoUrl,
                            }}
                          />
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
                {gestores.length === 0 && (
                  <tr>
                    <td
                      colSpan={podeEditar ? 6 : 5}
                      className="p-10 text-center text-muted-foreground"
                    >
                      Nenhum acesso administrativo cadastrado.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

function FotoPerfil({ nome, fotoUrl }: { nome: string; fotoUrl?: string | null }) {
  return (
    <div
      role="img"
      aria-label={`Foto de ${nome}`}
      className="size-10 shrink-0 rounded-md border border-border bg-muted bg-cover bg-center text-xs font-semibold text-muted-foreground"
      style={fotoUrl ? { backgroundImage: `url(${fotoUrl})` } : undefined}
    >
      {!fotoUrl && <span className="flex size-full items-center justify-center">{nome[0]}</span>}
    </div>
  )
}

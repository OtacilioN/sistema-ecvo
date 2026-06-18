"use client"

import { AlertTriangle } from "lucide-react"
import { useMemo, useState } from "react"
import { Badge, type BadgeProps } from "@/components/ui/badge"
import { CampoBusca } from "@/components/ui/campo-busca"
import { Card, CardContent } from "@/components/ui/card"
import { Select } from "@/components/ui/select"
import { alunoContaOperacionalmente } from "@/lib/alunos/status"
import { AcoesAluno, type AlunoLinha } from "./acoes-aluno"

type Modalidade = { id: string; nome: string }
type Plano = {
  id: string
  nome: string
  valor: number
  periodicidade: string
  ativo: boolean
}
type StatusAluno = AlunoLinha["status"]

export type AlunoLista = AlunoLinha & {
  email: string
  modalidadeNomes: string[]
  documentos: number
}

const VARIANTE_STATUS: Record<StatusAluno, BadgeProps["variant"]> = {
  ATIVO: "success",
  INADIMPLENTE: "warning",
  TRANCADO: "secondary",
  CANCELADO: "destructive",
}

type FiltroStatusAluno = "OPERACIONAIS" | "TODOS" | "TRANCADO" | "CANCELADO"
type FiltroTermo = "TODOS" | "ACEITOS" | "PENDENTES"

export function TabelaAlunos({
  alunos,
  modalidades,
  planos,
  competenciaAtual,
  podeAdministrar,
}: {
  alunos: AlunoLista[]
  modalidades: Modalidade[]
  planos: Plano[]
  competenciaAtual: string
  podeAdministrar: boolean
}) {
  const [busca, setBusca] = useState("")
  const [planoFiltro, setPlanoFiltro] = useState("TODOS")
  const [statusFiltro, setStatusFiltro] = useState<FiltroStatusAluno>("OPERACIONAIS")
  const [termoFiltro, setTermoFiltro] = useState<FiltroTermo>("TODOS")

  const filtrados = useMemo(() => {
    const termo = busca.trim().toLowerCase()
    return alunos.filter((a) => {
      const correspondeStatus =
        statusFiltro === "TODOS" ||
        (statusFiltro === "OPERACIONAIS"
          ? alunoContaOperacionalmente(a.status)
          : a.status === statusFiltro)
      if (!correspondeStatus) return false

      const correspondePlano =
        planoFiltro === "TODOS" ||
        (planoFiltro === "SEM_PLANO" ? !a.planoId : a.planoId === planoFiltro)
      if (!correspondePlano) return false

      const correspondeTermo =
        termoFiltro === "TODOS" ||
        (termoFiltro === "ACEITOS" ? a.termoResponsabilidadeAceito : !a.termoResponsabilidadeAceito)
      if (!correspondeTermo) return false

      if (!termo) return true

      return [
        a.nome,
        a.email,
        a.tipo,
        a.status,
        a.planoNome,
        a.termoResponsabilidadeAceito ? "termo aceito" : "termo pendente",
        a.planoId ? String(a.diaVencimento) : "",
        ...a.modalidadeNomes,
      ]
        .join(" ")
        .toLowerCase()
        .includes(termo)
    })
  }, [alunos, busca, planoFiltro, statusFiltro, termoFiltro])

  const grupos = useMemo(
    () => [
      {
        titulo: "Alunos Mensalistas",
        alunos: filtrados.filter((a) => a.tipo !== "WELLHUB" && a.tipo !== "TOTALPASS"),
      },
      {
        titulo: "Alunos Wellhub/Totalpass",
        alunos: filtrados.filter((a) => a.tipo === "WELLHUB" || a.tipo === "TOTALPASS"),
      },
    ],
    [filtrados],
  )

  return (
    <Card>
      <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="grid flex-1 gap-3 sm:grid-cols-[minmax(220px,1fr)_160px_160px_220px]">
          <CampoBusca valor={busca} aoMudar={setBusca} placeholder="Nome, e-mail, modalidade…" />
          <Select
            aria-label="Filtrar por status"
            value={statusFiltro}
            onChange={(evento) => setStatusFiltro(evento.target.value as FiltroStatusAluno)}
          >
            <option value="OPERACIONAIS">Operacionais</option>
            <option value="TODOS">Todos</option>
            <option value="TRANCADO">Trancados</option>
            <option value="CANCELADO">Cancelados</option>
          </Select>
          <Select
            aria-label="Filtrar por termo"
            value={termoFiltro}
            onChange={(evento) => setTermoFiltro(evento.target.value as FiltroTermo)}
          >
            <option value="TODOS">Todos os termos</option>
            <option value="PENDENTES">Termo pendente</option>
            <option value="ACEITOS">Termo aceito</option>
          </Select>
          <Select
            aria-label="Filtrar por plano"
            value={planoFiltro}
            onChange={(evento) => setPlanoFiltro(evento.target.value)}
          >
            <option value="TODOS">Todos os planos</option>
            <option value="SEM_PLANO">Sem plano</option>
            {planos.map((plano) => (
              <option key={plano.id} value={plano.id}>
                {plano.nome}
              </option>
            ))}
          </Select>
        </div>
        <span className="text-sm text-muted-foreground">
          {filtrados.length} de {alunos.length}
        </span>
      </div>
      <CardContent className="p-0">
        {filtrados.length === 0 ? (
          <p className="p-10 text-center text-sm text-muted-foreground">
            {alunos.length === 0
              ? "Nenhum aluno cadastrado. Use “Novo aluno” para começar."
              : "Nenhum aluno corresponde à busca."}
          </p>
        ) : (
          <div className="divide-y divide-border">
            {grupos.map((grupo) => (
              <section key={grupo.titulo} className="space-y-3 p-4">
                <div className="flex items-center justify-between gap-3">
                  <h2 className="text-sm font-semibold">{grupo.titulo}</h2>
                  <span className="text-xs text-muted-foreground">
                    {grupo.alunos.length} aluno(s)
                  </span>
                </div>
                {grupo.alunos.length > 0 ? (
                  <TabelaGrupoAlunos
                    alunos={grupo.alunos}
                    modalidades={modalidades}
                    planos={planos}
                    competenciaAtual={competenciaAtual}
                    podeAdministrar={podeAdministrar}
                  />
                ) : (
                  <p className="rounded-md border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                    Nenhum aluno nesta lista.
                  </p>
                )}
              </section>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function TabelaGrupoAlunos({
  alunos,
  modalidades,
  planos,
  competenciaAtual,
  podeAdministrar,
}: {
  alunos: AlunoLista[]
  modalidades: Modalidade[]
  planos: Plano[]
  competenciaAtual: string
  podeAdministrar: boolean
}) {
  return (
    <div className="-mx-4 overflow-x-auto">
      <table className="tabela-responsiva w-full text-sm">
        <thead className="border-y border-border text-left text-muted-foreground">
          <tr>
            <th className="p-4 font-medium">Aluno</th>
            <th className="p-4 font-medium">Tipo</th>
            <th className="p-4 font-medium">Plano</th>
            <th className="p-4 font-medium">Modalidades</th>
            <th className="p-4 font-medium">Venc.</th>
            <th className="p-4 text-center font-medium">Docs</th>
            <th className="p-4 font-medium">Status</th>
            <th className="p-4 text-right font-medium">
              <span className="sr-only">Ações</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {alunos.map((a) => (
            <tr
              key={a.id}
              className="border-b border-border transition-colors last:border-0 hover:bg-muted/40"
            >
              <td className="p-4" data-label="Aluno">
                <div className="flex items-center gap-3">
                  <FotoPerfil nome={a.nome} fotoUrl={a.fotoUrl} />
                  <div className="min-w-0">
                    <span className="flex flex-wrap items-center gap-2 font-medium">
                      {a.nome}
                      {!a.termoResponsabilidadeAceito && (
                        <Badge
                          variant="warning"
                          className="gap-1 rounded-md px-1.5 py-0.5 text-[11px]"
                          title="Termo de responsabilidade pendente"
                        >
                          <AlertTriangle className="size-3" />
                          Termo pendente
                        </Badge>
                      )}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">{a.email}</span>
                  </div>
                </div>
              </td>
              <td className="p-4" data-label="Tipo">
                <Badge variant="outline">{a.tipo}</Badge>
              </td>
              <td className="p-4" data-label="Plano">
                {a.planoNome ? (
                  <Badge variant="outline">{a.planoNome}</Badge>
                ) : (
                  <span className="text-xs text-muted-foreground">Sem plano</span>
                )}
              </td>
              <td className="p-4" data-label="Modalidades">
                <div className="flex flex-wrap gap-1">
                  {a.modalidadeNomes.map((nome) => (
                    <Badge key={nome} variant="secondary">
                      {nome}
                    </Badge>
                  ))}
                  {a.modalidadeNomes.length === 0 && (
                    <span className="text-xs text-muted-foreground">—</span>
                  )}
                </div>
              </td>
              <td className="p-4 tabular-nums" data-label="Venc.">
                {a.planoId ? (
                  `Dia ${a.diaVencimento}`
                ) : (
                  <span className="text-xs text-muted-foreground">—</span>
                )}
              </td>
              <td className="p-4 text-center font-semibold tabular-nums" data-label="Docs">
                {a.documentos}
              </td>
              <td className="p-4" data-label="Status">
                <Badge variant={VARIANTE_STATUS[a.status]}>{a.status}</Badge>
              </td>
              <td className="p-4" data-label="Ações">
                <div className="flex justify-end">
                  <AcoesAluno
                    aluno={a}
                    modalidades={modalidades}
                    planos={planos}
                    competenciaAtual={competenciaAtual}
                    podeAdministrar={podeAdministrar}
                  />
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
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

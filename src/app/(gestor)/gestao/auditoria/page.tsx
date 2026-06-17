import { CabecalhoPagina } from "@/components/ui/cabecalho-pagina"
import { exigirGestao } from "@/lib/auth/dal"
import { db } from "@/lib/db"
import { formatarBRL } from "@/lib/utils/formato"
import { TabelaAuditoria } from "./tabela-auditoria"

export const dynamic = "force-dynamic"

function campoTexto(valor: unknown, campo: string) {
  if (!valor || Array.isArray(valor) || typeof valor !== "object") return undefined
  const campoValor = (valor as Record<string, unknown>)[campo]
  return typeof campoValor === "string" && campoValor.trim() ? campoValor : undefined
}

function campoNumero(valor: unknown, campo: string) {
  if (!valor || Array.isArray(valor) || typeof valor !== "object") return undefined
  const campoValor = (valor as Record<string, unknown>)[campo]
  if (typeof campoValor === "number" && Number.isFinite(campoValor)) return campoValor
  if (typeof campoValor === "string" && campoValor.trim()) {
    const numero = Number(campoValor)
    return Number.isFinite(numero) ? numero : undefined
  }
  return undefined
}

function detalheMensalidadeDoJson(valor: unknown) {
  const alunoNome = campoTexto(valor, "alunoNome")
  const competencia = campoTexto(valor, "competencia")
  const valorMensalidade = campoNumero(valor, "valor")
  const partes = [
    alunoNome,
    competencia,
    valorMensalidade === undefined ? undefined : formatarBRL(valorMensalidade),
  ].filter(Boolean)

  return partes.length ? partes.join(" · ") : undefined
}

export default async function Page() {
  await exigirGestao()
  const logs = await db.logAuditoria.findMany({
    orderBy: { criadoEm: "desc" },
    take: 100,
    include: { autor: { select: { nome: true, papel: true, email: true } } },
  })
  const mensalidadeIds = logs
    .filter((log) => log.entidade === "Mensalidade")
    .map((log) => log.entidadeId)
  const mensalidades = mensalidadeIds.length
    ? await db.mensalidade.findMany({
        where: { id: { in: mensalidadeIds } },
        include: { aluno: { include: { usuario: { select: { nome: true } } } } },
      })
    : []
  const detalhesMensalidade = new Map(
    mensalidades.map((mensalidade) => [
      mensalidade.id,
      `${mensalidade.aluno.usuario.nome} · ${mensalidade.competencia} · ${formatarBRL(
        Number(mensalidade.valor),
      )}`,
    ]),
  )

  return (
    <div className="space-y-6">
      <CabecalhoPagina
        titulo="Auditoria"
        descricao="Logs de ações críticas com autor, data, entidade e valores."
      />

      <TabelaAuditoria
        logs={logs.map((log) => ({
          id: log.id,
          criadoEm: log.criadoEm,
          acao: log.acao,
          autorNome: log.autor.nome,
          autorPapel: log.autor.papel,
          entidade: log.entidade,
          entidadeId: log.entidadeId,
          detalheEntidade:
            log.entidade === "Mensalidade"
              ? (detalhesMensalidade.get(log.entidadeId) ??
                detalheMensalidadeDoJson(log.valorNovo) ??
                detalheMensalidadeDoJson(log.valorAntigo))
              : undefined,
          justificativa: log.justificativa,
          valorAntigo: log.valorAntigo,
          valorNovo: log.valorNovo,
        }))}
      />
    </div>
  )
}

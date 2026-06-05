"use client"

import { ClipboardCheck } from "lucide-react"
import { useActionState } from "react"
import { acaoRegistrarResultadoExame, type EstadoGraduacao } from "@/app/actions/graduacoes"
import { BotaoEnviar } from "@/components/ui/botao-enviar"
import { Input } from "@/components/ui/input"
import { Select } from "@/components/ui/select"

export function FormResultadoExame({
  inscricaoExameId,
  aprovado,
  resultado,
  novaGraduacaoId,
  graduacoes,
}: {
  inscricaoExameId: string
  aprovado: boolean | null
  resultado: string | null
  novaGraduacaoId: string | null
  graduacoes: { id: string; nome: string }[]
}) {
  const [estado, acao] = useActionState<EstadoGraduacao, FormData>(
    acaoRegistrarResultadoExame,
    undefined,
  )

  const valorAtual = aprovado === null ? "PENDENTE" : aprovado ? "APROVADO" : "REPROVADO"

  return (
    <form action={acao} className="grid gap-2 sm:grid-cols-[140px_1fr_auto]">
      <input type="hidden" name="inscricaoExameId" value={inscricaoExameId} />
      <Select name="aprovado" defaultValue={valorAtual} aria-label="Resultado">
        <option value="PENDENTE">Pendente</option>
        <option value="APROVADO">Aprovado</option>
        <option value="REPROVADO">Não aprovado</option>
      </Select>
      <Input name="resultado" defaultValue={resultado ?? ""} placeholder="Observação do exame" />
      <BotaoEnviar size="sm">
        <ClipboardCheck className="size-4" /> Salvar
      </BotaoEnviar>
      <Select
        name="novaGraduacaoId"
        defaultValue={novaGraduacaoId ?? ""}
        aria-label="Nova graduação"
        className="sm:col-span-2"
      >
        <option value="">Sem nova graduação</option>
        {graduacoes.map((graduacao) => (
          <option key={graduacao.id} value={graduacao.id}>
            {graduacao.nome}
          </option>
        ))}
      </Select>
      {estado?.erro && <p className="text-xs text-destructive sm:col-span-3">{estado.erro}</p>}
      {estado?.ok && <p className="text-xs text-success sm:col-span-3">Resultado atualizado.</p>}
    </form>
  )
}

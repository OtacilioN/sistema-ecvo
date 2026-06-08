"use client"

import { Award } from "lucide-react"
import { useActionState, useEffect, useRef } from "react"
import { acaoRegistrarGraduacao, type EstadoGraduacao } from "@/app/actions/graduacoes"
import { BotaoEnviar } from "@/components/ui/botao-enviar"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"

type AlunoOpcao = { id: string; nome: string; detalhe: string }
type GraduacaoOpcao = { id: string; rotulo: string }

export function FormGraduacao({
  alunos,
  graduacoes,
  aoConcluir,
}: {
  alunos: AlunoOpcao[]
  graduacoes: GraduacaoOpcao[]
  aoConcluir?: () => void
}) {
  const [estado, acao] = useActionState<EstadoGraduacao, FormData>(
    acaoRegistrarGraduacao,
    undefined,
  )
  const ref = useRef<HTMLFormElement>(null)

  useEffect(() => {
    if (estado?.ok) {
      ref.current?.reset()
      aoConcluir?.()
    }
  }, [estado?.ok, aoConcluir])

  return (
    <form ref={ref} action={acao} className="grid gap-4 sm:grid-cols-2">
      <div className="space-y-1.5">
        <Label htmlFor="alunoId">Aluno</Label>
        <Select id="alunoId" name="alunoId" required>
          <option value="">Selecione</option>
          {alunos.map((aluno) => (
            <option key={aluno.id} value={aluno.id}>
              {aluno.nome} · {aluno.detalhe}
            </option>
          ))}
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="graduacaoId">Nova graduação</Label>
        <Select id="graduacaoId" name="graduacaoId" required>
          <option value="">Selecione</option>
          {graduacoes.map((graduacao) => (
            <option key={graduacao.id} value={graduacao.id}>
              {graduacao.rotulo}
            </option>
          ))}
        </Select>
      </div>
      <div className="space-y-1.5 sm:col-span-2">
        <Label htmlFor="observacao">Observação</Label>
        <Textarea
          id="observacao"
          name="observacao"
          placeholder="Avaliação, exame, observações técnicas"
        />
      </div>
      <div className="space-y-1.5 sm:col-span-2">
        <Label htmlFor="anexoUrl">Anexo</Label>
        <Input id="anexoUrl" name="anexoUrl" placeholder="URL de certificado ou documento" />
      </div>
      <div className="flex items-center gap-3 sm:col-span-2">
        <BotaoEnviar>
          <Award className="size-4" /> Registrar graduação
        </BotaoEnviar>
        {estado?.erro && <p className="text-sm text-destructive">{estado.erro}</p>}
      </div>
    </form>
  )
}

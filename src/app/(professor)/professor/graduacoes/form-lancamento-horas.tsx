"use client"

import { ClockPlus } from "lucide-react"
import { useActionState, useEffect, useMemo, useRef, useState } from "react"
import { acaoLancarHorasAvulsasProfessor, type EstadoHoras } from "@/app/actions/horas"
import { BotaoEnviar } from "@/components/ui/botao-enviar"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select } from "@/components/ui/select"

type ModalidadeOpcao = { id: string; nome: string }
type AlunoOpcao = { id: string; nome: string; detalhe: string; modalidades: ModalidadeOpcao[] }

export function FormLancamentoHorasProfessor({
  alunos,
  aoConcluir,
}: {
  alunos: AlunoOpcao[]
  aoConcluir?: () => void
}) {
  const [estado, acao] = useActionState<EstadoHoras, FormData>(
    acaoLancarHorasAvulsasProfessor,
    undefined,
  )
  const [alunoId, setAlunoId] = useState("")
  const [modalidadeId, setModalidadeId] = useState("")
  const ref = useRef<HTMLFormElement>(null)

  const modalidadesDoAluno = useMemo(
    () => alunos.find((aluno) => aluno.id === alunoId)?.modalidades ?? [],
    [alunoId, alunos],
  )

  useEffect(() => {
    if (estado?.ok) {
      ref.current?.reset()
      setAlunoId("")
      setModalidadeId("")
      aoConcluir?.()
    }
  }, [estado?.ok, aoConcluir])

  return (
    <form ref={ref} action={acao} className="grid gap-4 sm:grid-cols-2">
      <div className="space-y-1.5">
        <Label htmlFor="lancamentoHorasAlunoId">Aluno</Label>
        <Select
          id="lancamentoHorasAlunoId"
          name="alunoId"
          required
          value={alunoId}
          onChange={(evento) => {
            setAlunoId(evento.target.value)
            setModalidadeId("")
          }}
        >
          <option value="">Selecione</option>
          {alunos.map((aluno) => (
            <option key={aluno.id} value={aluno.id}>
              {aluno.nome} · {aluno.detalhe}
            </option>
          ))}
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="lancamentoHorasModalidadeId">Modalidade</Label>
        <Select
          id="lancamentoHorasModalidadeId"
          name="modalidadeId"
          required
          disabled={!alunoId}
          value={modalidadeId}
          onChange={(evento) => setModalidadeId(evento.target.value)}
        >
          <option value="">{alunoId ? "Selecione" : "Selecione o aluno"}</option>
          {modalidadesDoAluno.map((modalidade) => (
            <option key={modalidade.id} value={modalidade.id}>
              {modalidade.nome}
            </option>
          ))}
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="lancamentoHorasMinutos">Minutos</Label>
        <Input
          id="lancamentoHorasMinutos"
          name="minutos"
          type="number"
          min={1}
          step={1}
          placeholder="60"
          required
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="lancamentoHorasMotivo">Motivo</Label>
        <Input
          id="lancamentoHorasMotivo"
          name="motivo"
          placeholder="Treino avulso acompanhado"
          required
        />
      </div>
      <div className="flex items-center gap-3 sm:col-span-2">
        <BotaoEnviar variant="outline">
          <ClockPlus className="size-4" /> Lançar horas
        </BotaoEnviar>
        {estado?.erro && <p className="text-sm text-destructive">{estado.erro}</p>}
      </div>
    </form>
  )
}

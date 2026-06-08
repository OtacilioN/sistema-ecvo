"use client"

import { Award, CalendarPlus } from "lucide-react"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Dialog } from "@/components/ui/dialog"
import { FormExame } from "./form-exame"
import { FormGraduacao } from "./form-graduacao"

type AlunoOpcao = { id: string; nome: string; detalhe: string }
type GraduacaoOpcao = { id: string; rotulo: string }
type ModalidadeOpcao = { id: string; nome: string }

export function AcoesGraduacoesProfessor({
  alunos,
  graduacoes,
  modalidades,
}: {
  alunos: AlunoOpcao[]
  graduacoes: GraduacaoOpcao[]
  modalidades: ModalidadeOpcao[]
}) {
  const [graduacaoAberta, setGraduacaoAberta] = useState(false)
  const [exameAberto, setExameAberto] = useState(false)
  const podeRegistrarGraduacao = alunos.length > 0 && graduacoes.length > 0
  const podeCriarExame = modalidades.length > 0

  return (
    <>
      <Button
        type="button"
        onClick={() => setGraduacaoAberta(true)}
        disabled={!podeRegistrarGraduacao}
      >
        <Award className="size-4" /> Registrar graduação
      </Button>
      <Button
        type="button"
        variant="outline"
        onClick={() => setExameAberto(true)}
        disabled={!podeCriarExame}
      >
        <CalendarPlus className="size-4" /> Novo exame
      </Button>

      <Dialog
        aberto={graduacaoAberta}
        aoFechar={() => setGraduacaoAberta(false)}
        variante="lateral"
        titulo="Registrar graduação"
        descricao="Atualização manual do histórico do aluno."
      >
        <FormGraduacao
          alunos={alunos}
          graduacoes={graduacoes}
          aoConcluir={() => setGraduacaoAberta(false)}
        />
      </Dialog>

      <Dialog
        aberto={exameAberto}
        aoFechar={() => setExameAberto(false)}
        variante="lateral"
        titulo="Novo exame"
        descricao="Cadastro de exame para uma modalidade sob sua responsabilidade."
      >
        <FormExame modalidades={modalidades} aoConcluir={() => setExameAberto(false)} />
      </Dialog>
    </>
  )
}

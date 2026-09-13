"use client"

import { FileUp, Wrench } from "lucide-react"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Dialog } from "@/components/ui/dialog"
import { FormImportacaoConciliacao, FormResolverConciliacao } from "./forms-conciliacao"

type AlunoOpcao = { id: string; nome: string; detalhe: string }
type CheckinOpcao = { id: string; rotulo: string }

export function BotaoImportarConciliacao() {
  const [aberto, setAberto] = useState(false)
  return (
    <>
      <Button onClick={() => setAberto(true)}>
        <FileUp className="size-4" /> Importar planilha
      </Button>
      <Dialog
        aberto={aberto}
        aoFechar={() => setAberto(false)}
        variante="lateral"
        titulo="Importar planilha"
        descricao="Selecione a plataforma, envie o relatório e informe o mês de referência."
      >
        <FormImportacaoConciliacao aoConcluir={() => setAberto(false)} />
      </Dialog>
    </>
  )
}

export function AcaoResolverRegistro({
  registroId,
  statusAtual,
  alunos,
  checkins,
  resumoMensal = false,
  plataforma = "WELLHUB",
}: {
  registroId: string
  statusAtual: string
  alunos: AlunoOpcao[]
  checkins: CheckinOpcao[]
  resumoMensal?: boolean
  plataforma?: "WELLHUB" | "TOTALPASS"
}) {
  const [aberto, setAberto] = useState(false)
  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setAberto(true)}>
        <Wrench className="size-4" /> Resolver
      </Button>
      <Dialog
        aberto={aberto}
        aoFechar={() => setAberto(false)}
        variante="lateral"
        titulo="Resolver divergência"
        descricao={
          resumoMensal
            ? plataforma === "TOTALPASS"
              ? "Identifique o aluno do relatório TotalPass pelo CPF e nome. O vínculo não cria check-ins."
              : "O aluno selecionado será vinculado aos registros pendentes deste ID Wellhub nas duas contas do mês."
            : "Identifique o aluno/check-in ou ajuste o status do registro importado."
        }
      >
        <FormResolverConciliacao
          registroId={registroId}
          statusAtual={statusAtual}
          alunos={alunos}
          checkins={checkins}
          resumoMensal={resumoMensal}
          aoConcluir={() => setAberto(false)}
        />
      </Dialog>
    </>
  )
}

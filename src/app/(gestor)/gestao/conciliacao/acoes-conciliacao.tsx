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
        descricao="CSV/XLSX Wellhub ou TotalPass — concilia automaticamente com os check-ins."
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
}: {
  registroId: string
  statusAtual: string
  alunos: AlunoOpcao[]
  checkins: CheckinOpcao[]
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
        descricao="Identifique o aluno/check-in ou ajuste o status do registro importado."
      >
        <FormResolverConciliacao
          registroId={registroId}
          statusAtual={statusAtual}
          alunos={alunos}
          checkins={checkins}
          aoConcluir={() => setAberto(false)}
        />
      </Dialog>
    </>
  )
}

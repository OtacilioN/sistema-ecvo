"use client"

import { useRouter } from "next/navigation"
import { useActionState, useEffect, useId, useState } from "react"
import { acaoDestrancarAlunoComPagamento } from "@/app/actions/destrancamento"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { formatarDataInput } from "@/lib/utils/datas"

export function FormDestrancamento({
  alunoId,
  competenciaAtual,
  valorSugerido,
  planoDisponivel,
  aoConcluir,
}: {
  alunoId: string
  competenciaAtual: string
  valorSugerido: number | null
  planoDisponivel: boolean
  aoConcluir: () => void
}) {
  const router = useRouter()
  const id = useId()
  const [dataHoje] = useState(() => formatarDataInput(new Date()))
  const [estado, acao, pendente] = useActionState(acaoDestrancarAlunoComPagamento, undefined)

  useEffect(() => {
    if (estado?.ok) {
      aoConcluir()
      router.refresh()
    }
  }, [estado?.ok, aoConcluir, router])

  if (!planoDisponivel) {
    return (
      <div className="space-y-5">
        <p className="text-sm text-muted-foreground">
          Para destrancar com pagamento, o aluno precisa ser mensalista e ter um plano mensal ativo
          e individual. Confira o cadastro em “Editar dados” antes de continuar. Planos de família
          precisam de conciliação conjunta pela gestão.
        </p>
        <div className="flex justify-end">
          <Button type="button" variant="outline" onClick={aoConcluir}>
            Fechar
          </Button>
        </div>
      </div>
    )
  }

  return (
    <form action={acao} className="space-y-5">
      <input type="hidden" name="alunoId" value={alunoId} />
      <input type="hidden" name="competencia" value={competenciaAtual} />
      <p className="text-sm text-muted-foreground">
        Registre o pagamento já recebido para reativar a matrícula. O lançamento será vinculado à
        competência {competenciaAtual.split("-").reverse().join("/")}.
      </p>
      <fieldset disabled={pendente} className="space-y-4 disabled:opacity-60">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor={`${id}-valor`}>Valor recebido (R$)</Label>
            <Input
              id={`${id}-valor`}
              name="valor"
              type="number"
              inputMode="decimal"
              min="0.01"
              step="0.01"
              defaultValue={valorSugerido ?? ""}
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`${id}-data`}>Data do pagamento</Label>
            <Input
              id={`${id}-data`}
              name="pagoEm"
              type="date"
              min={`${competenciaAtual}-01`}
              max={dataHoje}
              defaultValue={dataHoje}
              required
            />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`${id}-forma`}>Forma de pagamento</Label>
          <Select id={`${id}-forma`} name="formaPagamento" defaultValue="MANUAL">
            <option value="PIX">Pix</option>
            <option value="DINHEIRO">Dinheiro</option>
            <option value="CARTAO">Cartão</option>
            <option value="TRANSFERENCIA">Transferência</option>
            <option value="OUTRO">Outro</option>
            <option value="MANUAL">Não informada</option>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`${id}-observacao`}>Observação do pagamento</Label>
          <Textarea
            id={`${id}-observacao`}
            name="observacao"
            placeholder="Informe como o pagamento foi conferido."
            maxLength={2000}
            required
          />
        </div>
      </fieldset>
      <p className="text-xs text-muted-foreground">
        Se houver mensalidades anteriores em aberto ou vencidas, regularize as pendências antes de
        destrancar.
      </p>
      {estado?.erro && (
        <p role="alert" className="text-sm text-destructive">
          {estado.erro}
        </p>
      )}
      <div className="flex flex-wrap justify-end gap-2">
        <Button type="button" variant="outline" onClick={aoConcluir} disabled={pendente}>
          Cancelar
        </Button>
        <Button type="submit" disabled={pendente}>
          {pendente ? "Registrando..." : "Registrar pagamento e destrancar"}
        </Button>
      </div>
    </form>
  )
}

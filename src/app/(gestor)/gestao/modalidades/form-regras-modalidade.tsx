"use client"

import { useActionState, useEffect } from "react"
import { acaoAtualizarRegrasModalidade, type EstadoForm } from "@/app/actions/cadastros"
import { BotaoEnviar } from "@/components/ui/botao-enviar"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select } from "@/components/ui/select"

type ModalidadeRegras = {
  id: string
  nome: string
  janelaComparecimentoHoras: number | null
  prazoCancelamentoHoras: number | null
  exigirComparecimentoParaCheckin: boolean | null
  politicaCheckinSemComparecimento: "PERMITIR" | "BLOQUEAR" | "APENAS_COM_APROVACAO" | null
  listaEsperaAtiva: boolean | null
}

const HERDAR = "HERDAR"

export function FormRegrasModalidade({
  modalidade,
  aoConcluir,
}: {
  modalidade: ModalidadeRegras
  aoConcluir?: () => void
}) {
  const [estado, acao] = useActionState<EstadoForm, FormData>(
    acaoAtualizarRegrasModalidade,
    undefined,
  )

  useEffect(() => {
    if (estado?.ok) aoConcluir?.()
  }, [estado?.ok, aoConcluir])

  return (
    <form action={acao} className="grid gap-4">
      <input type="hidden" name="modalidadeId" value={modalidade.id} />
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="janelaComparecimentoHoras-modalidade">Janela (horas)</Label>
          <Input
            id="janelaComparecimentoHoras-modalidade"
            name="janelaComparecimentoHoras"
            type="number"
            min={0}
            max={168}
            placeholder="Herdar"
            defaultValue={modalidade?.janelaComparecimentoHoras ?? ""}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="prazoCancelamentoHoras-modalidade">Cancelamento (horas)</Label>
          <Input
            id="prazoCancelamentoHoras-modalidade"
            name="prazoCancelamentoHoras"
            type="number"
            min={0}
            max={168}
            placeholder="Herdar"
            defaultValue={modalidade?.prazoCancelamentoHoras ?? ""}
          />
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="space-y-1.5">
          <Label htmlFor="exigirComparecimento-modalidade">Exigir comparecimento</Label>
          <Select
            id="exigirComparecimento-modalidade"
            name="exigirComparecimentoParaCheckin"
            defaultValue={valorBooleano(modalidade?.exigirComparecimentoParaCheckin)}
          >
            <option value={HERDAR}>Herdar</option>
            <option value="true">Sim</option>
            <option value="false">Não</option>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="politicaCheckin-modalidade">Check-in sem comparecimento</Label>
          <Select
            id="politicaCheckin-modalidade"
            name="politicaCheckinSemComparecimento"
            defaultValue={modalidade?.politicaCheckinSemComparecimento ?? HERDAR}
          >
            <option value={HERDAR}>Herdar</option>
            <option value="PERMITIR">Permitir</option>
            <option value="BLOQUEAR">Bloquear</option>
            <option value="APENAS_COM_APROVACAO">Aprovação</option>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="listaEspera-modalidade">Lista de espera</Label>
          <Select
            id="listaEspera-modalidade"
            name="listaEsperaAtiva"
            defaultValue={valorBooleano(modalidade?.listaEsperaAtiva)}
          >
            <option value={HERDAR}>Herdar</option>
            <option value="true">Ativa</option>
            <option value="false">Inativa</option>
          </Select>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <BotaoEnviar>Salvar regras</BotaoEnviar>
        {estado?.erro && <p className="text-sm text-destructive">{estado.erro}</p>}
      </div>
    </form>
  )
}

function valorBooleano(valor: boolean | null | undefined) {
  if (valor === null || valor === undefined) return HERDAR
  return valor ? "true" : "false"
}

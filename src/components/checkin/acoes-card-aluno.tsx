"use client"

import { Check, FileText } from "lucide-react"
import { useActionState, useEffect, useState } from "react"
import {
  acaoAtualizarObservacaoTecnica,
  acaoLancarCheckin,
  type EstadoTreino,
} from "@/app/actions/treino"
import { BotaoEnviar } from "@/components/ui/botao-enviar"
import { Dialog } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { ItemMenu, MenuAcoes, SeparadorMenu } from "@/components/ui/menu-acoes"
import { Textarea } from "@/components/ui/textarea"

type DialogoAberto = "checkin" | "observacao" | null

export function AcoesCardAlunoCheckin({
  aulaId,
  alunoId,
  nome,
  observacoesTecnicas,
  checkinLancado,
}: {
  aulaId: string
  alunoId: string
  nome: string
  observacoesTecnicas: string | null
  checkinLancado: boolean
}) {
  const [dialogo, setDialogo] = useState<DialogoAberto>(null)
  const [checkin, acaoCheckin] = useActionState<EstadoTreino, FormData>(
    acaoLancarCheckin,
    undefined,
  )
  const [observacao, acaoObservacao] = useActionState<EstadoTreino, FormData>(
    acaoAtualizarObservacaoTecnica,
    undefined,
  )

  useEffect(() => {
    if (checkin?.ok || observacao?.ok) setDialogo(null)
  }, [checkin?.ok, observacao?.ok])

  return (
    <>
      <MenuAcoes rotulo={`Ações de ${nome}`}>
        {(fechar) => (
          <>
            <ItemMenu
              icone={Check}
              disabled={checkinLancado}
              onClick={() => {
                fechar()
                setDialogo("checkin")
              }}
            >
              {checkinLancado ? "Check-in já lançado" : "Lançar check-in"}
            </ItemMenu>
            <SeparadorMenu />
            <ItemMenu
              icone={FileText}
              onClick={() => {
                fechar()
                setDialogo("observacao")
              }}
            >
              Fazer observação técnica
            </ItemMenu>
          </>
        )}
      </MenuAcoes>

      <Dialog
        aberto={dialogo === "checkin"}
        aoFechar={() => setDialogo(null)}
        titulo="Lançar check-in"
        descricao={nome}
      >
        <form action={acaoCheckin} className="space-y-4">
          <input type="hidden" name="aulaId" value={aulaId} />
          <input type="hidden" name="alunoId" value={alunoId} />
          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor={`justificativa-${alunoId}`}>
              Justificativa se retroativo
            </label>
            <Input
              id={`justificativa-${alunoId}`}
              name="justificativa"
              placeholder="Ex.: lançamento feito ao final da aula"
            />
          </div>
          {checkin?.erro && <p className="text-sm text-destructive">{checkin.erro}</p>}
          <div className="flex justify-end">
            <BotaoEnviar>
              <Check className="size-4" /> Confirmar check-in
            </BotaoEnviar>
          </div>
        </form>
      </Dialog>

      <Dialog
        aberto={dialogo === "observacao"}
        aoFechar={() => setDialogo(null)}
        titulo="Observação técnica"
        descricao={nome}
      >
        <form action={acaoObservacao} className="space-y-4">
          <input type="hidden" name="aulaId" value={aulaId} />
          <input type="hidden" name="alunoId" value={alunoId} />
          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor={`observacao-${alunoId}`}>
              Observação
            </label>
            <Textarea
              id={`observacao-${alunoId}`}
              name="observacoesTecnicas"
              defaultValue={observacoesTecnicas ?? ""}
              className="min-h-36"
              maxLength={2000}
              placeholder="Registre restrições, cuidados, comportamento ou orientação técnica."
            />
          </div>
          {observacao?.erro && <p className="text-sm text-destructive">{observacao.erro}</p>}
          <div className="flex justify-end">
            <BotaoEnviar variant="secondary">
              <FileText className="size-4" /> Salvar observação
            </BotaoEnviar>
          </div>
        </form>
      </Dialog>
    </>
  )
}

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
import type { ObservacaoTecnicaHistorico } from "@/lib/aula-monitoramento"

type DialogoAberto = "checkin" | "observacao" | null

export function AcoesCardAlunoCheckin({
  aulaId,
  alunoId,
  nome,
  observacoesTecnicas,
  historicoObservacoesTecnicas,
  checkinLancado,
}: {
  aulaId: string
  alunoId: string
  nome: string
  observacoesTecnicas: string | null
  historicoObservacoesTecnicas: ObservacaoTecnicaHistorico[]
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
              Observação atual
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
          <div className="rounded-md border border-border bg-muted/30 p-3">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-sm font-semibold">Histórico de observações</h3>
              <span className="text-xs text-muted-foreground">
                {historicoObservacoesTecnicas.length} registro(s)
              </span>
            </div>
            {historicoObservacoesTecnicas.length > 0 ? (
              <div className="mt-3 max-h-64 space-y-3 overflow-y-auto pr-1">
                {historicoObservacoesTecnicas.map((registro) => (
                  <div key={registro.id} className="border-l-2 border-primary/40 pl-3">
                    <p className="whitespace-pre-wrap text-sm">{registro.observacao}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {registro.registradaEm} · {registro.autor}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="mt-3 text-sm text-muted-foreground">
                Nenhuma observação técnica registrada para este aluno.
              </p>
            )}
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

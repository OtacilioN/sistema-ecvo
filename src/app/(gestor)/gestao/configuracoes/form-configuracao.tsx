"use client"

import { Save } from "lucide-react"
import { useActionState } from "react"
import { acaoAtualizarConfiguracao, type EstadoConfiguracao } from "@/app/actions/configuracoes"
import { BotaoEnviar } from "@/components/ui/botao-enviar"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select } from "@/components/ui/select"

type Configuracao = {
  janelaComparecimentoHoras: number
  prazoCancelamentoHoras: number
  exigirComparecimentoParaCheckin: boolean
  politicaCheckinSemComparecimento: string
  bloqueioInadimplencia: string
  listaEsperaAtiva: boolean
  rankingHorasAtivo: boolean
  notificarComparecimento: boolean
  notificarLembreteTreino: boolean
  notificarCancelamentoAula: boolean
  notificarFinanceiro: boolean
  notificarGraduacao: boolean
  notificarCheckinInvalidado: boolean
  notificarAniversario: boolean
  valorBaseModalidade: number
}

export function FormConfiguracao({
  configuracao,
  somenteLeitura = false,
}: {
  configuracao: Configuracao
  somenteLeitura?: boolean
}) {
  const [estado, acao] = useActionState<EstadoConfiguracao, FormData>(
    acaoAtualizarConfiguracao,
    undefined,
  )

  return (
    <Card>
      <CardHeader>
        <CardTitle>Regras operacionais</CardTitle>
      </CardHeader>
      <CardContent>
        <form action={acao} className="grid gap-5 md:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="janelaComparecimentoHoras">Janela de comparecimento (horas)</Label>
            <Input
              id="janelaComparecimentoHoras"
              name="janelaComparecimentoHoras"
              type="number"
              min={0}
              max={168}
              defaultValue={configuracao.janelaComparecimentoHoras}
              disabled={somenteLeitura}
              required
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="prazoCancelamentoHoras">Prazo de cancelamento (horas)</Label>
            <Input
              id="prazoCancelamentoHoras"
              name="prazoCancelamentoHoras"
              type="number"
              min={0}
              max={168}
              defaultValue={configuracao.prazoCancelamentoHoras}
              disabled={somenteLeitura}
              required
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="politicaCheckinSemComparecimento">Check-in sem comparecimento</Label>
            <Select
              id="politicaCheckinSemComparecimento"
              name="politicaCheckinSemComparecimento"
              defaultValue={configuracao.politicaCheckinSemComparecimento}
              disabled={somenteLeitura}
            >
              <option value="PERMITIR">Permitir</option>
              <option value="BLOQUEAR">Bloquear</option>
              <option value="APENAS_COM_APROVACAO">Apenas com aprovação</option>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="bloqueioInadimplencia">Bloqueio por inadimplência</Label>
            <Select
              id="bloqueioInadimplencia"
              name="bloqueioInadimplencia"
              defaultValue={configuracao.bloqueioInadimplencia}
              disabled={somenteLeitura}
            >
              <option value="APENAS_ALERTAR">Apenas alertar</option>
              <option value="BLOQUEAR_COMPARECIMENTO">Bloquear comparecimento</option>
              <option value="BLOQUEAR_CHECKIN">Bloquear check-in</option>
              <option value="SEM_BLOQUEIO">Sem bloqueio</option>
            </Select>
          </div>

          <fieldset className="space-y-3 rounded-md border border-border p-4 md:col-span-2">
            <legend className="px-1 text-sm font-medium text-muted-foreground">
              Opções de funcionamento
            </legend>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="exigirComparecimentoParaCheckin"
                defaultChecked={configuracao.exigirComparecimentoParaCheckin}
                disabled={somenteLeitura}
                className="accent-primary"
              />
              Exigir comparecimento prévio para check-in do aluno
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="listaEsperaAtiva"
                defaultChecked={configuracao.listaEsperaAtiva}
                disabled={somenteLeitura}
                className="accent-primary"
              />
              Ativar lista de espera quando a turma atingir a capacidade
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="rankingHorasAtivo"
                defaultChecked={configuracao.rankingHorasAtivo}
                disabled={somenteLeitura}
                className="accent-primary"
              />
              Exibir ranking de horas treinadas
            </label>
          </fieldset>

          <fieldset className="grid gap-4 rounded-md border border-border p-4 md:col-span-2 md:grid-cols-3">
            <legend className="px-1 text-sm font-medium text-muted-foreground">Financeiro</legend>
            <div className="space-y-1.5">
              <Label htmlFor="valorBaseModalidade">Valor base por modalidade</Label>
              <Input
                id="valorBaseModalidade"
                name="valorBaseModalidade"
                type="number"
                min={0.01}
                step="0.01"
                defaultValue={configuracao.valorBaseModalidade}
                disabled={somenteLeitura}
                required
              />
            </div>
            <CampoSomenteLeitura rotulo="Professor" valor="60%" />
            <CampoSomenteLeitura rotulo="Sócios" valor="20% + 20%" />
          </fieldset>

          <fieldset className="space-y-3 rounded-md border border-border p-4 md:col-span-2">
            <legend className="px-1 text-sm font-medium text-muted-foreground">Notificações</legend>
            <OpcaoNotificacao
              nome="notificarComparecimento"
              ativo={configuracao.notificarComparecimento}
              rotulo="Comparecimento e no-show"
              disabled={somenteLeitura}
            />
            <OpcaoNotificacao
              nome="notificarLembreteTreino"
              ativo={configuracao.notificarLembreteTreino}
              rotulo="Lembrete de treino"
              disabled={somenteLeitura}
            />
            <OpcaoNotificacao
              nome="notificarCancelamentoAula"
              ativo={configuracao.notificarCancelamentoAula}
              rotulo="Cancelamento de aula"
              disabled={somenteLeitura}
            />
            <OpcaoNotificacao
              nome="notificarFinanceiro"
              ativo={configuracao.notificarFinanceiro}
              rotulo="Financeiro"
              disabled={somenteLeitura}
            />
            <OpcaoNotificacao
              nome="notificarGraduacao"
              ativo={configuracao.notificarGraduacao}
              rotulo="Graduação e exames"
              disabled={somenteLeitura}
            />
            <OpcaoNotificacao
              nome="notificarCheckinInvalidado"
              ativo={configuracao.notificarCheckinInvalidado}
              rotulo="Check-in invalidado"
              disabled={somenteLeitura}
            />
            <OpcaoNotificacao
              nome="notificarAniversario"
              ativo={configuracao.notificarAniversario}
              rotulo="Aniversários"
              disabled={somenteLeitura}
            />
          </fieldset>

          {!somenteLeitura && (
            <div className="flex items-center gap-3 md:col-span-2">
              <BotaoEnviar>
                <Save className="size-4" /> Salvar regras
              </BotaoEnviar>
              {estado?.erro && <p className="text-sm text-destructive">{estado.erro}</p>}
              {estado?.ok && <p className="text-sm text-success">Configurações atualizadas.</p>}
            </div>
          )}
        </form>
      </CardContent>
    </Card>
  )
}

function CampoSomenteLeitura({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{rotulo}</p>
      <p className="mt-2 text-sm font-medium">{valor}</p>
    </div>
  )
}

function OpcaoNotificacao({
  nome,
  ativo,
  rotulo,
  disabled,
}: {
  nome: string
  ativo: boolean
  rotulo: string
  disabled?: boolean
}) {
  return (
    <label className="flex items-center gap-2 text-sm">
      <input
        type="checkbox"
        name={nome}
        defaultChecked={ativo}
        disabled={disabled}
        className="accent-primary"
      />
      {rotulo}
    </label>
  )
}

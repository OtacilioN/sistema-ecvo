"use client"

import {
  BadgeCheck,
  CalendarDays,
  Check,
  FileImage,
  LockKeyhole,
  MapPin,
  Upload,
} from "lucide-react"
import { useActionState, useMemo, useState } from "react"
import { acaoSolicitarMatricula } from "@/app/actions/matriculas"
import { BotaoEnviar } from "@/components/ui/botao-enviar"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { rotuloDiaSemana } from "@/lib/utils/datas"
import { formatarBRL } from "@/lib/utils/formato"
import type { TipoPagamentoMatriculaPublica } from "./page"

type Modalidade = Awaited<
  ReturnType<typeof import("@/lib/services/matricula.service").listarOpcoesPublicasMatricula>
>[number]

const classeCheckboxMatricula = "mt-0.5 size-5 shrink-0 cursor-pointer accent-primary"

export function FormMatricula({
  modalidades,
  planoPadrao,
  tipoPagamento,
}: {
  modalidades: Modalidade[]
  planoPadrao: { nome: string; valor: number } | null
  tipoPagamento: TipoPagamentoMatriculaPublica
}) {
  const [estado, acao] = useActionState(acaoSolicitarMatricula, undefined)
  const [modalidadeId, setModalidadeId] = useState("")
  const [arquivo, setArquivo] = useState<File | null>(null)
  const modalidade = useMemo(
    () => modalidades.find((item) => item.id === modalidadeId),
    [modalidadeId, modalidades],
  )
  const parceiro = tipoPagamento === "WELLHUB" ? "Wellhub" : "TotalPass"
  const planoMinimo = tipoPagamento === "WELLHUB" ? "Basic" : "TP1+"
  const matriculaExterna = tipoPagamento !== "MENSALISTA"

  return (
    <form action={acao} className="grid lg:grid-cols-[minmax(0,1fr)_minmax(280px,0.72fr)]">
      <input type="hidden" name="tipoPagamento" value={tipoPagamento} />
      <div className="space-y-8 p-5 sm:p-8">
        <p className="text-xs text-muted-foreground">
          <span aria-hidden="true" className="font-semibold text-destructive">
            *
          </span>{" "}
          Campos obrigatórios
        </p>

        <Secao
          numero="02"
          titulo="Seus dados"
          descricao="Informações para criar seu acesso após a aprovação."
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <Campo
              id="nome"
              rotulo="Nome completo"
              autoComplete="name"
              required
              className="sm:col-span-2"
            />
            <Campo
              id="cpf"
              rotulo="CPF"
              inputMode="numeric"
              autoComplete="off"
              placeholder="000.000.000-00"
              required
            />
            <Campo id="dataNascimento" rotulo="Data de nascimento" type="date" />
            <Campo id="telefone" rotulo="Telefone / WhatsApp" type="tel" autoComplete="tel" />
            <Campo id="contatoEmergencia" rotulo="Contato de emergência" type="tel" />
            <Campo
              id="endereco"
              rotulo="Endereço"
              autoComplete="street-address"
              className="sm:col-span-2"
            />
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="restricoesMedicas">
                Restrições médicas ou cuidados importantes{" "}
                <span className="font-normal text-muted-foreground">(opcional)</span>
              </Label>
              <Textarea
                id="restricoesMedicas"
                name="restricoesMedicas"
                rows={3}
                placeholder="Opcional. Informe somente o que for relevante para a prática segura."
              />
            </div>
          </div>
        </Secao>

        <Secao
          numero="03"
          titulo="Seu acesso"
          descricao="Você usará estes dados depois que a matrícula for aprovada."
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <Campo
              id="email"
              rotulo="E-mail"
              type="email"
              autoComplete="email"
              required
              className="sm:col-span-2"
            />
            <Campo
              id="senha"
              rotulo="Senha"
              type="password"
              autoComplete="new-password"
              minLength={6}
              required
            />
            <Campo
              id="confirmarSenha"
              rotulo="Confirmar senha"
              type="password"
              autoComplete="new-password"
              minLength={6}
              required
            />
          </div>
        </Secao>

        {tipoPagamento === "MENSALISTA" && (
          <Secao
            numero="04"
            titulo="Comprovante PIX"
            descricao="Opcional. O pagamento será confirmado pelo Asaas; o anexo fica como evidência adicional."
          >
            <label className="group flex cursor-pointer items-center gap-4 rounded-lg border border-dashed border-border bg-muted/25 p-4 transition-colors hover:border-primary/60 hover:bg-primary/5">
              <span className="flex size-11 shrink-0 items-center justify-center rounded-md bg-card text-primary shadow-sm">
                {arquivo ? <FileImage className="size-5" /> : <Upload className="size-5" />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">
                  {arquivo?.name ?? "Selecionar comprovante"}
                </span>
                <span className="mt-1 block text-xs text-muted-foreground">
                  {arquivo
                    ? `${(arquivo.size / 1024 / 1024).toFixed(2)} MB`
                    : "JPG, PNG, WebP ou PDF · até 3 MB"}
                </span>
              </span>
              {arquivo && <Check className="size-5 shrink-0 text-success" />}
              <Input
                type="file"
                name="comprovante"
                accept="image/jpeg,image/png,image/webp,application/pdf"
                className="sr-only"
                onChange={(evento) => setArquivo(evento.currentTarget.files?.[0] ?? null)}
              />
            </label>
          </Secao>
        )}

        {tipoPagamento === "MENSALISTA" && planoPadrao && (
          <Secao
            numero="05"
            titulo="Primeira mensalidade"
            descricao="Ao enviar os dados, você receberá o QR Code PIX para concluir a solicitação."
          >
            <div className="rounded-lg border border-primary/25 bg-primary/5 p-4">
              <p className="font-medium">{planoPadrao.nome}</p>
              <p className="mt-1 text-2xl font-bold text-primary">
                {formatarBRL(planoPadrao.valor)}
                <span className="text-sm font-normal text-muted-foreground"> / mês</span>
              </p>
            </div>
          </Secao>
        )}

        {matriculaExterna && (
          <Secao
            numero="04"
            titulo={`Confirmação ${parceiro}`}
            descricao="Esta declaração é obrigatória para enviar a solicitação."
          >
            <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-primary/30 bg-primary/5 p-4 text-sm">
              <input
                type="checkbox"
                name="beneficioAtivoDeclarado"
                required
                className={classeCheckboxMatricula}
              />
              <span>
                <span className="block font-medium">
                  Declaro ter o {parceiro} ativo a partir do plano {planoMinimo}.
                  <IndicadorObrigatorio />
                </span>
                <span className="mt-1 block text-xs text-muted-foreground">
                  Não haverá pagamento de matrícula ou mensalidade à ECVO neste fluxo.
                </span>
              </span>
            </label>
          </Secao>
        )}

        <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-border bg-muted/20 p-4 text-sm">
          <input type="checkbox" name="aceiteDados" required className={classeCheckboxMatricula} />
          <span className="text-muted-foreground">
            Confirmo que os dados são verdadeiros e autorizo seu uso para análise e efetivação da
            matrícula.
            <IndicadorObrigatorio />
          </span>
        </label>

        {estado?.erro && (
          <p
            className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
            role="alert"
          >
            {estado.erro}
          </p>
        )}

        <BotaoEnviar size="lg" className="w-full sm:w-auto">
          {matriculaExterna ? `Enviar matrícula ${parceiro}` : "Continuar para o pagamento PIX"}
        </BotaoEnviar>
      </div>

      <aside className="order-first border-b border-border bg-muted/25 p-5 sm:p-8 lg:order-none lg:border-b-0 lg:border-l">
        <div className="sticky top-6 space-y-5">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">
              {matriculaExterna ? `Acesso por ${parceiro}` : "Plano mensalista"}
            </p>
            <h2 className="mt-2 text-xl font-bold tracking-tight">Escolha sua modalidade</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              A grade muda automaticamente conforme sua escolha.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="modalidadeId">
              Modalidade
              <IndicadorObrigatorio />
            </Label>
            <Select
              id="modalidadeId"
              name="modalidadeId"
              value={modalidadeId}
              onChange={(evento) => setModalidadeId(evento.currentTarget.value)}
              required
            >
              <option value="">Selecione uma modalidade</option>
              {modalidades.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.nome}
                </option>
              ))}
            </Select>
          </div>

          {!modalidade && (
            <div className="rounded-lg border border-dashed border-border bg-card p-6 text-center">
              <CalendarDays className="mx-auto size-6 text-muted-foreground" />
              <p className="mt-3 text-sm text-muted-foreground">
                Selecione uma modalidade para ver os horários disponíveis.
              </p>
            </div>
          )}

          {modalidade && (
            <div className="space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold">Grade semanal</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Horários para consulta — não é necessário selecionar.
                  </p>
                </div>
                <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                  {rotuloQuantidadeHorarios(modalidade.turmas.length)}
                </span>
              </div>
              {modalidade.turmas.length === 0 ? (
                <div className="rounded-lg border border-dashed border-border bg-card p-5 text-sm text-muted-foreground">
                  Nenhum horário publicado no momento. Você ainda pode enviar a matrícula; a equipe
                  entrará em contato.
                </div>
              ) : (
                <ul className="divide-y divide-border border-y border-border/70">
                  {modalidade.turmas.map((turma) => (
                    <li
                      key={turma.id}
                      className="grid gap-1 py-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:gap-4"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium">
                          {rotuloDias(turma.diasSemana, turma.diaSemana)}
                        </p>
                        {(turma.nivel || turma.local) && (
                          <p className="mt-1 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                            {turma.nivel && <span>{turma.nivel}</span>}
                            {turma.nivel && turma.local && <span aria-hidden="true">·</span>}
                            {turma.local && (
                              <span className="inline-flex items-center gap-1">
                                <MapPin className="size-3" /> {turma.local}
                              </span>
                            )}
                          </p>
                        )}
                      </div>
                      <p className="text-base font-semibold tabular-nums sm:text-right">
                        {turma.horaInicio}–{turma.horaFim}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          <div className="flex gap-3 border-t border-border pt-5 text-xs text-muted-foreground">
            {matriculaExterna ? (
              <BadgeCheck className="mt-0.5 size-4 shrink-0" />
            ) : (
              <LockKeyhole className="mt-0.5 size-4 shrink-0" />
            )}
            <p>
              {matriculaExterna
                ? `O check-in será liberado após a análise da matrícula ${parceiro}.`
                : "O check-in só é liberado depois da aprovação e do vínculo do plano."}
            </p>
          </div>
        </div>
      </aside>
    </form>
  )
}

function Secao({
  numero,
  titulo,
  descricao,
  children,
}: {
  numero: string
  titulo: string
  descricao: string
  children: React.ReactNode
}) {
  return (
    <fieldset className="space-y-4">
      <legend className="mb-4 flex items-start gap-3">
        <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-foreground text-[11px] font-bold text-background">
          {numero}
        </span>
        <span>
          <span className="block font-semibold">{titulo}</span>
          <span className="mt-0.5 block text-xs font-normal text-muted-foreground">
            {descricao}
          </span>
        </span>
      </legend>
      {children}
    </fieldset>
  )
}

function Campo({
  id,
  rotulo,
  className,
  required,
  ...props
}: React.ComponentProps<typeof Input> & { id: string; rotulo: string }) {
  return (
    <div className={`space-y-1.5 ${className ?? ""}`}>
      <Label htmlFor={id}>
        {rotulo}
        {required && <IndicadorObrigatorio />}
      </Label>
      <Input id={id} name={id} required={required} {...props} />
    </div>
  )
}

function IndicadorObrigatorio() {
  return (
    <>
      <span aria-hidden="true" className="ml-0.5 text-destructive">
        *
      </span>
      <span className="sr-only"> (obrigatório)</span>
    </>
  )
}

function rotuloDias(diasSemana: number[], diaSemana: number | null) {
  const dias = diasSemana.length > 0 ? diasSemana : diaSemana === null ? [] : [diaSemana]
  return dias.length > 0 ? dias.map(rotuloDiaSemana).join(" · ") : "Consulte a equipe"
}

function rotuloQuantidadeHorarios(quantidade: number) {
  return quantidade === 1 ? "1 horário" : `${quantidade} horários`
}

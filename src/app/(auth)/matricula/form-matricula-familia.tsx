"use client"

import { CalendarDays, LockKeyhole, MapPin, Users } from "lucide-react"
import { useActionState, useState } from "react"
import { acaoSolicitarMatriculaFamilia } from "@/app/actions/matriculas"
import { BotaoEnviar } from "@/components/ui/botao-enviar"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { rotuloDiaSemana } from "@/lib/utils/datas"
import { formatarBRL } from "@/lib/utils/formato"

type Modalidades = Awaited<
  ReturnType<typeof import("@/lib/services/matricula.service").listarOpcoesPublicasMatricula>
>

const indicesPessoas = [0, 1, 2, 3] as const

export function FormMatriculaFamilia({
  modalidades,
  plano,
}: {
  modalidades: Modalidades
  plano: { id: string; nome: string; valor: number }
}) {
  const [estado, acao, enviando] = useActionState(acaoSolicitarMatriculaFamilia, undefined)
  const [quantidadePessoas, setQuantidadePessoas] = useState(2)
  const [modalidadeIds, setModalidadeIds] = useState(["", "", "", ""])
  const total = plano.valor * quantidadePessoas
  const todasModalidadesSelecionadas = modalidadeIds
    .slice(0, quantidadePessoas)
    .every((id) => modalidades.some((modalidade) => modalidade.id === id))

  return (
    <form action={acao} className="grid lg:grid-cols-[minmax(0,1fr)_minmax(280px,0.72fr)]">
      <input type="hidden" name="tipoPagamento" value="FAMILIA" />
      <div className="space-y-8 p-5 sm:p-8">
        <div className="space-y-2">
          <Label htmlFor="quantidadePessoas">Quantidade de pessoas</Label>
          <Select
            id="quantidadePessoas"
            name="quantidadePessoas"
            value={quantidadePessoas}
            disabled={enviando}
            onChange={(evento) => setQuantidadePessoas(Number(evento.currentTarget.value))}
          >
            {[2, 3, 4].map((quantidade) => (
              <option key={quantidade} value={quantidade}>
                {quantidade} pessoas
              </option>
            ))}
          </Select>
          <p className="text-xs text-muted-foreground">
            O plano família está disponível para 2, 3 ou 4 pessoas. Preencha os dados e o acesso
            individual de cada pessoa.
          </p>
          <p className="text-xs text-muted-foreground">
            <span aria-hidden="true" className="font-semibold text-destructive">
              *
            </span>{" "}
            Campos obrigatórios
          </p>
        </div>

        {indicesPessoas.map((indice) => (
          <PessoaFamilia
            key={indice}
            indice={indice}
            ativa={indice < quantidadePessoas}
            enviando={enviando}
            modalidades={modalidades}
            modalidadeId={modalidadeIds[indice]}
            onModalidadeChange={(id) =>
              setModalidadeIds((atuais) =>
                atuais.map((atual, posicao) => (posicao === indice ? id : atual)),
              )
            }
          />
        ))}

        <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-border bg-muted/20 p-4 text-sm">
          <input
            type="checkbox"
            name="aceiteDados"
            required
            disabled={enviando}
            className="mt-0.5 size-5 shrink-0 cursor-pointer accent-primary"
          />
          <span className="text-muted-foreground">
            Confirmo que os dados de todas as pessoas são verdadeiros e autorizo seu uso para
            análise e efetivação da matrícula.
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

        <BotaoEnviar
          size="lg"
          className="w-full sm:w-auto"
          disabled={modalidades.length === 0 || !todasModalidadesSelecionadas}
        >
          Continuar para o PIX de {formatarBRL(total)}
        </BotaoEnviar>
      </div>

      <aside className="order-first border-b border-border bg-muted/25 p-5 sm:p-8 lg:order-none lg:border-b-0 lg:border-l">
        <div className="sticky top-6 space-y-5">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">
              Plano família
            </p>
            <h2 className="mt-2 text-xl font-bold tracking-tight">
              Uma matrícula para sua família
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Cada pessoa terá seu próprio cadastro, acesso e uma modalidade à escolha.
            </p>
          </div>

          <div
            className="rounded-lg border border-primary/25 bg-primary/5 p-4"
            data-testid="plano-matricula-familia"
            aria-live="polite"
          >
            <p className="font-medium">{plano.nome}</p>
            <p className="mt-2 text-sm text-muted-foreground">
              {formatarBRL(plano.valor)} por pessoa / mês
            </p>
            <p className="mt-3 flex items-center gap-2 text-sm">
              <Users className="size-4" /> {quantidadePessoas} pessoas
            </p>
            <p className="mt-2 text-2xl font-bold text-primary">
              {formatarBRL(total)}
              <span className="text-sm font-normal text-muted-foreground"> / mês</span>
            </p>
            <p className="mt-3 text-xs text-muted-foreground">
              Você pagará um único PIX de {formatarBRL(total)} para a primeira mensalidade de todas
              as pessoas.
            </p>
          </div>

          <div className="flex gap-3 border-t border-border pt-5 text-xs text-muted-foreground">
            <LockKeyhole className="mt-0.5 size-4 shrink-0" />
            <p>
              As matrículas serão efetivadas juntas após a confirmação do pagamento. Cada pessoa
              será associada ao plano {plano.nome} de {formatarBRL(plano.valor)} por mês.
            </p>
          </div>
        </div>
      </aside>
    </form>
  )
}

function PessoaFamilia({
  indice,
  ativa,
  enviando,
  modalidades,
  modalidadeId,
  onModalidadeChange,
}: {
  indice: number
  ativa: boolean
  enviando: boolean
  modalidades: Modalidades
  modalidadeId: string
  onModalidadeChange: (id: string) => void
}) {
  const prefixo = `pessoas.${indice}`
  const modalidade = modalidades.find((item) => item.id === modalidadeId)
  const autocomplete = `section-pessoa${indice}`

  // Campos continuam montados ao reduzir a quantidade, mas não são validados nem enviados.
  return (
    <fieldset
      hidden={!ativa}
      disabled={!ativa || enviando}
      className="space-y-5 rounded-lg border border-border p-4 sm:p-5"
      data-testid={`pessoa-familia-${indice + 1}`}
    >
      <legend className="px-2 text-base font-semibold">Pessoa {indice + 1}</legend>
      <div className="grid gap-4 sm:grid-cols-2">
        <Campo
          id={`${prefixo}.nome`}
          rotulo="Nome completo"
          autoComplete={`${autocomplete} name`}
          required
          className="sm:col-span-2"
        />
        <Campo
          id={`${prefixo}.cpf`}
          rotulo="CPF"
          inputMode="numeric"
          autoComplete="off"
          placeholder="000.000.000-00"
          required
        />
        <Campo id={`${prefixo}.dataNascimento`} rotulo="Data de nascimento" type="date" />
        <Campo
          id={`${prefixo}.telefone`}
          rotulo="Telefone / WhatsApp"
          type="tel"
          autoComplete={`${autocomplete} tel`}
        />
        <Campo id={`${prefixo}.contatoEmergencia`} rotulo="Contato de emergência" type="tel" />
        <Campo
          id={`${prefixo}.endereco`}
          rotulo="Endereço"
          autoComplete={`${autocomplete} street-address`}
          className="sm:col-span-2"
        />
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor={`${prefixo}.restricoesMedicas`}>
            Restrições médicas ou cuidados importantes{" "}
            <span className="font-normal text-muted-foreground">(opcional)</span>
          </Label>
          <Textarea
            id={`${prefixo}.restricoesMedicas`}
            name={`${prefixo}.restricoesMedicas`}
            rows={3}
            placeholder="Opcional. Informe somente o que for relevante para a prática segura."
          />
        </div>
      </div>

      <div className="space-y-3 border-t border-border pt-4">
        <p className="text-sm font-semibold">Acesso individual</p>
        <p className="text-xs text-muted-foreground">
          Informe um e-mail e CPF diferentes para cada pessoa.
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <Campo
            id={`${prefixo}.email`}
            rotulo="E-mail"
            type="email"
            autoComplete={`${autocomplete} email`}
            required
            className="sm:col-span-2"
          />
          <Campo
            id={`${prefixo}.senha`}
            rotulo="Senha"
            type="password"
            autoComplete={`${autocomplete} new-password`}
            minLength={6}
            required
          />
          <Campo
            id={`${prefixo}.confirmarSenha`}
            rotulo="Confirmar senha"
            type="password"
            autoComplete={`${autocomplete} new-password`}
            minLength={6}
            required
          />
        </div>
      </div>

      <div className="space-y-3 border-t border-border pt-4">
        <div className="space-y-1.5">
          <Label htmlFor={`${prefixo}.modalidadeIds`}>
            Modalidade
            <IndicadorObrigatorio />
          </Label>
          <Select
            id={`${prefixo}.modalidadeIds`}
            name={`${prefixo}.modalidadeIds`}
            value={modalidadeId}
            onChange={(evento) => onModalidadeChange(evento.currentTarget.value)}
            required
            disabled={modalidades.length === 0}
          >
            <option value="">Selecione uma modalidade</option>
            {modalidades.map((item) => (
              <option key={item.id} value={item.id}>
                {item.nome}
              </option>
            ))}
          </Select>
        </div>
        {!modalidade ? (
          <div className="flex items-start gap-2 rounded-lg border border-dashed border-border p-4 text-xs text-muted-foreground">
            <CalendarDays className="size-4 shrink-0" />
            <p>
              {modalidades.length === 0
                ? "Nenhuma modalidade disponível para matrícula no momento."
                : "Selecione uma modalidade para consultar os horários desta pessoa."}
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">
              Horários para consulta — não é necessário selecionar.
            </p>
            {modalidade.turmas.length === 0 ? (
              <p className="rounded-lg border border-dashed border-border p-4 text-xs text-muted-foreground">
                Nenhum horário publicado no momento. A equipe entrará em contato.
              </p>
            ) : (
              <ul className="divide-y divide-border border-y border-border/70">
                {modalidade.turmas.map((turma) => {
                  const dias =
                    turma.diasSemana.length > 0
                      ? turma.diasSemana
                      : turma.diaSemana === null
                        ? []
                        : [turma.diaSemana]
                  return (
                    <li key={turma.id} className="space-y-1 py-3">
                      <p className="text-sm font-medium">
                        {dias.length > 0
                          ? dias.map(rotuloDiaSemana).join(" · ")
                          : "Consulte a equipe"}
                      </p>
                      <p className="text-sm font-semibold tabular-nums">
                        {turma.horaInicio}–{turma.horaFim}
                      </p>
                      {(turma.nivel || turma.local) && (
                        <p className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                          {turma.nivel && <span>{turma.nivel}</span>}
                          {turma.local && (
                            <span className="inline-flex items-center gap-1">
                              <MapPin className="size-3" /> {turma.local}
                            </span>
                          )}
                        </p>
                      )}
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        )}
      </div>
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

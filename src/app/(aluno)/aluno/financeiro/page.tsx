import { AlertTriangle, Repeat2 } from "lucide-react"
import QRCode from "qrcode"
import { AvisoCpfPendente } from "@/components/aviso-cpf-pendente"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { situacaoConversaoAulaAvulsa } from "@/lib/aula-avulsa"
import { exigirAluno } from "@/lib/auth/dal"
import { db } from "@/lib/db"
import { resumoAdimplencia } from "@/lib/financeiro/adimplencia"
import { mensalistaAdimplente, statusMensalidadeEfetivo } from "@/lib/services/financeiro.service"
import {
  obterConversaoAulaAvulsa,
  pixCobrancaMatriculaDisponivel,
} from "@/lib/services/pagamento-matricula.service"
import { chaveCompetencia, formatarData, formatarDataHora } from "@/lib/utils/datas"
import { formatarBRL } from "@/lib/utils/formato"
import { FecharMensalidadeAulaAvulsa } from "./fechar-mensalidade-aula-avulsa"
import { CancelarPixAutomatico, PagamentoPix, ProgramarPixRecorrente } from "./pagamento-pix"

export const dynamic = "force-dynamic"

export default async function Page() {
  const { alunoId } = await exigirAluno()
  const [aluno, acessoAulaAvulsa] = await Promise.all([
    db.aluno.findUnique({
      where: { id: alunoId },
      include: {
        plano: true,
        responsavel: { select: { cpf: true, responsavelFinanceiro: true } },
        modalidadesPlano: { select: { modalidade: { select: { nome: true } } } },
        mensalidades: {
          orderBy: { vencimento: "desc" },
          take: 12,
          include: { cobrancasAsaas: { orderBy: { geracao: "desc" }, take: 1 } },
        },
        contratosPixAutomatico: { orderBy: { criadoEm: "desc" }, take: 1 },
        pagamentos: { orderBy: { criadoEm: "desc" }, take: 12 },
      },
    }),
    obterConversaoAulaAvulsa(alunoId),
  ])

  if (!aluno) return null

  const agora = new Date()
  const temMensalidadeInterna = Boolean(aluno.planoId)
  const adimplente = temMensalidadeInterna ? mensalistaAdimplente(aluno.mensalidades, agora) : true
  const tipoSomenteExterno =
    !temMensalidadeInterna && (aluno.tipo === "WELLHUB" || aluno.tipo === "TOTALPASS")
  const mensalidadePendente = [...aluno.mensalidades]
    .sort((a, b) => a.vencimento.getTime() - b.vencimento.getTime())
    .find((mensalidade) =>
      ["EM_ABERTO", "VENCIDA"].includes(statusMensalidadeEfetivo(mensalidade, agora)),
    )
  const mensalidadesComResumo = aluno.mensalidades.map((mensalidade) => ({
    mensalidade,
    resumo: resumoAdimplencia(mensalidade, agora),
  }))
  const descontosEmAtraso = mensalidadesComResumo.filter(
    ({ mensalidade, resumo }) =>
      ["EM_ABERTO", "VENCIDA"].includes(mensalidade.status) &&
      resumo.temDesconto &&
      resumo.diasAtraso > 0,
  )
  const temDescontoPerdido = descontosEmAtraso.some(({ resumo }) => !resumo.descontoAtivo)
  const planoTemDesconto = Boolean(
    aluno.plano && Number(aluno.plano.valorBase) > Number(aluno.plano.valor),
  )
  const contratoPixAutomatico = aluno.contratosPixAutomatico[0]
  const totalCiclos = contratoPixAutomatico?.totalCiclos === 3 ? 3 : 6
  const planoPermiteRecorrencia = Boolean(
    aluno.plano?.ativo &&
      aluno.plano.periodicidade === "MENSAL" &&
      Number(aluno.plano.valor) > 0 &&
      ["ATIVO", "INADIMPLENTE"].includes(aluno.status),
  )
  const competenciaAtualQuitada = aluno.mensalidades.some(
    (mensalidade) =>
      mensalidade.competencia === chaveCompetencia(agora) &&
      ["PAGA", "ISENTA"].includes(mensalidade.status),
  )
  const situacaoConversao = acessoAulaAvulsa
    ? situacaoConversaoAulaAvulsa({ inicioAula: acessoAulaAvulsa.aula.inicio, agora })
    : null
  const cobrancaComplemento = acessoAulaAvulsa?.solicitacao.cobrancasAsaas[0] ?? null
  const pixComplementoDisponivel = cobrancaComplemento
    ? pixCobrancaMatriculaDisponivel(cobrancaComplemento, agora)
    : false
  const qrCodeComplementoDataUrl =
    pixComplementoDisponivel && cobrancaComplemento?.pixCopiaECola
      ? await QRCode.toDataURL(cobrancaComplemento.pixCopiaECola, { margin: 1 })
      : null
  const contratoCriandoExpirado = Boolean(
    contratoPixAutomatico?.status === "CRIANDO" &&
      agora.getTime() - contratoPixAutomatico.atualizadoEm.getTime() >= 2 * 60 * 1_000,
  )
  const contratoAutomaticoEmAndamento = Boolean(
    contratoPixAutomatico &&
      ((contratoPixAutomatico.status === "CRIANDO" && !contratoCriandoExpirado) ||
        ["PENDENTE_AUTORIZACAO", "ATIVO", "CANCELANDO"].includes(contratoPixAutomatico.status)),
  )
  const qrAutomaticoValido = Boolean(
    contratoPixAutomatico?.status === "PENDENTE_AUTORIZACAO" &&
      contratoPixAutomatico.pixCopiaECola &&
      contratoPixAutomatico.qrCodeExpiraEm &&
      contratoPixAutomatico.qrCodeExpiraEm > agora,
  )
  const cobrancaMensal = mensalidadePendente?.cobrancasAsaas[0]
  const numeroCicloAtual =
    mensalidadePendente?.contratoPixAutomaticoId === contratoPixAutomatico?.id
      ? mensalidadePendente?.numeroCicloPix
      : null
  const precoCobrancaAtual = Boolean(
    mensalidadePendente &&
      cobrancaMensal &&
      Math.abs(
        Number(cobrancaMensal.valorCobrado ?? mensalidadePendente.valor) -
          resumoAdimplencia(mensalidadePendente, agora).valorAtual,
      ) < 0.001 &&
      cobrancaMensal.status !== "RECEBIDA",
  )
  const fallbackAutomatico = Boolean(
    contratoPixAutomatico?.status === "ATIVO" &&
      cobrancaMensal &&
      ["PIX_AUTOMATICO_RECORRENTE", "PIX_AUTOMATICO_FALLBACK"].includes(cobrancaMensal.tipo) &&
      cobrancaMensal.asaasPaymentId &&
      (["RECUSADA", "CANCELADA", "VENCIDA"].includes(cobrancaMensal.status) ||
        cobrancaMensal.pixCopiaECola),
  )
  const qrFallbackAutomaticoValido = Boolean(
    fallbackAutomatico &&
      precoCobrancaAtual &&
      cobrancaMensal?.pixCopiaECola &&
      cobrancaMensal.qrCodeExpiraEm &&
      cobrancaMensal.qrCodeExpiraEm > agora,
  )
  const qrMensalValido = Boolean(
    !contratoAutomaticoEmAndamento &&
      precoCobrancaAtual &&
      cobrancaMensal?.tipo === "PIX_MENSAL" &&
      cobrancaMensal.ativa &&
      ["PENDENTE", "VENCIDA"].includes(cobrancaMensal.status) &&
      cobrancaMensal.pixCopiaECola &&
      cobrancaMensal.qrCodeExpiraEm &&
      cobrancaMensal.qrCodeExpiraEm > agora,
  )
  const pixCopiaECola = qrAutomaticoValido
    ? contratoPixAutomatico?.pixCopiaECola
    : qrFallbackAutomaticoValido
      ? cobrancaMensal?.pixCopiaECola
      : qrMensalValido
        ? cobrancaMensal?.pixCopiaECola
        : null
  const qrCodeDataUrl = pixCopiaECola ? await QRCode.toDataURL(pixCopiaECola, { margin: 1 }) : null
  const cobrancaMensalBloqueiaTroca = Boolean(
    cobrancaMensal && cobrancaMensal.tipo === "PIX_MENSAL" && cobrancaMensal.ativa,
  )

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold tracking-tight">Financeiro</h1>
        <p className="text-sm text-muted-foreground">Plano, mensalidades e pagamentos.</p>
      </div>

      <AvisoCpfPendente cpf={aluno.cpf} responsavel={aluno.responsavel} />

      {(planoTemDesconto || descontosEmAtraso.length > 0) && (
        <section
          aria-labelledby="aviso-desconto-adimplencia"
          className={
            temDescontoPerdido
              ? "rounded-xl border-2 border-destructive bg-destructive/10 p-5 sm:p-6"
              : "rounded-xl border-2 border-amber-500 bg-amber-50 p-5 text-amber-950 sm:p-6 dark:bg-amber-950/40 dark:text-amber-100"
          }
        >
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 size-6 shrink-0" aria-hidden="true" />
            <div className="space-y-3">
              <h2 id="aviso-desconto-adimplencia" className="text-lg font-bold sm:text-xl">
                {temDescontoPerdido
                  ? "Desconto de adimplência perdido"
                  : descontosEmAtraso.length > 0
                    ? "Seu desconto de adimplência está em risco"
                    : "Mantenha seu desconto de adimplência"}
              </h2>
              <p className="text-sm">
                O desconto vale até o vencimento. A partir do dia seguinte ao vencimento, a
                mensalidade passa ao valor base, sem desconto.
              </p>
              {descontosEmAtraso.length > 0 ? (
                <ul className="space-y-3 text-sm">
                  {descontosEmAtraso.map(({ mensalidade, resumo }) => (
                    <li key={mensalidade.id}>
                      <strong>Mensalidade {mensalidade.competencia}:</strong>{" "}
                      {resumo.descontoAtivo ? (
                        <>
                          pague <strong>{formatarBRL(resumo.valorComDesconto)}</strong> até{" "}
                          <strong>{formatarData(resumo.ultimoDiaComDesconto)}</strong> para manter o
                          desconto. Em {formatarData(resumo.perdeDescontoEm)}, o valor passa para{" "}
                          <strong>{formatarBRL(resumo.valorBase)}</strong>.
                        </>
                      ) : (
                        <>
                          o prazo terminou em {formatarData(resumo.ultimoDiaComDesconto)}. O valor
                          atual é <strong>{formatarBRL(resumo.valorAtual)}</strong>, sem o desconto
                          de {formatarBRL(resumo.valorBase - resumo.valorComDesconto)}.
                        </>
                      )}
                    </li>
                  ))}
                </ul>
              ) : (
                aluno.plano && (
                  <p className="text-sm">
                    Seu plano custa <strong>{formatarBRL(Number(aluno.plano.valor))}</strong> com
                    desconto. Após esse prazo, o valor será de{" "}
                    <strong>{formatarBRL(Number(aluno.plano.valorBase))}</strong>.
                  </p>
                )
              )}
            </div>
          </div>
        </section>
      )}

      {planoPermiteRecorrencia && (
        <section
          aria-labelledby="programar-pix-recorrente"
          className="rounded-xl border border-primary/30 bg-primary/5 p-5 sm:p-6"
        >
          <div className="flex items-start gap-3">
            <Repeat2 className="mt-0.5 size-6 shrink-0 text-primary" aria-hidden="true" />
            <div className="min-w-0 space-y-3">
              <h2 id="programar-pix-recorrente" className="text-lg font-bold">
                {planoTemDesconto ? "Seu desconto, em dia." : "Suas mensalidades, em dia."}
              </h2>
              <p className="text-sm">
                Programe o Pix recorrente por 3 ou 6 meses e dispense os lembretes de pagamento.
              </p>
              <p className="text-sm text-muted-foreground">
                Autorize no app do banco e mantenha saldo na conta para pagar no prazo.
                {planoTemDesconto &&
                  " O bônus de adimplência depende do pagamento dentro do prazo."}
              </p>
              {contratoAutomaticoEmAndamento ? (
                <>
                  <p className="text-sm font-medium" role="status">
                    Sua programação de {totalCiclos} meses está{" "}
                    {contratoPixAutomatico?.status === "ATIVO"
                      ? "ativa. Os débitos serão tentados nas datas previstas."
                      : contratoPixAutomatico?.status === "PENDENTE_AUTORIZACAO"
                        ? qrAutomaticoValido
                          ? "aguardando sua autorização no app do banco."
                          : "aguardando a renovação da autorização."
                        : contratoPixAutomatico?.status === "CANCELANDO"
                          ? "com o cancelamento em processamento."
                          : "em processamento. Aguarde a conclusão do cadastro."}
                  </p>
                  {contratoPixAutomatico?.status === "PENDENTE_AUTORIZACAO" &&
                    !qrAutomaticoValido && (
                      <ProgramarPixRecorrente
                        totalCiclosInicial={totalCiclos}
                        rotuloAcao="Retomar programação PIX"
                      />
                    )}
                </>
              ) : cobrancaMensalBloqueiaTroca ? (
                <p className="text-sm font-medium" role="status">
                  Há um PIX mensal em andamento. Após a confirmação desse pagamento, você poderá
                  programar as próximas mensalidades.
                </p>
              ) : (
                <>
                  {competenciaAtualQuitada && !mensalidadePendente && (
                    <p className="text-sm text-muted-foreground">
                      A mensalidade atual está quitada. Sua programação começa na próxima
                      competência.
                    </p>
                  )}
                  <ProgramarPixRecorrente
                    totalCiclosInicial={contratoCriandoExpirado ? totalCiclos : 3}
                  />
                </>
              )}
            </div>
          </div>
        </section>
      )}

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardContent className="py-5">
            <p className="text-xs text-muted-foreground">Tipo</p>
            <p className="mt-1 font-semibold">{aluno.tipo}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-5">
            <p className="text-xs text-muted-foreground">Situação</p>
            <Badge className="mt-2" variant={adimplente ? "success" : "warning"}>
              {adimplente ? "Em dia" : "Pendente"}
            </Badge>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-5">
            <p className="text-xs text-muted-foreground">Plano</p>
            <p className="mt-1 font-semibold">{aluno.plano?.nome ?? "—"}</p>
          </CardContent>
        </Card>
      </div>

      {tipoSomenteExterno && (
        <Card>
          <CardContent className="py-5 text-sm text-muted-foreground">
            Seu vínculo {aluno.tipo} está sem plano mensal interno. A conferência é feita por
            conciliação externa.
          </CardContent>
        </Card>
      )}

      {aluno.tipo === "AVULSO" && acessoAulaAvulsa && (
        <Card>
          <CardHeader>
            <CardTitle>Fechar mensalidade</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-3">
              <Campo
                rotulo="Aula escolhida"
                valor={formatarDataHora(acessoAulaAvulsa.aula.inicio)}
              />
              <Campo
                rotulo="Aula avulsa paga"
                valor={formatarBRL(Number(acessoAulaAvulsa.valorPago))}
              />
              <Campo
                rotulo="Prazo do complemento"
                valor={formatarData(new Date(acessoAulaAvulsa.prazoConversao.getTime() - 1))}
              />
            </div>
            <p className="text-sm text-muted-foreground">
              {situacaoConversao === "AGUARDANDO_SEMANA"
                ? "O complemento de R$ 80,00 ficará disponível na segunda-feira da semana da aula."
                : situacaoConversao === "EXPIRADA"
                  ? "O prazo para aproveitar os R$ 20,00 como crédito da mensalidade terminou."
                  : "Pague o complemento de R$ 80,00. Após a confirmação do Asaas, sua mensalidade de R$ 100,00 será criada como paga e o plano mensal ficará ativo."}
            </p>
            <FecharMensalidadeAulaAvulsa
              disponivel={situacaoConversao === "DISPONIVEL"}
              pixCopiaECola={pixComplementoDisponivel ? cobrancaComplemento?.pixCopiaECola : null}
              qrCodeDataUrl={qrCodeComplementoDataUrl}
              cobrancaPendente={Boolean(
                cobrancaComplemento?.status === "PENDENTE" && situacaoConversao === "DISPONIVEL",
              )}
            />
          </CardContent>
        </Card>
      )}

      {aluno.plano && (
        <Card>
          <CardHeader>
            <CardTitle>Plano contratado</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Campo
              rotulo="Com desconto de adimplência"
              valor={formatarBRL(Number(aluno.plano.valor))}
            />
            <Campo rotulo="Valor base" valor={formatarBRL(Number(aluno.plano.valorBase))} />
            <Campo rotulo="Vencimento" valor={`Dia ${aluno.diaVencimento}`} />
            <Campo
              rotulo="Modalidades contratadas"
              valor={aluno.modalidadesPlano.map((item) => item.modalidade.nome).join(", ")}
            />
          </CardContent>
        </Card>
      )}

      {aluno.plano && mensalidadePendente && (
        <Card>
          <CardHeader>
            <CardTitle>
              {contratoAutomaticoEmAndamento
                ? `PIX Automático — ${totalCiclos} meses`
                : "Pagar mensalidade via PIX"}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {contratoAutomaticoEmAndamento ? (
              <>
                <p className="text-sm text-muted-foreground">
                  {fallbackAutomatico
                    ? `A cobrança automática de ${mensalidadePendente.competencia} não foi concluída. Pague a mesma cobrança via PIX para regularizar esta mensalidade.`
                    : contratoPixAutomatico?.status === "ATIVO"
                      ? `PIX recorrente autorizado para ${totalCiclos} mensalidades. Os débitos serão tentados nas datas previstas.`
                      : contratoPixAutomatico?.status === "CANCELANDO"
                        ? `O cancelamento da programação de ${totalCiclos} meses está em processamento.`
                        : contratoPixAutomatico?.status === "CRIANDO"
                          ? `A programação de ${totalCiclos} mensalidades está sendo criada.`
                          : `O primeiro pagamento inicia uma programação de ${totalCiclos} mensalidades e autoriza ${totalCiclos - 1} débitos mensais seguintes.`}{" "}
                  Situação da autorização:{" "}
                  <strong>{contratoPixAutomatico?.status ?? "CRIANDO"}</strong>.
                </p>
                {numeroCicloAtual && (
                  <p className="text-sm font-medium">
                    Mensalidade {numeroCicloAtual} de {totalCiclos}.
                  </p>
                )}
                {contratoPixAutomatico?.status === "PENDENTE_AUTORIZACAO" &&
                  !qrAutomaticoValido && (
                    <p className="text-sm text-destructive">
                      O QR Code de autorização expirou. Retome a programação na opção acima para
                      conferir o estado antes de renovar a autorização.
                    </p>
                  )}
                {qrAutomaticoValido && (
                  <PagamentoPix pixCopiaECola={pixCopiaECola} qrCodeDataUrl={qrCodeDataUrl} />
                )}
                {contratoPixAutomatico?.status === "CRIANDO" && (
                  <p className="text-sm text-muted-foreground">
                    O cadastro está sendo processado. Aguarde alguns instantes antes de tentar
                    novamente.
                  </p>
                )}
                {contratoPixAutomatico?.status === "CANCELANDO" && (
                  <p className="text-sm text-muted-foreground">
                    O cancelamento está sendo conciliado com o Asaas. Aguarde antes de fazer uma
                    nova escolha de pagamento.
                  </p>
                )}
                {fallbackAutomatico && (
                  <PagamentoPix
                    mensalidadeId={mensalidadePendente.id}
                    pixCopiaECola={pixCopiaECola}
                    qrCodeDataUrl={qrCodeDataUrl}
                    rotuloAcao="Pagar mensalidade"
                  />
                )}
              </>
            ) : (
              <>
                <p className="text-sm text-muted-foreground">
                  {contratoCriandoExpirado
                    ? "A tentativa anterior de cadastrar o PIX recorrente foi interrompida. Tente novamente para retomar o cadastro."
                    : `Pague a mensalidade ${mensalidadePendente.competencia}, no valor de ${formatarBRL(resumoAdimplencia(mensalidadePendente, agora).valorAtual)}. Você também pode programar o PIX recorrente por 3 ou 6 meses na opção acima, quando disponível.`}
                </p>
                <PagamentoPix
                  mensalidadeId={contratoCriandoExpirado ? undefined : mensalidadePendente.id}
                  pixCopiaECola={pixCopiaECola}
                  qrCodeDataUrl={qrCodeDataUrl}
                  rotuloAcao={cobrancaMensal?.ativa ? "Atualizar QR Code PIX" : "Pagar mensalidade"}
                />
              </>
            )}
            {contratoPixAutomatico &&
              ["PENDENTE_AUTORIZACAO", "ATIVO", "ERRO"].includes(contratoPixAutomatico.status) && (
                <CancelarPixAutomatico />
              )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Mensalidades</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <table className="tabela-responsiva w-full text-sm">
            <thead className="border-b border-border text-left text-muted-foreground">
              <tr>
                <th className="p-4 font-medium">Competência</th>
                <th className="p-4 font-medium">Vencimento</th>
                <th className="p-4 font-medium">Valor</th>
                <th className="p-4 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {mensalidadesComResumo.map(({ mensalidade, resumo }) => {
                const status = statusMensalidadeEfetivo(mensalidade, agora)
                const pendente = status === "EM_ABERTO" || status === "VENCIDA"
                return (
                  <tr key={mensalidade.id} className="border-b border-border last:border-0">
                    <td className="p-4" data-label="Competência">
                      {mensalidade.competencia}
                    </td>
                    <td className="p-4" data-label="Vencimento">
                      {formatarData(mensalidade.vencimento)}
                    </td>
                    <td className="p-4" data-label="Valor">
                      <p>{formatarBRL(resumo.valorAtual)}</p>
                      {pendente && resumo.temDesconto && (
                        <p className="mt-1 text-xs text-muted-foreground">
                          {resumo.descontoAtivo
                            ? `Com desconto até ${formatarData(resumo.ultimoDiaComDesconto)}`
                            : "Sem desconto de adimplência"}
                        </p>
                      )}
                    </td>
                    <td className="p-4" data-label="Status">
                      <Badge
                        variant={status === "PAGA" || status === "ISENTA" ? "success" : "warning"}
                      >
                        {status}
                      </Badge>
                    </td>
                  </tr>
                )
              })}
              {aluno.mensalidades.length === 0 && (
                <tr>
                  <td colSpan={4} className="p-8 text-center text-muted-foreground">
                    Nenhuma mensalidade registrada.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Pagamentos avulsos</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {aluno.pagamentos.map((pagamento) => (
            <div key={pagamento.id} className="border-b border-border pb-3 last:border-0 last:pb-0">
              <div className="flex items-center justify-between gap-3">
                <p className="font-medium">{pagamento.descricao ?? pagamento.tipo}</p>
                <Badge variant="outline">{pagamento.tipo}</Badge>
              </div>
              <p className="text-sm text-muted-foreground">
                {formatarBRL(Number(pagamento.valor))} · {formatarData(pagamento.criadoEm)}
              </p>
            </div>
          ))}
          {aluno.pagamentos.length === 0 && (
            <p className="text-sm text-muted-foreground">Nenhum pagamento avulso registrado.</p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function Campo({ rotulo, valor }: { rotulo: string; valor?: string | null }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{rotulo}</p>
      <p className="mt-1 text-sm font-medium">{valor && valor.length > 0 ? valor : "—"}</p>
    </div>
  )
}

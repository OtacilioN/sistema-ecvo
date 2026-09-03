import QRCode from "qrcode"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { situacaoConversaoAulaAvulsa } from "@/lib/aula-avulsa"
import { exigirAluno } from "@/lib/auth/dal"
import { db } from "@/lib/db"
import { mensalistaAdimplente, statusMensalidadeEfetivo } from "@/lib/services/financeiro.service"
import {
  obterConversaoAulaAvulsa,
  pixCobrancaMatriculaDisponivel,
} from "@/lib/services/pagamento-matricula.service"
import { formatarData, formatarDataHora } from "@/lib/utils/datas"
import { formatarBRL } from "@/lib/utils/formato"
import { FecharMensalidadeAulaAvulsa } from "./fechar-mensalidade-aula-avulsa"
import { CancelarPixAutomatico, PagamentoPix } from "./pagamento-pix"

export const dynamic = "force-dynamic"

export default async function Page() {
  const { alunoId } = await exigirAluno()
  const [aluno, acessoAulaAvulsa] = await Promise.all([
    db.aluno.findUnique({
      where: { id: alunoId },
      include: {
        plano: true,
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

  const temMensalidadeInterna = Boolean(aluno.planoId)
  const adimplente = temMensalidadeInterna ? mensalistaAdimplente(aluno.mensalidades) : true
  const tipoSomenteExterno =
    !temMensalidadeInterna && (aluno.tipo === "WELLHUB" || aluno.tipo === "TOTALPASS")
  const mensalidadePendente = [...aluno.mensalidades]
    .sort((a, b) => a.vencimento.getTime() - b.vencimento.getTime())
    .find((mensalidade) => ["EM_ABERTO", "VENCIDA"].includes(statusMensalidadeEfetivo(mensalidade)))
  const contratoPixAutomatico = aluno.contratosPixAutomatico[0]
  const agora = new Date()
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
      cobrancaMensal?.pixCopiaECola &&
      cobrancaMensal.qrCodeExpiraEm &&
      cobrancaMensal.qrCodeExpiraEm > agora,
  )
  const qrMensalValido = Boolean(
    !contratoAutomaticoEmAndamento &&
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
          <CardContent className="grid gap-4 sm:grid-cols-3">
            <Campo rotulo="Valor" valor={formatarBRL(Number(aluno.plano.valor))} />
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
                ? "PIX Automático semestral"
                : "Pagar mensalidade via PIX"}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {contratoAutomaticoEmAndamento ? (
              <>
                <p className="text-sm text-muted-foreground">
                  {fallbackAutomatico
                    ? `A cobrança automática de ${mensalidadePendente.competencia} não foi concluída. Pague a mesma cobrança via PIX; os próximos ciclos continuam cadastrados.`
                    : contratoPixAutomatico?.status === "ATIVO"
                      ? "PIX recorrente autorizado. As próximas cinco mensalidades serão cobradas automaticamente nas datas previstas."
                      : "O primeiro pagamento autoriza seis mensalidades: esta cobrança inicial e cinco débitos mensais automáticos."}{" "}
                  Situação da autorização:{" "}
                  <strong>{contratoPixAutomatico?.status ?? "CRIANDO"}</strong>.
                </p>
                {contratoPixAutomatico?.status === "PENDENTE_AUTORIZACAO" &&
                  !qrAutomaticoValido && (
                    <>
                      <p className="text-sm text-destructive">
                        O QR Code de autorização expirou. Verifique o estado no Asaas e cadastre
                        novamente para gerar uma nova autorização.
                      </p>
                      <PagamentoPix permitirPixRecorrente />
                    </>
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
                    : `Escolha pagar somente a mensalidade ${mensalidadePendente.competencia}, no valor de ${formatarBRL(Number(mensalidadePendente.valor))}, ou cadastrar o PIX recorrente para seis mensalidades. O primeiro PIX paga esta mensalidade e autoriza cinco cobranças mensais seguintes no aplicativo do banco.`}
                </p>
                <PagamentoPix
                  mensalidadeId={contratoCriandoExpirado ? undefined : mensalidadePendente.id}
                  pixCopiaECola={pixCopiaECola}
                  qrCodeDataUrl={qrCodeDataUrl}
                  permitirPixRecorrente={!cobrancaMensalBloqueiaTroca}
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
              {aluno.mensalidades.map((mensalidade) => {
                const status = statusMensalidadeEfetivo(mensalidade)
                return (
                  <tr key={mensalidade.id} className="border-b border-border last:border-0">
                    <td className="p-4" data-label="Competência">
                      {mensalidade.competencia}
                    </td>
                    <td className="p-4" data-label="Vencimento">
                      {formatarData(mensalidade.vencimento)}
                    </td>
                    <td className="p-4" data-label="Valor">
                      {formatarBRL(Number(mensalidade.valor))}
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

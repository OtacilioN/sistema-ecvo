import type {
  OrigemCheckin,
  StatusAluno,
  StatusCheckin,
  StatusComparecimento,
  StatusConciliacao,
  TipoAluno,
} from "@prisma/client"
import { FormMinhaSenha } from "@/components/auth/form-minha-senha"
import { Badge, type BadgeProps } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { FormMinhaFoto } from "@/components/usuarios/form-foto-usuario"
import { exigirAluno } from "@/lib/auth/dal"
import { db } from "@/lib/db"
import { mensalistaAdimplente, statusMensalidadeEfetivo } from "@/lib/services/financeiro.service"
import { resumoHoras } from "@/lib/services/horas.service"
import { formatarData, formatarDataHora, minutosParaHoras } from "@/lib/utils/datas"
import { formatarBRL, formatarCPF } from "@/lib/utils/formato"
import { FormMeusDadosAluno } from "./form-meus-dados-aluno"

export const dynamic = "force-dynamic"

const ROTULO_TIPO: Record<TipoAluno, string> = {
  MENSALISTA: "Mensalista",
  WELLHUB: "Wellhub",
  TOTALPASS: "TotalPass",
  AVULSO: "Avulso",
}

const VARIANTE_STATUS: Record<StatusAluno, BadgeProps["variant"]> = {
  ATIVO: "success",
  INADIMPLENTE: "warning",
  TRANCADO: "secondary",
  CANCELADO: "destructive",
}

const VARIANTE_CONCILIACAO: Record<StatusConciliacao, BadgeProps["variant"]> = {
  CONCILIADO: "success",
  NAO_ENCONTRADO: "warning",
  ALUNO_NAO_IDENTIFICADO: "warning",
  DIVERGENCIA_DATA: "warning",
  DIVERGENCIA_HORARIO: "warning",
  CHECKIN_INVALIDADO: "destructive",
  DUPLICADO_PLANILHA: "secondary",
  DUPLICADO_SISTEMA: "secondary",
  PENDENTE: "outline",
}

const ROTULO_CHECKIN: Record<StatusCheckin, string> = {
  VALIDO: "Válido",
  PENDENTE_REVISAO: "Pendente de revisão",
  INVALIDADO: "Invalidado",
  EXCLUIDO: "Excluído",
}

const VARIANTE_CHECKIN: Record<StatusCheckin, BadgeProps["variant"]> = {
  VALIDO: "success",
  PENDENTE_REVISAO: "warning",
  INVALIDADO: "destructive",
  EXCLUIDO: "destructive",
}

const ROTULO_ORIGEM_CHECKIN: Record<OrigemCheckin, string> = {
  BOTAO: "Botão",
  QR_CODE: "QR Code",
  LANCADO_GESTOR: "Lançado pelo gestor",
  LANCADO_PROFESSOR: "Lançado pelo professor",
}

const ROTULO_COMPARECIMENTO: Record<StatusComparecimento, string> = {
  CONFIRMADO: "Confirmado",
  LISTA_ESPERA: "Lista de espera",
  CANCELADO_ALUNO: "Cancelado pelo aluno",
  CANCELADO_GESTOR: "Cancelado pelo gestor",
  CONVERTIDO_CHECKIN: "Convertido em check-in",
  AUSENTE: "Ausente",
  NO_SHOW: "No-show",
}

const VARIANTE_COMPARECIMENTO: Record<StatusComparecimento, BadgeProps["variant"]> = {
  CONFIRMADO: "success",
  LISTA_ESPERA: "warning",
  CANCELADO_ALUNO: "secondary",
  CANCELADO_GESTOR: "secondary",
  CONVERTIDO_CHECKIN: "success",
  AUSENTE: "outline",
  NO_SHOW: "warning",
}

export default async function Page() {
  const { alunoId } = await exigirAluno()
  const [aluno, horas] = await Promise.all([
    db.aluno.findUnique({
      where: { id: alunoId },
      include: {
        usuario: { select: { id: true, nome: true, email: true, fotoUrl: true, ativo: true } },
        modalidades: { select: { id: true, nome: true } },
        responsavel: true,
        plano: { select: { nome: true, valor: true } },
        modalidadesPlano: { select: { modalidade: { select: { nome: true } } } },
        mensalidades: {
          where: { status: { in: ["EM_ABERTO", "VENCIDA"] } },
          orderBy: { vencimento: "asc" },
          take: 12,
          select: { id: true, status: true, vencimento: true, valor: true, competencia: true },
        },
        comparecimentos: {
          orderBy: { criadoEm: "desc" },
          take: 5,
          select: {
            id: true,
            status: true,
            criadoEm: true,
            canceladoEm: true,
            aula: {
              select: {
                inicio: true,
                turma: { select: { nome: true, modalidade: { select: { nome: true } } } },
              },
            },
          },
        },
        checkins: {
          orderBy: { criadoEm: "desc" },
          take: 5,
          select: {
            id: true,
            status: true,
            origem: true,
            retroativo: true,
            lancadoPorId: true,
            invalidadoPorId: true,
            invalidadoEm: true,
            criadoEm: true,
            justificativa: true,
            aula: {
              select: {
                inicio: true,
                turma: { select: { modalidade: { select: { nome: true } } } },
              },
            },
          },
        },
        graduacoes: {
          orderBy: [{ atual: "desc" }, { concedidaEm: "desc" }],
          take: 8,
          include: {
            graduacao: {
              include: {
                modalidade: { select: { nome: true } },
              },
            },
            graduacaoAnterior: { select: { nome: true } },
            concedidaPor: {
              select: {
                usuario: { select: { nome: true } },
              },
            },
          },
        },
        registrosImportados: {
          orderBy: { importacao: { criadoEm: "desc" } },
          take: 5,
          include: {
            importacao: { select: { plataforma: true, arquivo: true, criadoEm: true } },
            checkinVinculado: {
              select: {
                status: true,
                aula: {
                  select: {
                    inicio: true,
                    turma: { select: { modalidade: { select: { nome: true } } } },
                  },
                },
              },
            },
          },
        },
        documentos: {
          orderBy: { criadoEm: "desc" },
          take: 10,
          select: {
            id: true,
            titulo: true,
            categoria: true,
            url: true,
            observacao: true,
            criadoEm: true,
          },
        },
        _count: {
          select: {
            comparecimentos: true,
            checkins: true,
            graduacoes: true,
            mensalidades: true,
            registrosImportados: true,
            documentos: true,
          },
        },
      },
    }),
    resumoHoras(alunoId),
  ])

  if (!aluno) return null
  const responsavelIds = [
    ...new Set(
      aluno.checkins.flatMap((checkin) =>
        [checkin.lancadoPorId, checkin.invalidadoPorId].filter((id): id is string => Boolean(id)),
      ),
    ),
  ]
  const usuariosResponsaveis =
    responsavelIds.length > 0
      ? await db.usuario.findMany({
          where: { id: { in: responsavelIds } },
          select: { id: true, nome: true },
        })
      : []
  const nomeResponsavel = new Map(usuariosResponsaveis.map((usuario) => [usuario.id, usuario.nome]))
  const totalHoras = minutosParaHoras(horas.totalGeralMin)
  const temMensalidadeInterna = Boolean(aluno.planoId)
  const adimplente = temMensalidadeInterna ? mensalistaAdimplente(aluno.mensalidades) : true
  const pendenciasFinanceiras = aluno.mensalidades.filter((mensalidade) => {
    const status = statusMensalidadeEfetivo(mensalidade)
    return status === "EM_ABERTO" || status === "VENCIDA"
  })
  const valorPendente = pendenciasFinanceiras.reduce(
    (total, mensalidade) => total + Number(mensalidade.valor),
    0,
  )
  const tipoSomenteExterno =
    !temMensalidadeInterna && (aluno.tipo === "WELLHUB" || aluno.tipo === "TOTALPASS")
  const fotoPerfilUrl = aluno.usuario.fotoUrl ?? aluno.fotoUrl
  const dadosPessoaisAluno = {
    usuario: {
      nome: aluno.usuario.nome,
      email: aluno.usuario.email,
    },
    cpf: aluno.cpf,
    telefone: aluno.telefone,
    dataNascimento: aluno.dataNascimento,
    endereco: aluno.endereco,
    contatoEmergencia: aluno.contatoEmergencia,
    restricoesMedicas: aluno.restricoesMedicas,
    responsavel: aluno.responsavel
      ? {
          nome: aluno.responsavel.nome,
          cpf: aluno.responsavel.cpf,
          telefone: aluno.responsavel.telefone,
          email: aluno.responsavel.email,
          grauParentesco: aluno.responsavel.grauParentesco,
          responsavelFinanceiro: aluno.responsavel.responsavelFinanceiro,
        }
      : null,
  }

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-3">
          <FotoPerfil nome={aluno.usuario.nome} fotoUrl={fotoPerfilUrl} />
          <div>
            <h1 className="text-xl font-bold tracking-tight">Meu perfil</h1>
            <p className="text-sm text-muted-foreground">
              Dados cadastrais e histórico operacional.
            </p>
          </div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardContent className="py-5">
            <p className="text-xs text-muted-foreground">Tipo</p>
            <p className="mt-1 font-semibold">{ROTULO_TIPO[aluno.tipo]}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-5">
            <p className="text-xs text-muted-foreground">Status</p>
            <Badge className="mt-2" variant={VARIANTE_STATUS[aluno.status]}>
              {aluno.status}
            </Badge>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-5">
            <p className="text-xs text-muted-foreground">Horas</p>
            <p className="mt-1 text-2xl font-bold tabular-nums">{totalHoras}h</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-5">
            <p className="text-xs text-muted-foreground">Check-ins</p>
            <p className="mt-1 text-2xl font-bold tabular-nums">{aluno._count.checkins}</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
        <Card>
          <CardHeader>
            <CardTitle>Dados pessoais</CardTitle>
          </CardHeader>
          <CardContent>
            <FormMeusDadosAluno aluno={dadosPessoaisAluno} />
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Foto do perfil</CardTitle>
            </CardHeader>
            <CardContent>
              <FormMinhaFoto
                usuario={{
                  id: aluno.usuario.id,
                  nome: aluno.usuario.nome,
                  papel: "ALUNO",
                  fotoUrl: fotoPerfilUrl,
                }}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Modalidades</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              {aluno.modalidades.map((modalidade) => (
                <Badge key={modalidade.id} variant="secondary">
                  {modalidade.nome}
                </Badge>
              ))}
              {aluno.modalidades.length === 0 && (
                <p className="text-sm text-muted-foreground">Nenhuma modalidade vinculada.</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Vínculo financeiro</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Campo rotulo="Plano" valor={aluno.plano?.nome ?? null} />
              <Campo
                rotulo="Vencimento da mensalidade"
                valor={temMensalidadeInterna ? `Dia ${aluno.diaVencimento}` : null}
              />
              <Campo
                rotulo="Modalidades contratadas"
                valor={
                  temMensalidadeInterna
                    ? aluno.modalidadesPlano.map((item) => item.modalidade.nome).join(", ")
                    : null
                }
              />
              <div>
                <p className="text-xs text-muted-foreground">Situação</p>
                <Badge className="mt-1" variant={adimplente ? "success" : "warning"}>
                  {textoSituacaoFinanceira(aluno.tipo, adimplente, temMensalidadeInterna)}
                </Badge>
                {tipoSomenteExterno && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Conferência por conciliação externa.
                  </p>
                )}
              </div>
              <Campo
                rotulo="Pendências"
                valor={
                  pendenciasFinanceiras.length > 0
                    ? `${pendenciasFinanceiras.length} · ${formatarBRL(valorPendente)}`
                    : "Nenhuma"
                }
              />
              <Campo
                rotulo="Próximo vencimento pendente"
                valor={
                  pendenciasFinanceiras[0]
                    ? `${pendenciasFinanceiras[0].competencia} · ${formatarData(
                        pendenciasFinanceiras[0].vencimento,
                      )}`
                    : null
                }
              />
              <Campo rotulo="ID externo" valor={aluno.idExterno} />
              <Campo rotulo="Mensalidades" valor={String(aluno._count.mensalidades)} />
              <Campo
                rotulo="Registros conciliados/importados"
                valor={String(aluno._count.registrosImportados)}
              />
              <Campo rotulo="Documentos" valor={String(aluno._count.documentos)} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Senha de acesso</CardTitle>
            </CardHeader>
            <CardContent>
              <FormMinhaSenha />
            </CardContent>
          </Card>
        </div>
      </div>

      {aluno.responsavel && (
        <Card>
          <CardHeader>
            <CardTitle>Responsável</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-3">
            <Campo rotulo="Nome" valor={aluno.responsavel.nome} />
            <Campo
              rotulo="CPF"
              valor={aluno.responsavel.cpf ? formatarCPF(aluno.responsavel.cpf) : null}
            />
            <Campo rotulo="Telefone" valor={aluno.responsavel.telefone} />
            <Campo rotulo="E-mail" valor={aluno.responsavel.email} />
            <Campo rotulo="Parentesco" valor={aluno.responsavel.grauParentesco} />
            <Campo
              rotulo="Responsável financeiro"
              valor={aluno.responsavel.responsavelFinanceiro ? "Sim" : "Não"}
            />
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Graduações</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <table className="tabela-responsiva w-full text-sm">
            <thead className="border-b border-border text-left text-muted-foreground">
              <tr>
                <th className="p-4 font-medium">Modalidade</th>
                <th className="p-4 font-medium">Anterior</th>
                <th className="p-4 font-medium">Nova</th>
                <th className="p-4 font-medium">Situação</th>
                <th className="p-4 font-medium">Concedida em</th>
                <th className="p-4 font-medium">Professor</th>
                <th className="p-4 font-medium">Observação</th>
              </tr>
            </thead>
            <tbody>
              {aluno.graduacoes.map((registro) => (
                <tr key={registro.id} className="border-b border-border last:border-0 align-top">
                  <td className="p-4" data-label="Modalidade">
                    {registro.graduacao.modalidade.nome}
                  </td>
                  <td className="p-4" data-label="Anterior">
                    {registro.graduacaoAnterior?.nome ?? "Inicial"}
                  </td>
                  <td className="p-4 font-medium" data-label="Nova">
                    {registro.graduacao.nome}
                  </td>
                  <td className="p-4" data-label="Situação">
                    <Badge variant={registro.atual ? "success" : "secondary"}>
                      {registro.atual ? "Atual" : "Histórico"}
                    </Badge>
                  </td>
                  <td className="p-4" data-label="Concedida em">
                    {formatarData(registro.concedidaEm)}
                  </td>
                  <td className="p-4" data-label="Professor">
                    {registro.concedidaPor.usuario.nome}
                  </td>
                  <td className="p-4 text-muted-foreground" data-label="Observação">
                    {registro.observacao ?? "—"}
                    {registro.anexoUrl && (
                      <a
                        href={registro.anexoUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="block text-sm font-medium text-primary hover:underline"
                      >
                        Abrir anexo
                      </a>
                    )}
                  </td>
                </tr>
              ))}
              {aluno.graduacoes.length === 0 && (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-muted-foreground">
                    Nenhuma graduação registrada.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Agendamentos recentes</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <table className="tabela-responsiva w-full text-sm">
            <thead className="border-b border-border text-left text-muted-foreground">
              <tr>
                <th className="p-4 font-medium">Aula</th>
                <th className="p-4 font-medium">Modalidade</th>
                <th className="p-4 font-medium">Status</th>
                <th className="p-4 font-medium">Registro</th>
              </tr>
            </thead>
            <tbody>
              {aluno.comparecimentos.map((comparecimento) => (
                <tr key={comparecimento.id} className="border-b border-border last:border-0">
                  <td className="p-4" data-label="Aula">
                    <span>{formatarDataHora(comparecimento.aula.inicio)}</span>
                    {comparecimento.aula.turma.nome && (
                      <span className="block text-xs text-muted-foreground">
                        {comparecimento.aula.turma.nome}
                      </span>
                    )}
                  </td>
                  <td className="p-4" data-label="Modalidade">
                    {comparecimento.aula.turma.modalidade.nome}
                  </td>
                  <td className="p-4" data-label="Status">
                    <Badge variant={VARIANTE_COMPARECIMENTO[comparecimento.status]}>
                      {ROTULO_COMPARECIMENTO[comparecimento.status]}
                    </Badge>
                  </td>
                  <td className="p-4 text-muted-foreground" data-label="Registro">
                    <span>{formatarDataHora(comparecimento.criadoEm)}</span>
                    {comparecimento.canceladoEm && (
                      <span className="block text-xs">
                        Cancelado em {formatarDataHora(comparecimento.canceladoEm)}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
              {aluno.comparecimentos.length === 0 && (
                <tr>
                  <td colSpan={4} className="p-8 text-center text-muted-foreground">
                    Nenhum agendamento registrado.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Check-ins recentes</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <table className="tabela-responsiva w-full text-sm">
            <thead className="border-b border-border text-left text-muted-foreground">
              <tr>
                <th className="p-4 font-medium">Data</th>
                <th className="p-4 font-medium">Modalidade</th>
                <th className="p-4 font-medium">Método</th>
                <th className="p-4 font-medium">Responsável</th>
                <th className="p-4 font-medium">Status</th>
                <th className="p-4 font-medium">Validade</th>
              </tr>
            </thead>
            <tbody>
              {aluno.checkins.map((checkin) => {
                const responsavel =
                  checkin.invalidadoPorId && nomeResponsavel.has(checkin.invalidadoPorId)
                    ? (nomeResponsavel.get(checkin.invalidadoPorId) ?? "Responsável")
                    : checkin.lancadoPorId && nomeResponsavel.has(checkin.lancadoPorId)
                      ? (nomeResponsavel.get(checkin.lancadoPorId) ?? "Responsável")
                      : "Aluno"
                return (
                  <tr key={checkin.id} className="border-b border-border last:border-0 align-top">
                    <td className="p-4" data-label="Data">
                      <span>{formatarDataHora(checkin.aula.inicio)}</span>
                      <span className="block text-xs text-muted-foreground">
                        Registro: {formatarDataHora(checkin.criadoEm)}
                      </span>
                    </td>
                    <td className="p-4" data-label="Modalidade">
                      {checkin.aula.turma.modalidade.nome}
                    </td>
                    <td className="p-4" data-label="Método">
                      {ROTULO_ORIGEM_CHECKIN[checkin.origem]}
                      {checkin.retroativo && (
                        <span className="block text-xs text-muted-foreground">Retroativo</span>
                      )}
                    </td>
                    <td className="p-4" data-label="Responsável">
                      {responsavel}
                    </td>
                    <td className="p-4" data-label="Status">
                      <Badge variant={VARIANTE_CHECKIN[checkin.status]}>
                        {ROTULO_CHECKIN[checkin.status]}
                      </Badge>
                    </td>
                    <td className="p-4 text-muted-foreground" data-label="Validade">
                      {textoValidadeCheckin(checkin.status, checkin.invalidadoEm)}
                    </td>
                  </tr>
                )
              })}
              {aluno.checkins.length === 0 && (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-muted-foreground">
                    Nenhum check-in registrado.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Histórico de conciliação</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <table className="tabela-responsiva w-full text-sm">
            <thead className="border-b border-border text-left text-muted-foreground">
              <tr>
                <th className="p-4 font-medium">Importação</th>
                <th className="p-4 font-medium">Referência</th>
                <th className="p-4 font-medium">Status</th>
                <th className="p-4 font-medium">Check-in vinculado</th>
              </tr>
            </thead>
            <tbody>
              {aluno.registrosImportados.map((registro) => (
                <tr key={registro.id} className="border-b border-border last:border-0 align-top">
                  <td className="p-4" data-label="Importação">
                    <span className="font-medium">{registro.importacao.plataforma}</span>
                    <span className="block max-w-full truncate text-xs text-muted-foreground sm:max-w-56">
                      {registro.importacao.arquivo} ·{" "}
                      {formatarDataHora(registro.importacao.criadoEm)}
                    </span>
                  </td>
                  <td className="p-4" data-label="Referência">
                    {registro.dataReferencia ? formatarData(registro.dataReferencia) : "—"}
                    {registro.horarioReferencia ? (
                      <span className="block text-xs text-muted-foreground">
                        {registro.horarioReferencia}
                      </span>
                    ) : null}
                  </td>
                  <td className="p-4" data-label="Status">
                    <Badge variant={VARIANTE_CONCILIACAO[registro.statusConciliacao]}>
                      {registro.statusConciliacao}
                    </Badge>
                  </td>
                  <td className="p-4" data-label="Check-in vinculado">
                    {registro.checkinVinculado ? (
                      <>
                        <span>{registro.checkinVinculado.aula.turma.modalidade.nome}</span>
                        <span className="block text-xs text-muted-foreground">
                          {formatarDataHora(registro.checkinVinculado.aula.inicio)} ·{" "}
                          {registro.checkinVinculado.status}
                        </span>
                      </>
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              ))}
              {aluno.registrosImportados.length === 0 && (
                <tr>
                  <td colSpan={4} className="p-8 text-center text-muted-foreground">
                    Nenhum registro de conciliação vinculado ao aluno.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Documentos</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {aluno.documentos.map((documento) => (
            <div
              key={documento.id}
              className="flex flex-col gap-2 border-b border-border pb-3 last:border-0 last:pb-0 sm:flex-row sm:items-start sm:justify-between"
            >
              <div className="min-w-0">
                <p className="font-medium">{documento.titulo}</p>
                <p className="text-xs text-muted-foreground">
                  {documento.categoria ?? "Documento"} · {formatarDataHora(documento.criadoEm)}
                </p>
                {documento.observacao && (
                  <p className="mt-1 text-sm text-muted-foreground">{documento.observacao}</p>
                )}
              </div>
              <a
                href={documento.url}
                target="_blank"
                rel="noreferrer"
                className="text-sm font-medium text-primary hover:underline"
              >
                Abrir documento
              </a>
            </div>
          ))}
          {aluno.documentos.length === 0 && (
            <p className="text-sm text-muted-foreground">Nenhum documento vinculado.</p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function textoValidadeCheckin(status: StatusCheckin, invalidadoEm: Date | null): string {
  if (status === "VALIDO") return "Conta presença e horas"
  if (status === "PENDENTE_REVISAO") return "Aguardando aprovação"
  if (invalidadoEm) return `Não conta desde ${formatarDataHora(invalidadoEm)}`
  return "Não conta presença nem horas"
}

function textoSituacaoFinanceira(
  tipo: TipoAluno,
  adimplente: boolean,
  temMensalidadeInterna: boolean,
): string {
  if (temMensalidadeInterna) return adimplente ? "Em dia" : "Pendente"
  if (tipo === "WELLHUB" || tipo === "TOTALPASS") return "Conciliação externa"
  if (tipo === "AVULSO") return "Conforme uso"
  return adimplente ? "Em dia" : "Pendente"
}

function Campo({
  rotulo,
  valor,
  className,
}: {
  rotulo: string
  valor?: string | null
  className?: string
}) {
  return (
    <div className={className}>
      <p className="text-xs text-muted-foreground">{rotulo}</p>
      <p className="mt-1 text-sm font-medium">{valor && valor.length > 0 ? valor : "—"}</p>
    </div>
  )
}

function FotoPerfil({ nome, fotoUrl }: { nome: string; fotoUrl?: string | null }) {
  return (
    <div
      role="img"
      aria-label={`Foto de ${nome}`}
      className="size-14 shrink-0 rounded-md border border-border bg-muted bg-cover bg-center text-base font-semibold text-muted-foreground"
      style={fotoUrl ? { backgroundImage: `url(${fotoUrl})` } : undefined}
    >
      {!fotoUrl && <span className="flex size-full items-center justify-center">{nome[0]}</span>}
    </div>
  )
}

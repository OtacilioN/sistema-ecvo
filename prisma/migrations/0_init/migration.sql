-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Papel" AS ENUM ('GESTOR', 'PROFESSOR', 'ALUNO');

-- CreateEnum
CREATE TYPE "TipoAluno" AS ENUM ('MENSALISTA', 'WELLHUB', 'TOTALPASS', 'AVULSO');

-- CreateEnum
CREATE TYPE "StatusAluno" AS ENUM ('ATIVO', 'INATIVO', 'SUSPENSO', 'CANCELADO', 'INADIMPLENTE', 'TRANCADO');

-- CreateEnum
CREATE TYPE "StatusCheckin" AS ENUM ('VALIDO', 'INVALIDADO', 'EXCLUIDO');

-- CreateEnum
CREATE TYPE "OrigemCheckin" AS ENUM ('BOTAO', 'QR_CODE', 'LANCADO_GESTOR', 'LANCADO_PROFESSOR');

-- CreateEnum
CREATE TYPE "StatusComparecimento" AS ENUM ('CONFIRMADO', 'CANCELADO_ALUNO', 'CANCELADO_GESTOR', 'CONVERTIDO_CHECKIN', 'AUSENTE', 'NO_SHOW');

-- CreateEnum
CREATE TYPE "TipoMovimentoHoras" AS ENUM ('CREDITO', 'ESTORNO', 'AJUSTE_MANUAL');

-- CreateEnum
CREATE TYPE "Periodicidade" AS ENUM ('MENSAL', 'TRIMESTRAL', 'SEMESTRAL', 'ANUAL');

-- CreateEnum
CREATE TYPE "StatusMensalidade" AS ENUM ('EM_ABERTO', 'PAGA', 'VENCIDA', 'CANCELADA', 'ISENTA');

-- CreateEnum
CREATE TYPE "TipoPagamento" AS ENUM ('AULA_UNICA', 'DIARIA', 'PACOTE', 'SEMINARIO', 'EVENTO', 'EXAME', 'PRODUTO');

-- CreateEnum
CREATE TYPE "Plataforma" AS ENUM ('WELLHUB', 'TOTALPASS');

-- CreateEnum
CREATE TYPE "StatusConciliacao" AS ENUM ('CONCILIADO', 'NAO_ENCONTRADO', 'ALUNO_NAO_IDENTIFICADO', 'DIVERGENCIA_DATA', 'DIVERGENCIA_HORARIO', 'CHECKIN_INVALIDADO', 'DUPLICADO_PLANILHA', 'DUPLICADO_SISTEMA', 'PENDENTE');

-- CreateEnum
CREATE TYPE "BloqueioInadimplencia" AS ENUM ('APENAS_ALERTAR', 'BLOQUEAR_COMPARECIMENTO', 'BLOQUEAR_CHECKIN', 'SEM_BLOQUEIO');

-- CreateEnum
CREATE TYPE "PoliticaCheckinSemComparecimento" AS ENUM ('PERMITIR', 'BLOQUEAR', 'APENAS_COM_APROVACAO');

-- CreateEnum
CREATE TYPE "TipoAcaoAudit" AS ENUM ('CHECKIN_CRIADO', 'CHECKIN_INVALIDADO', 'CHECKIN_EXCLUIDO', 'REGISTRO_RETROATIVO', 'AJUSTE_HORAS', 'ESTORNO_HORAS', 'GRADUACAO', 'PAGAMENTO', 'PLANO', 'TIPO_ALUNO', 'STATUS_ALUNO', 'IMPORTACAO', 'CONCILIACAO_MANUAL', 'COMPARECIMENTO_CANCELADO', 'CONFIGURACAO');

-- CreateEnum
CREATE TYPE "TipoNotificacao" AS ENUM ('COMPARECIMENTO', 'LEMBRETE_TREINO', 'CANCELAMENTO_AULA', 'FINANCEIRO', 'GRADUACAO', 'CHECKIN_INVALIDADO');

-- CreateTable
CREATE TABLE "Usuario" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "senhaHash" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "papel" "Papel" NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Usuario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Aluno" (
    "id" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "tipo" "TipoAluno" NOT NULL,
    "status" "StatusAluno" NOT NULL DEFAULT 'ATIVO',
    "cpf" TEXT,
    "telefone" TEXT,
    "dataNascimento" TIMESTAMP(3),
    "endereco" TEXT,
    "fotoUrl" TEXT,
    "dataInicio" TIMESTAMP(3),
    "contatoEmergencia" TEXT,
    "restricoesMedicas" TEXT,
    "observacoesTecnicas" TEXT,
    "observacoesAdmin" TEXT,
    "idExterno" TEXT,
    "planoId" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Aluno_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Responsavel" (
    "id" TEXT NOT NULL,
    "alunoId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "cpf" TEXT,
    "telefone" TEXT,
    "email" TEXT,
    "grauParentesco" TEXT,
    "responsavelFinanceiro" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Responsavel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Professor" (
    "id" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "cpf" TEXT,
    "telefone" TEXT,
    "fotoUrl" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "observacoes" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Professor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Modalidade" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "descricao" TEXT,
    "duracaoPadraoMin" INTEGER NOT NULL DEFAULT 60,
    "ativa" BOOLEAN NOT NULL DEFAULT true,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Modalidade_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Turma" (
    "id" TEXT NOT NULL,
    "modalidadeId" TEXT NOT NULL,
    "professorId" TEXT,
    "nome" TEXT,
    "diaSemana" INTEGER,
    "horaInicio" TEXT,
    "horaFim" TEXT,
    "duracaoMin" INTEGER NOT NULL,
    "capacidade" INTEGER NOT NULL DEFAULT 0,
    "local" TEXT,
    "nivel" TEXT,
    "ehEvento" BOOLEAN NOT NULL DEFAULT false,
    "ativa" BOOLEAN NOT NULL DEFAULT true,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Turma_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Aula" (
    "id" TEXT NOT NULL,
    "turmaId" TEXT NOT NULL,
    "professorId" TEXT,
    "inicio" TIMESTAMP(3) NOT NULL,
    "fim" TIMESTAMP(3) NOT NULL,
    "duracaoMin" INTEGER NOT NULL,
    "cancelada" BOOLEAN NOT NULL DEFAULT false,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Aula_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Comparecimento" (
    "id" TEXT NOT NULL,
    "alunoId" TEXT NOT NULL,
    "aulaId" TEXT NOT NULL,
    "status" "StatusComparecimento" NOT NULL DEFAULT 'CONFIRMADO',
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "canceladoEm" TIMESTAMP(3),
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Comparecimento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Checkin" (
    "id" TEXT NOT NULL,
    "alunoId" TEXT NOT NULL,
    "aulaId" TEXT NOT NULL,
    "status" "StatusCheckin" NOT NULL DEFAULT 'VALIDO',
    "origem" "OrigemCheckin" NOT NULL DEFAULT 'BOTAO',
    "lancadoPorId" TEXT,
    "retroativo" BOOLEAN NOT NULL DEFAULT false,
    "invalidadoPorId" TEXT,
    "invalidadoEm" TIMESTAMP(3),
    "justificativa" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Checkin_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MovimentoHoras" (
    "id" TEXT NOT NULL,
    "alunoId" TEXT NOT NULL,
    "modalidadeId" TEXT NOT NULL,
    "checkinId" TEXT,
    "tipo" "TipoMovimentoHoras" NOT NULL,
    "minutos" INTEGER NOT NULL,
    "estornaMovimentoId" TEXT,
    "motivo" TEXT,
    "autorId" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MovimentoHoras_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Graduacao" (
    "id" TEXT NOT NULL,
    "modalidadeId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "ordem" INTEGER NOT NULL DEFAULT 0,
    "minHoras" INTEGER,
    "minFrequencia" INTEGER,
    "minTempoNoGrauDias" INTEGER,

    CONSTRAINT "Graduacao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GraduacaoAluno" (
    "id" TEXT NOT NULL,
    "alunoId" TEXT NOT NULL,
    "graduacaoId" TEXT NOT NULL,
    "atual" BOOLEAN NOT NULL DEFAULT true,
    "concedidaPorId" TEXT NOT NULL,
    "observacao" TEXT,
    "anexoUrl" TEXT,
    "concedidaEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GraduacaoAluno_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Exame" (
    "id" TEXT NOT NULL,
    "modalidadeId" TEXT NOT NULL,
    "professorId" TEXT NOT NULL,
    "data" TIMESTAMP(3) NOT NULL,
    "descricao" TEXT,
    "taxa" DECIMAL(10,2),
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Exame_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InscricaoExame" (
    "id" TEXT NOT NULL,
    "exameId" TEXT NOT NULL,
    "alunoId" TEXT NOT NULL,
    "aprovado" BOOLEAN,
    "resultado" TEXT,

    CONSTRAINT "InscricaoExame_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Plano" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "valor" DECIMAL(10,2) NOT NULL,
    "periodicidade" "Periodicidade" NOT NULL DEFAULT 'MENSAL',
    "diaVencimento" INTEGER NOT NULL DEFAULT 10,
    "limiteAulas" INTEGER,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Plano_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Mensalidade" (
    "id" TEXT NOT NULL,
    "alunoId" TEXT NOT NULL,
    "planoId" TEXT NOT NULL,
    "competencia" TEXT NOT NULL,
    "valor" DECIMAL(10,2) NOT NULL,
    "vencimento" TIMESTAMP(3) NOT NULL,
    "status" "StatusMensalidade" NOT NULL DEFAULT 'EM_ABERTO',
    "pagoEm" TIMESTAMP(3),
    "formaPagamento" TEXT,
    "observacao" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Mensalidade_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Pagamento" (
    "id" TEXT NOT NULL,
    "alunoId" TEXT,
    "tipo" "TipoPagamento" NOT NULL,
    "valor" DECIMAL(10,2) NOT NULL,
    "descricao" TEXT,
    "formaPagamento" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Pagamento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Importacao" (
    "id" TEXT NOT NULL,
    "plataforma" "Plataforma" NOT NULL,
    "arquivo" TEXT NOT NULL,
    "importadoPorId" TEXT NOT NULL,
    "totalLinhas" INTEGER NOT NULL DEFAULT 0,
    "totalConciliados" INTEGER NOT NULL DEFAULT 0,
    "totalNaoConciliados" INTEGER NOT NULL DEFAULT 0,
    "totalDivergencias" INTEGER NOT NULL DEFAULT 0,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Importacao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RegistroImportado" (
    "id" TEXT NOT NULL,
    "importacaoId" TEXT NOT NULL,
    "dadosBrutos" JSONB NOT NULL,
    "cpf" TEXT,
    "email" TEXT,
    "nome" TEXT,
    "telefone" TEXT,
    "dataReferencia" TIMESTAMP(3),
    "horarioReferencia" TEXT,
    "alunoId" TEXT,
    "checkinVinculadoId" TEXT,
    "statusConciliacao" "StatusConciliacao" NOT NULL DEFAULT 'PENDENTE',
    "resolvidoPorId" TEXT,
    "resolvidoEm" TIMESTAMP(3),
    "observacao" TEXT,

    CONSTRAINT "RegistroImportado_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConfiguracaoAcademia" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "janelaComparecimentoHoras" INTEGER NOT NULL DEFAULT 24,
    "prazoCancelamentoHoras" INTEGER NOT NULL DEFAULT 2,
    "exigirComparecimentoParaCheckin" BOOLEAN NOT NULL DEFAULT false,
    "politicaCheckinSemComparecimento" "PoliticaCheckinSemComparecimento" NOT NULL DEFAULT 'PERMITIR',
    "bloqueioInadimplencia" "BloqueioInadimplencia" NOT NULL DEFAULT 'APENAS_ALERTAR',
    "listaEsperaAtiva" BOOLEAN NOT NULL DEFAULT false,
    "rankingHorasAtivo" BOOLEAN NOT NULL DEFAULT false,
    "atualizadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConfiguracaoAcademia_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LogAuditoria" (
    "id" TEXT NOT NULL,
    "autorId" TEXT NOT NULL,
    "acao" "TipoAcaoAudit" NOT NULL,
    "entidade" TEXT NOT NULL,
    "entidadeId" TEXT NOT NULL,
    "valorAntigo" JSONB,
    "valorNovo" JSONB,
    "justificativa" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LogAuditoria_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notificacao" (
    "id" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "tipo" "TipoNotificacao" NOT NULL,
    "titulo" TEXT NOT NULL,
    "mensagem" TEXT NOT NULL,
    "lida" BOOLEAN NOT NULL DEFAULT false,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notificacao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_AlunoModalidade" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_AlunoModalidade_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateTable
CREATE TABLE "_ProfessorModalidade" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_ProfessorModalidade_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateTable
CREATE TABLE "_PlanoModalidade" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_PlanoModalidade_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE UNIQUE INDEX "Usuario_email_key" ON "Usuario"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Aluno_usuarioId_key" ON "Aluno"("usuarioId");

-- CreateIndex
CREATE UNIQUE INDEX "Aluno_cpf_key" ON "Aluno"("cpf");

-- CreateIndex
CREATE INDEX "Aluno_tipo_idx" ON "Aluno"("tipo");

-- CreateIndex
CREATE INDEX "Aluno_status_idx" ON "Aluno"("status");

-- CreateIndex
CREATE UNIQUE INDEX "Responsavel_alunoId_key" ON "Responsavel"("alunoId");

-- CreateIndex
CREATE UNIQUE INDEX "Professor_usuarioId_key" ON "Professor"("usuarioId");

-- CreateIndex
CREATE UNIQUE INDEX "Professor_cpf_key" ON "Professor"("cpf");

-- CreateIndex
CREATE UNIQUE INDEX "Modalidade_nome_key" ON "Modalidade"("nome");

-- CreateIndex
CREATE INDEX "Turma_modalidadeId_idx" ON "Turma"("modalidadeId");

-- CreateIndex
CREATE INDEX "Turma_diaSemana_idx" ON "Turma"("diaSemana");

-- CreateIndex
CREATE INDEX "Aula_inicio_idx" ON "Aula"("inicio");

-- CreateIndex
CREATE UNIQUE INDEX "Aula_turmaId_inicio_key" ON "Aula"("turmaId", "inicio");

-- CreateIndex
CREATE INDEX "Comparecimento_aulaId_idx" ON "Comparecimento"("aulaId");

-- CreateIndex
CREATE UNIQUE INDEX "Comparecimento_alunoId_aulaId_key" ON "Comparecimento"("alunoId", "aulaId");

-- CreateIndex
CREATE INDEX "Checkin_status_idx" ON "Checkin"("status");

-- CreateIndex
CREATE INDEX "Checkin_aulaId_idx" ON "Checkin"("aulaId");

-- CreateIndex
CREATE UNIQUE INDEX "Checkin_alunoId_aulaId_key" ON "Checkin"("alunoId", "aulaId");

-- CreateIndex
CREATE INDEX "MovimentoHoras_alunoId_idx" ON "MovimentoHoras"("alunoId");

-- CreateIndex
CREATE INDEX "MovimentoHoras_modalidadeId_idx" ON "MovimentoHoras"("modalidadeId");

-- CreateIndex
CREATE INDEX "MovimentoHoras_checkinId_idx" ON "MovimentoHoras"("checkinId");

-- CreateIndex
CREATE INDEX "Graduacao_modalidadeId_idx" ON "Graduacao"("modalidadeId");

-- CreateIndex
CREATE UNIQUE INDEX "Graduacao_modalidadeId_nome_key" ON "Graduacao"("modalidadeId", "nome");

-- CreateIndex
CREATE INDEX "GraduacaoAluno_alunoId_idx" ON "GraduacaoAluno"("alunoId");

-- CreateIndex
CREATE UNIQUE INDEX "InscricaoExame_exameId_alunoId_key" ON "InscricaoExame"("exameId", "alunoId");

-- CreateIndex
CREATE INDEX "Mensalidade_status_idx" ON "Mensalidade"("status");

-- CreateIndex
CREATE UNIQUE INDEX "Mensalidade_alunoId_competencia_key" ON "Mensalidade"("alunoId", "competencia");

-- CreateIndex
CREATE INDEX "Pagamento_alunoId_idx" ON "Pagamento"("alunoId");

-- CreateIndex
CREATE INDEX "RegistroImportado_importacaoId_idx" ON "RegistroImportado"("importacaoId");

-- CreateIndex
CREATE INDEX "RegistroImportado_statusConciliacao_idx" ON "RegistroImportado"("statusConciliacao");

-- CreateIndex
CREATE INDEX "LogAuditoria_entidade_entidadeId_idx" ON "LogAuditoria"("entidade", "entidadeId");

-- CreateIndex
CREATE INDEX "LogAuditoria_criadoEm_idx" ON "LogAuditoria"("criadoEm");

-- CreateIndex
CREATE INDEX "Notificacao_usuarioId_lida_idx" ON "Notificacao"("usuarioId", "lida");

-- CreateIndex
CREATE INDEX "_AlunoModalidade_B_index" ON "_AlunoModalidade"("B");

-- CreateIndex
CREATE INDEX "_ProfessorModalidade_B_index" ON "_ProfessorModalidade"("B");

-- CreateIndex
CREATE INDEX "_PlanoModalidade_B_index" ON "_PlanoModalidade"("B");

-- AddForeignKey
ALTER TABLE "Aluno" ADD CONSTRAINT "Aluno_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Aluno" ADD CONSTRAINT "Aluno_planoId_fkey" FOREIGN KEY ("planoId") REFERENCES "Plano"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Responsavel" ADD CONSTRAINT "Responsavel_alunoId_fkey" FOREIGN KEY ("alunoId") REFERENCES "Aluno"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Professor" ADD CONSTRAINT "Professor_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Turma" ADD CONSTRAINT "Turma_modalidadeId_fkey" FOREIGN KEY ("modalidadeId") REFERENCES "Modalidade"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Turma" ADD CONSTRAINT "Turma_professorId_fkey" FOREIGN KEY ("professorId") REFERENCES "Professor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Aula" ADD CONSTRAINT "Aula_turmaId_fkey" FOREIGN KEY ("turmaId") REFERENCES "Turma"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Aula" ADD CONSTRAINT "Aula_professorId_fkey" FOREIGN KEY ("professorId") REFERENCES "Professor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Comparecimento" ADD CONSTRAINT "Comparecimento_alunoId_fkey" FOREIGN KEY ("alunoId") REFERENCES "Aluno"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Comparecimento" ADD CONSTRAINT "Comparecimento_aulaId_fkey" FOREIGN KEY ("aulaId") REFERENCES "Aula"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Checkin" ADD CONSTRAINT "Checkin_alunoId_fkey" FOREIGN KEY ("alunoId") REFERENCES "Aluno"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Checkin" ADD CONSTRAINT "Checkin_aulaId_fkey" FOREIGN KEY ("aulaId") REFERENCES "Aula"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MovimentoHoras" ADD CONSTRAINT "MovimentoHoras_alunoId_fkey" FOREIGN KEY ("alunoId") REFERENCES "Aluno"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MovimentoHoras" ADD CONSTRAINT "MovimentoHoras_modalidadeId_fkey" FOREIGN KEY ("modalidadeId") REFERENCES "Modalidade"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MovimentoHoras" ADD CONSTRAINT "MovimentoHoras_checkinId_fkey" FOREIGN KEY ("checkinId") REFERENCES "Checkin"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Graduacao" ADD CONSTRAINT "Graduacao_modalidadeId_fkey" FOREIGN KEY ("modalidadeId") REFERENCES "Modalidade"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GraduacaoAluno" ADD CONSTRAINT "GraduacaoAluno_alunoId_fkey" FOREIGN KEY ("alunoId") REFERENCES "Aluno"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GraduacaoAluno" ADD CONSTRAINT "GraduacaoAluno_graduacaoId_fkey" FOREIGN KEY ("graduacaoId") REFERENCES "Graduacao"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GraduacaoAluno" ADD CONSTRAINT "GraduacaoAluno_concedidaPorId_fkey" FOREIGN KEY ("concedidaPorId") REFERENCES "Professor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Exame" ADD CONSTRAINT "Exame_modalidadeId_fkey" FOREIGN KEY ("modalidadeId") REFERENCES "Modalidade"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Exame" ADD CONSTRAINT "Exame_professorId_fkey" FOREIGN KEY ("professorId") REFERENCES "Professor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InscricaoExame" ADD CONSTRAINT "InscricaoExame_exameId_fkey" FOREIGN KEY ("exameId") REFERENCES "Exame"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InscricaoExame" ADD CONSTRAINT "InscricaoExame_alunoId_fkey" FOREIGN KEY ("alunoId") REFERENCES "Aluno"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Mensalidade" ADD CONSTRAINT "Mensalidade_alunoId_fkey" FOREIGN KEY ("alunoId") REFERENCES "Aluno"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Mensalidade" ADD CONSTRAINT "Mensalidade_planoId_fkey" FOREIGN KEY ("planoId") REFERENCES "Plano"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Pagamento" ADD CONSTRAINT "Pagamento_alunoId_fkey" FOREIGN KEY ("alunoId") REFERENCES "Aluno"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RegistroImportado" ADD CONSTRAINT "RegistroImportado_importacaoId_fkey" FOREIGN KEY ("importacaoId") REFERENCES "Importacao"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RegistroImportado" ADD CONSTRAINT "RegistroImportado_alunoId_fkey" FOREIGN KEY ("alunoId") REFERENCES "Aluno"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RegistroImportado" ADD CONSTRAINT "RegistroImportado_checkinVinculadoId_fkey" FOREIGN KEY ("checkinVinculadoId") REFERENCES "Checkin"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LogAuditoria" ADD CONSTRAINT "LogAuditoria_autorId_fkey" FOREIGN KEY ("autorId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notificacao" ADD CONSTRAINT "Notificacao_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_AlunoModalidade" ADD CONSTRAINT "_AlunoModalidade_A_fkey" FOREIGN KEY ("A") REFERENCES "Aluno"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_AlunoModalidade" ADD CONSTRAINT "_AlunoModalidade_B_fkey" FOREIGN KEY ("B") REFERENCES "Modalidade"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ProfessorModalidade" ADD CONSTRAINT "_ProfessorModalidade_A_fkey" FOREIGN KEY ("A") REFERENCES "Modalidade"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ProfessorModalidade" ADD CONSTRAINT "_ProfessorModalidade_B_fkey" FOREIGN KEY ("B") REFERENCES "Professor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_PlanoModalidade" ADD CONSTRAINT "_PlanoModalidade_A_fkey" FOREIGN KEY ("A") REFERENCES "Modalidade"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_PlanoModalidade" ADD CONSTRAINT "_PlanoModalidade_B_fkey" FOREIGN KEY ("B") REFERENCES "Plano"("id") ON DELETE CASCADE ON UPDATE CASCADE;


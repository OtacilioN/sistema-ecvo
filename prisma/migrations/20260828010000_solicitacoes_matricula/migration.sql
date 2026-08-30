CREATE TYPE "StatusSolicitacaoMatricula" AS ENUM ('PENDENTE', 'APROVADA', 'REJEITADA');

ALTER TYPE "TipoAcaoAudit" ADD VALUE 'MATRICULA_SOLICITADA';
ALTER TYPE "TipoAcaoAudit" ADD VALUE 'MATRICULA_APROVADA';
ALTER TYPE "TipoAcaoAudit" ADD VALUE 'MATRICULA_REJEITADA';

CREATE TABLE "SolicitacaoMatricula" (
  "id" TEXT NOT NULL,
  "nome" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "senhaHash" TEXT,
  "cpf" TEXT,
  "telefone" TEXT,
  "dataNascimento" TIMESTAMP(3),
  "endereco" TEXT,
  "contatoEmergencia" TEXT,
  "restricoesMedicas" TEXT,
  "modalidadeId" TEXT NOT NULL,
  "comprovantePagamentoUrl" TEXT,
  "comprovanteContentType" TEXT,
  "comprovanteNomeOriginal" TEXT,
  "status" "StatusSolicitacaoMatricula" NOT NULL DEFAULT 'PENDENTE',
  "alunoId" TEXT,
  "planoAprovadoId" TEXT,
  "analisadoPorId" TEXT,
  "analisadoEm" TIMESTAMP(3),
  "justificativa" TEXT,
  "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "atualizadoEm" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SolicitacaoMatricula_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SolicitacaoMatricula_email_key" ON "SolicitacaoMatricula"("email");
CREATE UNIQUE INDEX "SolicitacaoMatricula_cpf_key" ON "SolicitacaoMatricula"("cpf");
CREATE UNIQUE INDEX "SolicitacaoMatricula_alunoId_key" ON "SolicitacaoMatricula"("alunoId");
CREATE INDEX "SolicitacaoMatricula_status_criadoEm_idx" ON "SolicitacaoMatricula"("status", "criadoEm");
CREATE INDEX "SolicitacaoMatricula_modalidadeId_idx" ON "SolicitacaoMatricula"("modalidadeId");
CREATE INDEX "SolicitacaoMatricula_analisadoPorId_idx" ON "SolicitacaoMatricula"("analisadoPorId");

ALTER TABLE "SolicitacaoMatricula"
  ADD CONSTRAINT "SolicitacaoMatricula_modalidadeId_fkey"
  FOREIGN KEY ("modalidadeId") REFERENCES "Modalidade"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "SolicitacaoMatricula"
  ADD CONSTRAINT "SolicitacaoMatricula_alunoId_fkey"
  FOREIGN KEY ("alunoId") REFERENCES "Aluno"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "SolicitacaoMatricula"
  ADD CONSTRAINT "SolicitacaoMatricula_planoAprovadoId_fkey"
  FOREIGN KEY ("planoAprovadoId") REFERENCES "Plano"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "SolicitacaoMatricula"
  ADD CONSTRAINT "SolicitacaoMatricula_analisadoPorId_fkey"
  FOREIGN KEY ("analisadoPorId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

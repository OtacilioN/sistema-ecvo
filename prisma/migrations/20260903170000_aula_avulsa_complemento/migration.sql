CREATE TYPE "FinalidadeCobrancaMatriculaAsaas" AS ENUM (
  'PRIMEIRA_MENSALIDADE',
  'AULA_AVULSA',
  'COMPLEMENTO_MENSALIDADE'
);

CREATE TYPE "StatusAcessoAulaAvulsa" AS ENUM ('ATIVO', 'USADO', 'CONVERTIDO', 'CANCELADO');

ALTER TABLE "SolicitacaoMatricula"
  ADD COLUMN "aulaAvulsaId" TEXT;

ALTER TABLE "CobrancaMatriculaAsaas"
  ADD COLUMN "finalidade" "FinalidadeCobrancaMatriculaAsaas" NOT NULL DEFAULT 'PRIMEIRA_MENSALIDADE';

ALTER TABLE "CobrancaAsaas"
  ADD COLUMN "valorCobrado" DECIMAL(10,2);

ALTER TABLE "SolicitacaoMatricula"
  DROP CONSTRAINT "SolicitacaoMatricula_beneficio_ativo_check",
  DROP CONSTRAINT "SolicitacaoMatricula_plano_externo_check";

ALTER TABLE "SolicitacaoMatricula"
  ADD CONSTRAINT "SolicitacaoMatricula_beneficio_ativo_check"
  CHECK (
    ("tipoPagamento" IN ('MENSALISTA', 'AULA_AVULSA') AND NOT "beneficioAtivoDeclarado")
    OR
    ("tipoPagamento" IN ('WELLHUB', 'TOTALPASS') AND "beneficioAtivoDeclarado")
  ),
  ADD CONSTRAINT "SolicitacaoMatricula_plano_externo_check"
  CHECK ("tipoPagamento" IN ('MENSALISTA', 'AULA_AVULSA') OR "planoId" IS NULL),
  ADD CONSTRAINT "SolicitacaoMatricula_aula_avulsa_check"
  CHECK (
    ("tipoPagamento" = 'AULA_AVULSA' AND "aulaAvulsaId" IS NOT NULL)
    OR
    ("tipoPagamento" <> 'AULA_AVULSA' AND "aulaAvulsaId" IS NULL)
  );

ALTER TABLE "SolicitacaoMatricula"
  ADD CONSTRAINT "SolicitacaoMatricula_aulaAvulsaId_fkey"
  FOREIGN KEY ("aulaAvulsaId") REFERENCES "Aula"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "SolicitacaoMatricula_aulaAvulsaId_idx"
  ON "SolicitacaoMatricula"("aulaAvulsaId");

CREATE INDEX "CobrancaMatriculaAsaas_finalidade_status_idx"
  ON "CobrancaMatriculaAsaas"("finalidade", "status");

CREATE TABLE "AcessoAulaAvulsa" (
  "id" TEXT NOT NULL,
  "solicitacaoId" TEXT NOT NULL,
  "alunoId" TEXT NOT NULL,
  "aulaId" TEXT NOT NULL,
  "checkinId" TEXT,
  "status" "StatusAcessoAulaAvulsa" NOT NULL DEFAULT 'ATIVO',
  "valorPago" DECIMAL(10,2) NOT NULL DEFAULT 20.00,
  "valorPlanoSnapshot" DECIMAL(10,2) NOT NULL DEFAULT 100.00,
  "valorComplemento" DECIMAL(10,2) NOT NULL DEFAULT 80.00,
  "prazoConversao" TIMESTAMP(3) NOT NULL,
  "convertidoEm" TIMESTAMP(3),
  "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "atualizadoEm" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AcessoAulaAvulsa_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AcessoAulaAvulsa_solicitacaoId_key"
  ON "AcessoAulaAvulsa"("solicitacaoId");
CREATE UNIQUE INDEX "AcessoAulaAvulsa_checkinId_key"
  ON "AcessoAulaAvulsa"("checkinId");
CREATE INDEX "AcessoAulaAvulsa_alunoId_status_idx"
  ON "AcessoAulaAvulsa"("alunoId", "status");
CREATE INDEX "AcessoAulaAvulsa_aulaId_status_idx"
  ON "AcessoAulaAvulsa"("aulaId", "status");
CREATE INDEX "AcessoAulaAvulsa_prazoConversao_status_idx"
  ON "AcessoAulaAvulsa"("prazoConversao", "status");

ALTER TABLE "AcessoAulaAvulsa"
  ADD CONSTRAINT "AcessoAulaAvulsa_solicitacaoId_fkey"
  FOREIGN KEY ("solicitacaoId") REFERENCES "SolicitacaoMatricula"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "AcessoAulaAvulsa_alunoId_fkey"
  FOREIGN KEY ("alunoId") REFERENCES "Aluno"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "AcessoAulaAvulsa_aulaId_fkey"
  FOREIGN KEY ("aulaId") REFERENCES "Aula"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "AcessoAulaAvulsa_checkinId_fkey"
  FOREIGN KEY ("checkinId") REFERENCES "Checkin"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "AcessoAulaAvulsa"
  ADD CONSTRAINT "AcessoAulaAvulsa_valores_check"
  CHECK (
    "valorPago" = 20.00
    AND "valorPlanoSnapshot" = 100.00
    AND "valorComplemento" = 80.00
    AND "valorPago" + "valorComplemento" = "valorPlanoSnapshot"
  );

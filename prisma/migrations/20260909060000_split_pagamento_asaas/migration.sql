-- O snapshot do direito financeiro da matrícula é congelado antes da cobrança.
ALTER TABLE "CobrancaMatriculaAsaas" ADD COLUMN "repasseSnapshot" JSONB;

-- Situação cadastral recebida do webhook da subconta.
ALTER TABLE "ContaAsaasProfessor"
  ADD COLUMN "statusGeralAsaas" TEXT,
  ADD COLUMN "ultimoEventoAsaas" TEXT;

CREATE TYPE "StatusSplitPagamentoAsaas" AS ENUM (
  'PREPARADO',
  'PENDENTE',
  'AGUARDANDO_CREDITO',
  'PROCESSANDO',
  'CONCLUIDO',
  'BLOQUEADO',
  'CANCELADO',
  'RECUSADO',
  'ESTORNADO',
  'ERRO'
);

CREATE TABLE "SplitPagamentoAsaas" (
  "id" TEXT NOT NULL,
  "cobrancaAsaasId" TEXT,
  "cobrancaMatriculaAsaasId" TEXT,
  "contaAsaasProfessorId" TEXT NOT NULL,
  "walletIdSnapshot" TEXT NOT NULL,
  "valorFixoSnapshot" DECIMAL(10,2) NOT NULL,
  "modalidadesSnapshot" JSONB NOT NULL,
  "externalReference" TEXT NOT NULL,
  "asaasSplitId" TEXT,
  "status" "StatusSplitPagamentoAsaas" NOT NULL DEFAULT 'PREPARADO',
  "statusAsaas" TEXT,
  "motivo" TEXT,
  "ultimoEventoAsaas" TEXT,
  "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "atualizadoEm" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SplitPagamentoAsaas_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SplitPagamentoAsaas_uma_cobranca_check" CHECK (
    (("cobrancaAsaasId" IS NOT NULL)::int + ("cobrancaMatriculaAsaasId" IS NOT NULL)::int) = 1
  ),
  CONSTRAINT "SplitPagamentoAsaas_valor_positivo_check" CHECK ("valorFixoSnapshot" > 0)
);

CREATE UNIQUE INDEX "SplitPagamentoAsaas_externalReference_key"
  ON "SplitPagamentoAsaas"("externalReference");
CREATE UNIQUE INDEX "SplitPagamentoAsaas_asaasSplitId_key"
  ON "SplitPagamentoAsaas"("asaasSplitId");
CREATE INDEX "SplitPagamentoAsaas_cobrancaAsaasId_idx"
  ON "SplitPagamentoAsaas"("cobrancaAsaasId");
CREATE INDEX "SplitPagamentoAsaas_cobrancaMatriculaAsaasId_idx"
  ON "SplitPagamentoAsaas"("cobrancaMatriculaAsaasId");
CREATE INDEX "SplitPagamentoAsaas_contaAsaasProfessorId_status_idx"
  ON "SplitPagamentoAsaas"("contaAsaasProfessorId", "status");
CREATE INDEX "SplitPagamentoAsaas_status_idx" ON "SplitPagamentoAsaas"("status");
CREATE UNIQUE INDEX "SplitPagamentoAsaas_cobranca_wallet_key"
  ON "SplitPagamentoAsaas"("cobrancaAsaasId", "walletIdSnapshot")
  WHERE "cobrancaAsaasId" IS NOT NULL;
CREATE UNIQUE INDEX "SplitPagamentoAsaas_matricula_wallet_key"
  ON "SplitPagamentoAsaas"("cobrancaMatriculaAsaasId", "walletIdSnapshot")
  WHERE "cobrancaMatriculaAsaasId" IS NOT NULL;

ALTER TABLE "SplitPagamentoAsaas"
  ADD CONSTRAINT "SplitPagamentoAsaas_cobrancaAsaasId_fkey"
  FOREIGN KEY ("cobrancaAsaasId") REFERENCES "CobrancaAsaas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SplitPagamentoAsaas"
  ADD CONSTRAINT "SplitPagamentoAsaas_cobrancaMatriculaAsaasId_fkey"
  FOREIGN KEY ("cobrancaMatriculaAsaasId") REFERENCES "CobrancaMatriculaAsaas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SplitPagamentoAsaas"
  ADD CONSTRAINT "SplitPagamentoAsaas_contaAsaasProfessorId_fkey"
  FOREIGN KEY ("contaAsaasProfessorId") REFERENCES "ContaAsaasProfessor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- O plano padrão alimenta o preço e o vínculo das novas matrículas públicas.
ALTER TABLE "Plano" ADD COLUMN "padrao" BOOLEAN NOT NULL DEFAULT false;

CREATE TEMPORARY TABLE "_PlanoPadraoGuard" (
  "ok" BOOLEAN NOT NULL CHECK ("ok" = true)
);
INSERT INTO "_PlanoPadraoGuard" ("ok")
SELECT EXISTS (
  SELECT 1
  FROM "Plano"
  WHERE "id" = 'plano-1-modalidade-de-luta'
    AND "valor" = 100.00
    AND "periodicidade" = 'MENSAL'
    AND "ativo" = true
);
DROP TABLE "_PlanoPadraoGuard";

CREATE UNIQUE INDEX "Plano_um_padrao_idx"
  ON "Plano" ("padrao")
  WHERE "padrao" = true;

ALTER TABLE "Plano"
  ADD CONSTRAINT "Plano_padrao_ativo_mensal_check"
  CHECK (NOT "padrao" OR ("ativo" AND "periodicidade" = 'MENSAL'));

UPDATE "Plano"
SET "padrao" = true,
    "atualizadoEm" = CURRENT_TIMESTAMP
WHERE "id" = 'plano-1-modalidade-de-luta';

-- Tokens opacos evitam expor os dados pessoais da solicitação na página pública de pagamento.
ALTER TABLE "SolicitacaoMatricula"
  ADD COLUMN "tokenAcompanhamento" TEXT,
  ADD COLUMN "planoId" TEXT;

UPDATE "SolicitacaoMatricula"
SET "tokenAcompanhamento" = "id"
WHERE "tokenAcompanhamento" IS NULL;

ALTER TABLE "SolicitacaoMatricula"
  ALTER COLUMN "tokenAcompanhamento" SET NOT NULL;

CREATE UNIQUE INDEX "SolicitacaoMatricula_tokenAcompanhamento_key"
  ON "SolicitacaoMatricula"("tokenAcompanhamento");
CREATE INDEX "SolicitacaoMatricula_planoId_idx"
  ON "SolicitacaoMatricula"("planoId");

ALTER TABLE "SolicitacaoMatricula"
  ADD CONSTRAINT "SolicitacaoMatricula_planoId_fkey"
  FOREIGN KEY ("planoId") REFERENCES "Plano"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "CobrancaMatriculaAsaas" (
  "id" TEXT NOT NULL,
  "solicitacaoId" TEXT NOT NULL,
  "mensalidadeId" TEXT,
  "status" "StatusCobrancaAsaas" NOT NULL DEFAULT 'CRIANDO',
  "geracao" INTEGER NOT NULL DEFAULT 1,
  "ativa" BOOLEAN NOT NULL DEFAULT true,
  "asaasCustomerId" TEXT,
  "asaasPaymentId" TEXT,
  "externalReference" TEXT NOT NULL,
  "competencia" TEXT NOT NULL,
  "valor" DECIMAL(10,2) NOT NULL,
  "vencimentoAsaas" TIMESTAMP(3) NOT NULL,
  "statusAsaas" TEXT,
  "pixCopiaECola" TEXT,
  "qrCodeExpiraEm" TIMESTAMP(3),
  "invoiceUrl" TEXT,
  "ultimoEventoAsaas" TEXT,
  "ultimoErro" TEXT,
  "recebidaEmAsaas" TIMESTAMP(3),
  "estornoParcialPendenteEm" TIMESTAMP(3),
  "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "atualizadoEm" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CobrancaMatriculaAsaas_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CobrancaMatriculaAsaas_mensalidadeId_key"
  ON "CobrancaMatriculaAsaas"("mensalidadeId");
CREATE UNIQUE INDEX "CobrancaMatriculaAsaas_asaasPaymentId_key"
  ON "CobrancaMatriculaAsaas"("asaasPaymentId");
CREATE UNIQUE INDEX "CobrancaMatriculaAsaas_externalReference_key"
  ON "CobrancaMatriculaAsaas"("externalReference");
CREATE UNIQUE INDEX "CobrancaMatriculaAsaas_solicitacaoId_geracao_key"
  ON "CobrancaMatriculaAsaas"("solicitacaoId", "geracao");
CREATE INDEX "CobrancaMatriculaAsaas_status_idx"
  ON "CobrancaMatriculaAsaas"("status");
CREATE INDEX "CobrancaMatriculaAsaas_solicitacaoId_ativa_idx"
  ON "CobrancaMatriculaAsaas"("solicitacaoId", "ativa");

ALTER TABLE "CobrancaMatriculaAsaas"
  ADD CONSTRAINT "CobrancaMatriculaAsaas_solicitacaoId_fkey"
  FOREIGN KEY ("solicitacaoId") REFERENCES "SolicitacaoMatricula"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CobrancaMatriculaAsaas"
  ADD CONSTRAINT "CobrancaMatriculaAsaas_mensalidadeId_fkey"
  FOREIGN KEY ("mensalidadeId") REFERENCES "Mensalidade"("id") ON DELETE SET NULL ON UPDATE CASCADE;

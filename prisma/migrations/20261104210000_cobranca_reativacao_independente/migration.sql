CREATE TABLE "CobrancaReativacaoAsaas" (
  "id" TEXT NOT NULL,
  "alunoId" TEXT NOT NULL,
  "planoId" TEXT NOT NULL,
  "planoNome" TEXT NOT NULL,
  "competencia" TEXT NOT NULL,
  "valor" DECIMAL(10,2) NOT NULL,
  "taxaAsaas" DECIMAL(10,2),
  "repasseSnapshot" JSONB NOT NULL,
  "status" "StatusCobrancaAsaas" NOT NULL DEFAULT 'CRIANDO',
  "ativa" BOOLEAN NOT NULL DEFAULT true,
  "operacaoPendente" TEXT,
  "externalReference" TEXT NOT NULL,
  "asaasCustomerId" TEXT,
  "asaasPaymentId" TEXT,
  "statusAsaas" TEXT,
  "vencimentoAsaas" TIMESTAMP(3) NOT NULL,
  "pixCopiaECola" TEXT,
  "qrCodeExpiraEm" TIMESTAMP(3),
  "recebidaEmAsaas" TIMESTAMP(3),
  "estornoParcialPendenteEm" TIMESTAMP(3),
  "ultimoErro" TEXT,
  "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "atualizadoEm" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CobrancaReativacaoAsaas_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CobrancaReativacaoAsaas_alunoId_fkey" FOREIGN KEY ("alunoId") REFERENCES "Aluno"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "CobrancaReativacaoAsaas_externalReference_key" ON "CobrancaReativacaoAsaas"("externalReference");
CREATE UNIQUE INDEX "CobrancaReativacaoAsaas_asaasPaymentId_key" ON "CobrancaReativacaoAsaas"("asaasPaymentId");
CREATE INDEX "CobrancaReativacaoAsaas_alunoId_ativa_idx" ON "CobrancaReativacaoAsaas"("alunoId", "ativa");
CREATE INDEX "CobrancaReativacaoAsaas_status_idx" ON "CobrancaReativacaoAsaas"("status");
CREATE UNIQUE INDEX "CobrancaReativacaoAsaas_uma_ativa_por_aluno" ON "CobrancaReativacaoAsaas"("alunoId") WHERE "ativa";
ALTER TABLE "SplitPagamentoAsaas" ADD COLUMN "cobrancaReativacaoAsaasId" TEXT;
ALTER TABLE "SplitPagamentoAsaas" DROP CONSTRAINT "SplitPagamentoAsaas_uma_cobranca_check";
ALTER TABLE "SplitPagamentoAsaas" ADD CONSTRAINT "SplitPagamentoAsaas_uma_cobranca_check" CHECK (
  (("cobrancaAsaasId" IS NOT NULL)::int + ("cobrancaMatriculaAsaasId" IS NOT NULL)::int + ("cobrancaReativacaoAsaasId" IS NOT NULL)::int) = 1
);
CREATE INDEX "SplitPagamentoAsaas_cobrancaReativacaoAsaasId_idx" ON "SplitPagamentoAsaas"("cobrancaReativacaoAsaasId");
ALTER TABLE "SplitPagamentoAsaas" ADD CONSTRAINT "SplitPagamentoAsaas_cobrancaReativacaoAsaasId_fkey" FOREIGN KEY ("cobrancaReativacaoAsaasId") REFERENCES "CobrancaReativacaoAsaas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

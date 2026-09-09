CREATE TABLE "ContaAsaasLoja" (
  "id" TEXT NOT NULL DEFAULT 'principal',
  "nomeTitular" TEXT NOT NULL,
  "emailContaAsaas" TEXT NOT NULL,
  "cpfCnpj" TEXT NOT NULL,
  "dataNascimento" TIMESTAMP(3) NOT NULL,
  "celular" TEXT NOT NULL,
  "rendaMensal" DECIMAL(12,2) NOT NULL,
  "logradouro" TEXT NOT NULL,
  "numeroEndereco" TEXT NOT NULL,
  "complemento" TEXT,
  "bairro" TEXT NOT NULL,
  "cep" TEXT NOT NULL,
  "status" "StatusContaAsaasLoja" NOT NULL DEFAULT 'CRIANDO',
  "asaasAccountId" TEXT,
  "walletId" TEXT,
  "consentimentoVersao" TEXT,
  "consentidoEm" TIMESTAMP(3),
  "solicitadoEm" TIMESTAMP(3),
  "ultimoErro" TEXT,
  "statusGeralAsaas" TEXT,
  "ultimoEventoAsaas" TEXT,
  "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "atualizadoEm" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ContaAsaasLoja_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ContaAsaasLoja_singleton_check" CHECK ("id" = 'principal'),
  CONSTRAINT "ContaAsaasLoja_rendaMensal_check" CHECK ("rendaMensal" > 0),
  CONSTRAINT "ContaAsaasLoja_cpfCnpj_check" CHECK ("cpfCnpj" ~ '^[0-9]{11}$'),
  CONSTRAINT "ContaAsaasLoja_celular_check" CHECK ("celular" ~ '^[0-9]{10,11}$'),
  CONSTRAINT "ContaAsaasLoja_cep_check" CHECK ("cep" ~ '^[0-9]{8}$'),
  CONSTRAINT "ContaAsaasLoja_habilitada_check" CHECK (
    "status" <> 'HABILITADA' OR ("asaasAccountId" IS NOT NULL AND "walletId" IS NOT NULL)
  )
);

CREATE UNIQUE INDEX "ContaAsaasLoja_emailContaAsaas_key" ON "ContaAsaasLoja"("emailContaAsaas");
CREATE UNIQUE INDEX "ContaAsaasLoja_asaasAccountId_key" ON "ContaAsaasLoja"("asaasAccountId");
CREATE UNIQUE INDEX "ContaAsaasLoja_walletId_key" ON "ContaAsaasLoja"("walletId");
CREATE INDEX "ContaAsaasLoja_status_idx" ON "ContaAsaasLoja"("status");

CREATE TABLE "PedidoLoja" (
  "id" TEXT NOT NULL,
  "referencia" TEXT NOT NULL,
  "descricao" TEXT NOT NULL,
  "valorTotal" DECIMAL(10,2) NOT NULL,
  "status" "StatusPedidoLoja" NOT NULL DEFAULT 'RASCUNHO',
  "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "atualizadoEm" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "PedidoLoja_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PedidoLoja_valor_positivo_check" CHECK ("valorTotal" > 0)
);

CREATE UNIQUE INDEX "PedidoLoja_referencia_key" ON "PedidoLoja"("referencia");
CREATE INDEX "PedidoLoja_status_criadoEm_idx" ON "PedidoLoja"("status", "criadoEm");

CREATE TABLE "CobrancaLojaAsaas" (
  "id" TEXT NOT NULL,
  "pedidoId" TEXT NOT NULL,
  "geracao" INTEGER NOT NULL DEFAULT 1,
  "ativa" BOOLEAN NOT NULL DEFAULT true,
  "valor" DECIMAL(10,2) NOT NULL,
  "status" "StatusCobrancaAsaas" NOT NULL DEFAULT 'CRIANDO',
  "asaasCustomerId" TEXT,
  "asaasPaymentId" TEXT,
  "externalReference" TEXT NOT NULL,
  "vencimentoAsaas" TIMESTAMP(3),
  "statusAsaas" TEXT,
  "pixCopiaECola" TEXT,
  "qrCodeExpiraEm" TIMESTAMP(3),
  "invoiceUrl" TEXT,
  "recebidaEmAsaas" TIMESTAMP(3),
  "ultimoEventoAsaas" TEXT,
  "ultimoErro" TEXT,
  "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "atualizadoEm" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "CobrancaLojaAsaas_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CobrancaLojaAsaas_valor_positivo_check" CHECK ("valor" > 0)
);

CREATE UNIQUE INDEX "CobrancaLojaAsaas_asaasPaymentId_key" ON "CobrancaLojaAsaas"("asaasPaymentId");
CREATE UNIQUE INDEX "CobrancaLojaAsaas_externalReference_key" ON "CobrancaLojaAsaas"("externalReference");
CREATE UNIQUE INDEX "CobrancaLojaAsaas_pedidoId_geracao_key" ON "CobrancaLojaAsaas"("pedidoId", "geracao");
CREATE INDEX "CobrancaLojaAsaas_pedidoId_ativa_idx" ON "CobrancaLojaAsaas"("pedidoId", "ativa");
CREATE INDEX "CobrancaLojaAsaas_status_criadoEm_idx" ON "CobrancaLojaAsaas"("status", "criadoEm");
CREATE UNIQUE INDEX "CobrancaLojaAsaas_uma_ativa_por_pedido_key"
  ON "CobrancaLojaAsaas"("pedidoId") WHERE "ativa" = true;

ALTER TABLE "CobrancaLojaAsaas"
  ADD CONSTRAINT "CobrancaLojaAsaas_pedidoId_fkey"
  FOREIGN KEY ("pedidoId") REFERENCES "PedidoLoja"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "SplitLojaAsaas" (
  "id" TEXT NOT NULL,
  "cobrancaId" TEXT NOT NULL,
  "contaAsaasLojaId" TEXT NOT NULL,
  "walletIdSnapshot" TEXT NOT NULL,
  "percentualSplitSnapshot" DECIMAL(5,2) NOT NULL DEFAULT 100.00,
  "externalReference" TEXT NOT NULL,
  "asaasSplitId" TEXT,
  "status" "StatusSplitPagamentoAsaas" NOT NULL DEFAULT 'PREPARADO',
  "statusAsaas" TEXT,
  "motivo" TEXT,
  "ultimoEventoAsaas" TEXT,
  "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "atualizadoEm" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "SplitLojaAsaas_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SplitLojaAsaas_percentual_total_check" CHECK ("percentualSplitSnapshot" = 100.00)
);

CREATE UNIQUE INDEX "SplitLojaAsaas_cobrancaId_key" ON "SplitLojaAsaas"("cobrancaId");
CREATE UNIQUE INDEX "SplitLojaAsaas_externalReference_key" ON "SplitLojaAsaas"("externalReference");
CREATE UNIQUE INDEX "SplitLojaAsaas_asaasSplitId_key" ON "SplitLojaAsaas"("asaasSplitId");
CREATE INDEX "SplitLojaAsaas_contaAsaasLojaId_status_idx" ON "SplitLojaAsaas"("contaAsaasLojaId", "status");
CREATE INDEX "SplitLojaAsaas_status_idx" ON "SplitLojaAsaas"("status");

ALTER TABLE "SplitLojaAsaas"
  ADD CONSTRAINT "SplitLojaAsaas_cobrancaId_fkey"
  FOREIGN KEY ("cobrancaId") REFERENCES "CobrancaLojaAsaas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "SplitLojaAsaas"
  ADD CONSTRAINT "SplitLojaAsaas_contaAsaasLojaId_fkey"
  FOREIGN KEY ("contaAsaasLojaId") REFERENCES "ContaAsaasLoja"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

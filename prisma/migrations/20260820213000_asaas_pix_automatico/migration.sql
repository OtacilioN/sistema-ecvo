CREATE TYPE "TipoCobrancaPix" AS ENUM ('MENSAL', 'AUTOMATICO_SEMESTRAL');
CREATE TYPE "TipoPagadorAsaas" AS ENUM ('ALUNO', 'RESPONSAVEL');
CREATE TYPE "StatusContratoPixAutomatico" AS ENUM ('CRIANDO', 'PENDENTE_AUTORIZACAO', 'ATIVO', 'CONCLUIDO', 'CANCELADO', 'RECUSADO', 'EXPIRADO', 'ERRO');
CREATE TYPE "TipoCobrancaAsaas" AS ENUM ('PIX_MENSAL', 'PIX_AUTOMATICO_INICIAL', 'PIX_AUTOMATICO_RECORRENTE');
CREATE TYPE "StatusCobrancaAsaas" AS ENUM ('CRIANDO', 'PENDENTE', 'RECEBIDA', 'VENCIDA', 'CANCELADA', 'RECUSADA', 'ESTORNADA', 'ERRO');

ALTER TABLE "Aluno"
ADD COLUMN "tipoCobrancaPix" "TipoCobrancaPix" NOT NULL DEFAULT 'MENSAL';

ALTER TABLE "Mensalidade"
ADD COLUMN "contratoPixAutomaticoId" TEXT,
ADD COLUMN "numeroCicloPix" INTEGER;

CREATE TABLE "ContratoPixAutomatico" (
  "id" TEXT NOT NULL,
  "alunoId" TEXT NOT NULL,
  "asaasAuthorizationId" TEXT,
  "asaasConciliationId" TEXT,
  "status" "StatusContratoPixAutomatico" NOT NULL DEFAULT 'CRIANDO',
  "inicio" TIMESTAMP(3) NOT NULL,
  "fim" TIMESTAMP(3) NOT NULL,
  "valor" DECIMAL(10,2) NOT NULL,
  "totalCiclos" INTEGER NOT NULL DEFAULT 6,
  "pixCopiaECola" TEXT,
  "qrCodeExpiraEm" TIMESTAMP(3),
  "ultimoErro" TEXT,
  "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "atualizadoEm" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ContratoPixAutomatico_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ClienteAsaas" (
  "id" TEXT NOT NULL,
  "alunoId" TEXT NOT NULL,
  "asaasCustomerId" TEXT NOT NULL,
  "tipoPagador" "TipoPagadorAsaas" NOT NULL,
  "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "atualizadoEm" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ClienteAsaas_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CobrancaAsaas" (
  "id" TEXT NOT NULL,
  "mensalidadeId" TEXT NOT NULL,
  "contratoPixAutomaticoId" TEXT,
  "tipo" "TipoCobrancaAsaas" NOT NULL,
  "status" "StatusCobrancaAsaas" NOT NULL DEFAULT 'CRIANDO',
  "asaasPaymentId" TEXT,
  "externalReference" TEXT NOT NULL,
  "statusAsaas" TEXT,
  "pixCopiaECola" TEXT,
  "qrCodeExpiraEm" TIMESTAMP(3),
  "invoiceUrl" TEXT,
  "ultimoEventoAsaas" TEXT,
  "ultimoErro" TEXT,
  "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "atualizadoEm" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CobrancaAsaas_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EventoWebhookAsaas" (
  "asaasEventId" TEXT NOT NULL,
  "evento" TEXT NOT NULL,
  "asaasPaymentId" TEXT,
  "asaasAuthorizationId" TEXT,
  "processadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EventoWebhookAsaas_pkey" PRIMARY KEY ("asaasEventId")
);

CREATE UNIQUE INDEX "ContratoPixAutomatico_asaasAuthorizationId_key" ON "ContratoPixAutomatico"("asaasAuthorizationId");
CREATE INDEX "ContratoPixAutomatico_status_idx" ON "ContratoPixAutomatico"("status");
CREATE INDEX "ContratoPixAutomatico_alunoId_criadoEm_idx" ON "ContratoPixAutomatico"("alunoId", "criadoEm");
CREATE UNIQUE INDEX "ContratoPixAutomatico_alunoId_aberto_key"
ON "ContratoPixAutomatico"("alunoId")
WHERE "status" IN ('CRIANDO', 'PENDENTE_AUTORIZACAO', 'ATIVO');
CREATE UNIQUE INDEX "ClienteAsaas_alunoId_key" ON "ClienteAsaas"("alunoId");
CREATE UNIQUE INDEX "ClienteAsaas_asaasCustomerId_key" ON "ClienteAsaas"("asaasCustomerId");
CREATE UNIQUE INDEX "CobrancaAsaas_mensalidadeId_key" ON "CobrancaAsaas"("mensalidadeId");
CREATE UNIQUE INDEX "CobrancaAsaas_asaasPaymentId_key" ON "CobrancaAsaas"("asaasPaymentId");
CREATE UNIQUE INDEX "CobrancaAsaas_externalReference_key" ON "CobrancaAsaas"("externalReference");
CREATE INDEX "CobrancaAsaas_contratoPixAutomaticoId_idx" ON "CobrancaAsaas"("contratoPixAutomaticoId");
CREATE INDEX "CobrancaAsaas_status_idx" ON "CobrancaAsaas"("status");
CREATE UNIQUE INDEX "Mensalidade_contratoPixAutomaticoId_numeroCicloPix_key" ON "Mensalidade"("contratoPixAutomaticoId", "numeroCicloPix");
CREATE INDEX "Mensalidade_contratoPixAutomaticoId_idx" ON "Mensalidade"("contratoPixAutomaticoId");
CREATE INDEX "EventoWebhookAsaas_evento_idx" ON "EventoWebhookAsaas"("evento");
CREATE INDEX "EventoWebhookAsaas_processadoEm_idx" ON "EventoWebhookAsaas"("processadoEm");

ALTER TABLE "ContratoPixAutomatico"
ADD CONSTRAINT "ContratoPixAutomatico_alunoId_fkey"
FOREIGN KEY ("alunoId") REFERENCES "Aluno"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ClienteAsaas"
ADD CONSTRAINT "ClienteAsaas_alunoId_fkey"
FOREIGN KEY ("alunoId") REFERENCES "Aluno"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Mensalidade"
ADD CONSTRAINT "Mensalidade_contratoPixAutomaticoId_fkey"
FOREIGN KEY ("contratoPixAutomaticoId") REFERENCES "ContratoPixAutomatico"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "CobrancaAsaas"
ADD CONSTRAINT "CobrancaAsaas_mensalidadeId_fkey"
FOREIGN KEY ("mensalidadeId") REFERENCES "Mensalidade"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CobrancaAsaas"
ADD CONSTRAINT "CobrancaAsaas_contratoPixAutomaticoId_fkey"
FOREIGN KEY ("contratoPixAutomaticoId") REFERENCES "ContratoPixAutomatico"("id") ON DELETE SET NULL ON UPDATE CASCADE;
